import {
  createWorld,
  addEntity,
  addComponent,
  removeEntity,
  query,
  type World,
} from "bitecs";

// Define components matching Murow's benchmark (SoA format)
const Transform2D = {
  x: [] as number[],
  y: [] as number[],
  rotation: [] as number[],
};

const Velocity = {
  vx: [] as number[],
  vy: [] as number[],
};

const Health = {
  current: [] as number[],
  max: [] as number[],
};

const Armor = {
  value: [] as number[],
};

const Damage = {
  amount: [] as number[],
};

const Cooldown = {
  current: [] as number[],
  max: [] as number[],
};

const Team = {
  id: [] as number[],
};

const Target = {
  entityId: [] as number[],
};

const Status = {
  stunned: [] as number[],
  slowed: [] as number[],
};

const Lifetime = {
  remaining: [] as number[],
};

// Simple random number generator for deterministic benchmarking
class SimpleRng {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  nextF32(): number {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    return (((this.seed / 65536) >>> 0) % 32768) / 32768.0;
  }

  nextU16(): number {
    return Math.floor(this.nextF32() * 65535);
  }

  nextU8(): number {
    return Math.floor(this.nextF32() * 255);
  }
}

// System implementations
function movementSystem(world: World, deltaTime: number): void {
  const entities = query(world, [Transform2D, Velocity]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    Transform2D.x[eid]! += Velocity.vx[eid]! * deltaTime;
    Transform2D.y[eid]! += Velocity.vy[eid]! * deltaTime;
  }
}

function rotationSystem(world: World): void {
  const entities = query(world, [Transform2D, Velocity]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    const vx = Velocity.vx[eid]!;
    const vy = Velocity.vy[eid]!;

    if (vx !== 0 || vy !== 0) {
      Transform2D.rotation[eid] = Math.atan2(vy, vx);
    }
  }
}

function boundarySystem(world: World): void {
  const entities = query(world, [Transform2D]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;

    if (Transform2D.x[eid]! < 0) Transform2D.x[eid] = 1000;
    if (Transform2D.x[eid]! > 1000) Transform2D.x[eid] = 0;
    if (Transform2D.y[eid]! < 0) Transform2D.y[eid] = 1000;
    if (Transform2D.y[eid]! > 1000) Transform2D.y[eid] = 0;
  }
}

function healthRegenSystem(world: World, frame: number): void {
  if (frame % 30 === 0) {
    const entities = query(world, [Health]);
    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i]!;
      const current = Health.current[eid]!;
      const max = Health.max[eid]!;

      if (current > 0 && current < max) {
        const newHealth = current + 5;
        Health.current[eid] = newHealth > max ? max : newHealth;
      }
    }
  }
}

function cooldownSystem(world: World, deltaTime: number): void {
  const entities = query(world, [Cooldown]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    if (Cooldown.current[eid]! > 0) {
      const newCooldown = Cooldown.current[eid]! - deltaTime;
      Cooldown.current[eid] = newCooldown < 0 ? 0 : newCooldown;
    }
  }
}

// Track active entities globally
let activeEntities = new Set<number>();

function combatSystem(world: World, frame: number): void {
  if (frame % 5 === 0) {
    const entities = query(world, [Cooldown, Damage, Target]);
    const updates: Array<{ targetId: number; newHealth: number; attackerId: number }> = [];

    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i]!;
      const cooldown = Cooldown.current[eid]!;
      const damage = Damage.amount[eid]!;
      const targetId = Target.entityId[eid]!;

      if (cooldown === 0 && activeEntities.has(targetId) && Health.current[targetId] !== undefined) {
        let damageDealt = damage;

        // Apply armor reduction
        if (Armor.value[targetId] !== undefined) {
          const reduced = damage - Armor.value[targetId] * 0.1;
          damageDealt = reduced < 1 ? 1 : Math.floor(reduced);
        }

        const targetHealth = Health.current[targetId];
        const newHealth = targetHealth > damageDealt ? targetHealth - damageDealt : 0;

        updates.push({ targetId, newHealth, attackerId: eid });
      }
    }

    // Apply all updates
    for (const { targetId, newHealth, attackerId } of updates) {
      if (activeEntities.has(targetId)) {
        Health.current[targetId] = newHealth;
      }
      // Reset cooldown
      Cooldown.current[attackerId] = Cooldown.max[attackerId]!;
    }
  }
}

function deathSystem(world: World): void {
  const entities = query(world, [Health]);
  const toRemove: number[] = [];

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    if (Health.current[eid] === 0) {
      toRemove.push(eid);
    }
  }

  for (const eid of toRemove) {
    removeEntity(world, eid);
    activeEntities.delete(eid);
  }
}

function statusEffectSystem(world: World): void {
  const entities = query(world, [Status, Velocity]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    const stunned = Status.stunned[eid];
    const slowed = Status.slowed[eid];

    if (stunned === 1) {
      Velocity.vx[eid] = 0;
      Velocity.vy[eid] = 0;
    } else if (slowed === 1) {
      Velocity.vx[eid]! *= 0.5;
      Velocity.vy[eid]! *= 0.5;
    }
  }
}

