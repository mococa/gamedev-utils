import { defineComponent } from "../../../src/ecs/component";
import { BinaryCodec } from "../../../src/core/binary-codec";
import { World } from "../../../src/ecs/world";

// Define components
const Transform2D = defineComponent("Transform2D", {
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  rotation: BinaryCodec.f32,
});

const Velocity = defineComponent("Velocity", {
  vx: BinaryCodec.f32,
  vy: BinaryCodec.f32,
});

// Simple random number generator
class SimpleRng {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  nextF32(): number {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    return (((this.seed / 65536) >>> 0) % 32768) / 32768.0;
  }
}

function runBenchmark(entityCount: number): { avg: number; min: number; max: number } {
  const world = new World({
    maxEntities: entityCount,
    components: [Transform2D, Velocity],
  });

  // Register systems using addSystem API
  world
    .addSystem()
    .with(Transform2D, Velocity)
    .fields([
      { transform2d: ['x', 'y'] },
      { velocity: ['vx', 'vy'] }
    ])
    .run((entity, deltaTime) => {
      const transform = entity.transform2d;
      const velocity = entity.velocity;

      transform.x += velocity.vx * deltaTime;
      transform.y += velocity.vy * deltaTime;
    });

  world
    .addSystem()
    .with(Transform2D, Velocity)
    .fields([
      { transform2d: ['rotation'] },
      { velocity: ['vx', 'vy'] }
    ])
    .run((entity, _deltaTime) => {
      const transform = entity.transform2d;
      const velocity = entity.velocity;

      if (velocity.vx !== 0 || velocity.vy !== 0) {
        transform.rotation = Math.atan2(velocity.vy, velocity.vx);
      }
    });

  world
    .addSystem()
    .with(Transform2D)
    .fields([
      { transform2d: ['x', 'y'] }
    ])
    .run((entity, _deltaTime) => {
      const transform = entity.transform2d;

      if (transform.x < 0) transform.x = 1000;
      if (transform.x > 1000) transform.x = 0;
      if (transform.y < 0) transform.y = 1000;
      if (transform.y > 1000) transform.y = 0;
    });

  world
    .addSystem()
    .with(Velocity)
    .fields([
      { velocity: ['vx', 'vy'] }
    ])
    .run((entity, _deltaTime) => {
      const velocity = entity.velocity;

      velocity.vx *= 0.99;
      velocity.vy *= 0.99;
    });

  // Setup entities
  const rng = new SimpleRng(12345);

  for (let i = 0; i < entityCount; i++) {
    const entity = world.spawn();

    world.add(entity, Transform2D, {
      x: rng.nextF32() * 1000,
      y: rng.nextF32() * 1000,
      rotation: rng.nextF32() * Math.PI * 2,
    });

    world.add(entity, Velocity, {
      vx: rng.nextF32() * 10 - 5,
      vy: rng.nextF32() * 10 - 5,
    });
  }

  // Run simulation for 60 frames
  const frameCount = 60;
  const deltaTime = 0.016;
  const frameTimes: number[] = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const frameStart = performance.now();

    // Execute all systems
    world.runSystems(deltaTime);

    const frameTime = performance.now() - frameStart;
    frameTimes.push(frameTime);
  }

  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const min = Math.min(...frameTimes);
  const max = Math.max(...frameTimes);

  return { avg, min, max };
}

function main() {
  console.log("Murow addSystem API Benchmark - 4 Systems\n");
  console.log("Running 5 iterations per entity count for averaging...\n");

  const entityCounts = [500, 1000, 5000, 10000, 25000, 50000];

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