function lifetimeSystem(world: World, deltaTime: number): void {
  const entities = query(world, [Lifetime]);
  const expiredEntities: number[] = [];

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    const remaining = Lifetime.remaining[eid]! - deltaTime;

    if (remaining <= 0) {
      expiredEntities.push(eid);
    } else {
      Lifetime.remaining[eid] = remaining;
    }
  }

  for (const eid of expiredEntities) {
    removeEntity(world, eid);
    activeEntities.delete(eid);
  }
}

function velocityDampingSystem(world: World): void {
  const entities = query(world, [Velocity]);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]!;
    Velocity.vx[eid]! *= 0.99;
    Velocity.vy[eid]! *= 0.99;
  }
}

function aiBehaviorSystem(world: World, frame: number): void {
  if (frame % 20 === 0) {
    const rng = new SimpleRng(frame);
    const entities = query(world, [Velocity]);

    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i]!;
      if (rng.nextF32() > 0.9) {
        Velocity.vx[eid]! += (rng.nextF32() - 0.5) * 2;
        Velocity.vy[eid]! += (rng.nextF32() - 0.5) * 2;
      }
    }
  }
}

function runBenchmark(entityCount: number): { avg: number; min: number; max: number } {
  const world = createWorld();
  activeEntities = new Set<number>();

  // Setup entities
  const rng = new SimpleRng(12345);
  const entities: number[] = [];

  for (let i = 0; i < entityCount; i++) {
    const eid = addEntity(world);
    entities.push(eid);
    activeEntities.add(eid);

    addComponent(world, eid, Transform2D);
    Transform2D.x[eid] = rng.nextF32() * 1000;
    Transform2D.y[eid] = rng.nextF32() * 1000;
    Transform2D.rotation[eid] = rng.nextF32() * Math.PI * 2;

    addComponent(world, eid, Velocity);
    Velocity.vx[eid] = rng.nextF32() * 10 - 5;
    Velocity.vy[eid] = rng.nextF32() * 10 - 5;

    addComponent(world, eid, Health);
    Health.current[eid] = 100;
    Health.max[eid] = 100;

    // 80% have armor
    if (rng.nextF32() > 0.2) {
      addComponent(world, eid, Armor);
      Armor.value[eid] = Math.floor(rng.nextF32() * 50);
    }

    // 60% can deal damage
    if (rng.nextF32() > 0.4) {
      const targetEntity = Math.floor(rng.nextF32() * entityCount);
      addComponent(world, eid, Damage);
      Damage.amount[eid] = Math.floor(rng.nextF32() * 20) + 10;

      addComponent(world, eid, Cooldown);
      Cooldown.current[eid] = 0;
      Cooldown.max[eid] = 1.0;

      addComponent(world, eid, Target);
      Target.entityId[eid] = targetEntity;
    }

    // Assign to teams
    addComponent(world, eid, Team);
    Team.id[eid] = Math.floor(rng.nextF32() * 4);

    // 20% have status effects
    if (rng.nextF32() > 0.8) {
      addComponent(world, eid, Status);
      Status.stunned[eid] = rng.nextF32() > 0.5 ? 1 : 0;
      Status.slowed[eid] = rng.nextF32() > 0.5 ? 1 : 0;
    }

    // 15% are temporary entities
    if (rng.nextF32() > 0.85) {
      addComponent(world, eid, Lifetime);
      Lifetime.remaining[eid] = rng.nextF32() * 5;
    }
  }

  // Run simulation for 60 frames
  const frameCount = 60;
  const deltaTime = 0.016;
  const frameTimes: number[] = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const frameStart = performance.now();

    // Run all systems in order
    movementSystem(world, deltaTime);
    rotationSystem(world);
    boundarySystem(world);
    healthRegenSystem(world, frame);
    cooldownSystem(world, deltaTime);
    combatSystem(world, frame);
    deathSystem(world);
    statusEffectSystem(world);
    lifetimeSystem(world, deltaTime);
    velocityDampingSystem(world);
    aiBehaviorSystem(world, frame);

    const frameTime = performance.now() - frameStart;
    frameTimes.push(frameTime);
  }

  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const min = Math.min(...frameTimes);
  const max = Math.max(...frameTimes);

  return { avg, min, max };
}

function main() {
  console.log("bitECS Benchmark - Complex Game Simulation (11 Systems)\n");
  console.log("Running 5 iterations per entity count for averaging...\n");

  const entityCounts = [500, 1_000, 5_000, 10_000, 15_000, 25_000, 50_000, 100_000];

  console.log("| Entity Count | Avg Time | FPS | Min | Max |");
  console.log("|--------------|----------|-----|-----|-----|");

  for (const count of entityCounts) {
    // Run 5 times and average
    const allAvgs: number[] = [];
    const allMins: number[] = [];
    const allMaxs: number[] = [];

    for (let run = 0; run < 5; run++) {
      console.error(`  Run ${run + 1}/5 for ${count} entities...`);
      const { avg, min, max } = runBenchmark(count);
      allAvgs.push(avg);
      allMins.push(min);
      allMaxs.push(max);
    }

    const finalAvg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
    const finalMin = Math.min(...allMins);
    const finalMax = Math.max(...allMaxs);
    const fps = Math.floor(1000 / finalAvg);

    console.log(
      `| ${count.toString().padStart(12)} | ${finalAvg.toFixed(2)}ms | ${fps.toString().padStart(3)} | ${finalMin.toFixed(2)}ms | ${finalMax.toFixed(2)}ms |`
    );
  }
}

main();
