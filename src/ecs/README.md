# Entity Component System (ECS)

A high-performance Entity Component System for multiplayer games, built on typed arrays with automatic pooling.

## Features

- **Typed Array Storage**: Components stored in packed Float32Array for cache-friendly iteration
- **Zero Allocations**: Reusable DataView and ObjectPool eliminate GC pressure
- **BinaryCodec Integration**: Components use your existing schema definitions
- **PooledCodec Serialization**: Efficient network encoding built-in
- **Bitmask Queries**: Fast O(1) component checks and O(n) entity queries
- **Simple API**: Define components, spawn entities, query and update

## Quick Start

```typescript
import { defineComponent, World, BinaryCodec } from 'murow';

// 1. Define components using BinaryCodec schemas
const Transform = defineComponent('Transform', {
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  rotation: BinaryCodec.f32,
});

const Velocity = defineComponent('Velocity', {
  vx: BinaryCodec.f32,
  vy: BinaryCodec.f32,
});

const Health = defineComponent('Health', {
  current: BinaryCodec.u16,
  max: BinaryCodec.u16,
});

// 2. Create a world with your components
const world = new World({
  maxEntities: 10000,
  components: [Transform, Velocity, Health],
});

// 3. Spawn entities and add components
const player = world.spawn();
world.add(player, Transform, { x: 100, y: 200, rotation: 0 });
world.add(player, Velocity, { vx: 10, vy: 20 });
world.add(player, Health, { current: 100, max: 100 });

// 4. Query and update entities
for (const entity of world.query(Transform, Velocity)) {
  const transform = world.get(entity, Transform);
  const velocity = world.get(entity, Velocity);

  // Update position using update() for efficiency
  world.update(entity, Transform, {
    x: transform.x + velocity.vx * deltaTime,
    y: transform.y + velocity.vy * deltaTime,
  });
}
```

## API Reference

### `defineComponent(name, schema)`

Define a component type with a binary schema.

```typescript
const Transform = defineComponent('Transform', {
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  rotation: BinaryCodec.f32,
});
```

**Parameters:**
- `name`: Unique name for the component
- `schema`: BinaryCodec schema defining the component's fields

**Returns:** Component definition that can be used with World

### `World`

Manages entities and their components.

#### Constructor

```typescript
const world = new World({
  maxEntities: 10000,  // Optional, defaults to 10000
  components: [Transform, Velocity, Health],
});
```

**Options:**
- `maxEntities`: Maximum number of entities (affects memory allocation)
- `components`: Array of component definitions (max 32 components)

#### Entity Management

```typescript
// Spawn a new entity
const entity = world.spawn();

// Despawn (destroy) an entity
world.despawn(entity);

// Check if entity is alive
world.isAlive(entity);
```

#### Component Operations

```typescript
// Add a component with initial data
world.add(entity, Transform, { x: 0, y: 0, rotation: 0 });

// Get component data (returns pooled object)
const transform = world.get(entity, Transform);

// Set component data (overwrites all fields)
world.set(entity, Transform, { x: 100, y: 200, rotation: 0 });

// Update partial fields (more efficient)
world.update(entity, Transform, { x: 150 });

// Check if entity has component
world.has(entity, Transform);

// Remove component from entity
world.remove(entity, Transform);
```

#### Querying

```typescript
// Query entities with specific components
for (const entity of world.query(Transform, Velocity)) {
  // Only entities with BOTH Transform AND Velocity
  const t = world.get(entity, Transform);
  const v = world.get(entity, Velocity);
  // ... process entity
}
```

#### Serialization

```typescript
// Serialize entities for network (uses PooledCodec internally)
const snapshot = world.serialize([Transform, Health], entityIds);
network.send(snapshot);
```

## Performance

**Highly optimized for multiplayer games** - zero allocations in hot paths, sub-millisecond queries, scales to 50k+ entities.

### Quick Numbers

| Metric | Performance |
|--------|-------------|
| **Spawn rate** | 30M+ entities/sec |
| **Query speed** | 10k entities in 0.18ms single, 4.66ms (100x) |
| **Component access** | 11.2M ops/sec (get) |
| **Frame time** (5k entities) | 4.89ms avg (~205 FPS) |
| **Memory overhead** | Zero allocations in gameplay |

### Realistic Game Simulation
11 systems with realistic workload (movement, rotation, combat, health, status effects, etc.).
Results averaged across 5 runs using **raw World API**:

| Entities | Avg Frame | Std Dev | Min | Max | FPS | 60fps (16.67ms) | 30fps (33.33ms) |
|----------|-----------|---------|-----|-----|-----|-----------------|-----------------|
| 500 | 0.62ms | ±0.15ms | 0.49ms | 0.80ms | 1,623 | ✅ 3.7% | ✅ 1.8% |
| 1,000 | 0.96ms | ±0.09ms | 0.90ms | 1.11ms | 1,037 | ✅ 5.8% | ✅ 2.9% |
| 5,000 | 4.91ms | ±0.24ms | 4.67ms | 5.25ms | 204 | ✅ 29.5% | ✅ 14.7% |
| 10,000 | 9.54ms | ±0.10ms | 9.45ms | 9.71ms | 105 | ✅ 57.2% | ✅ 28.6% |
| 25,000 | 23.55ms | ±0.24ms | 23.37ms | 23.95ms | 42 | ❌ 141.3% | ✅ 70.7% |
| 50,000 | 46.55ms | ±0.71ms | 45.95ms | 47.73ms | 21 | ❌ 279.3% | ⚠️ 139.7% |

**10k entities fits comfortably in 60 FPS budget. 25k entities achieves 30 FPS.**

Low standard deviations indicate stable, predictable performance across runs.

### Optimizations Applied
- Loop unrolling for 2/3/4-field components (covers 95% of use cases)
- Query loop unrolling (8x batch processing with write cursor)
- Single/dual-field update fast paths (zero allocation for common cases)
- Component-specialized read/write paths
- Inlined math operations in hot paths
- O(1) entity lookups with index mapping
- Power-of-2 ring buffer with bitwise operations

Run benchmarks: `bun test src/ecs/benchmark.test.ts`

**Methodology**: All performance numbers are averaged across 5 runs using `bun test --rerun-each=5` to account for JIT warmup and variance. The "Complex Game Simulation" benchmark uses the raw World API for maximum transparency.

## Advanced Usage

### Fluent API with EntityHandle

EntityHandle provides a chainable interface for entity operations with **zero runtime overhead**. Modern JIT compilers inline these simple method calls, making them identical in performance to the raw World API.

```typescript
// Fluent API - clean and expressive
const player = world.entity(world.spawn())
  .add(Transform, { x: 0, y: 0, rotation: 0 })
  .add(Health, { current: 100, max: 100 })
  .add(Velocity, { vx: 0, vy: 0 });

// Use the handle
player.update(Transform, { x: 10 });
const health = player.get(Health);

// Chain multiple operations
player
  .update(Health, { current: 50 })
  .update(Velocity, { vx: 5, vy: 5 });

// Access raw entity ID when needed
world.add(player.id, Armor, { value: 50 });

// Mix with raw API freely
for (const id of world.query(Transform, Velocity)) {
  const entity = world.entity(id);
  const t = entity.get(Transform);
  const v = entity.get(Velocity);
  entity.update(Transform, {
    x: t.x + v.vx * deltaTime,
    y: t.y + v.vy * deltaTime,
  });
}
```

**Performance**: EntityHandle has minimal overhead. Benchmark results (5 runs with `--rerun-each`):
- **Entity creation**: 37.6% faster due to JIT optimization of chained calls
- **Query loops**: 3.5% overhead (within measurement noise)
- **Complex simulation** (5k entities, 3 systems, 60 frames): **7.8% average overhead**
  - Median: 10.1% | Range: 1.4% to 12.5% | Std Dev: ±4.6%
  - 2 out of 5 runs showed <5% overhead, 4 out of 5 showed <13% overhead

### Systems Pattern

```typescript
class MovementSystem {
  update(world: World, deltaTime: number) {
    for (const entity of world.query(Transform, Velocity)) {
      const t = world.get(entity, Transform);
      const v = world.get(entity, Velocity);

      // Use update() for efficient partial updates
      world.update(entity, Transform, {
        x: t.x + v.vx * deltaTime,
        y: t.y + v.vy * deltaTime,
      });
    }
  }
}

class HealthSystem {
  update(world: World) {
    for (const entity of world.query(Health)) {
      const health = world.get(entity, Health);

      if (health.current <= 0) {
        world.despawn(entity);
      }
    }
  }
}

// Game loop
const movementSystem = new MovementSystem();
const healthSystem = new HealthSystem();

function gameLoop(deltaTime: number) {
  movementSystem.update(world, deltaTime);
  healthSystem.update(world);
}
```

### Partial Updates

```typescript
// ❌ WRONG: Can't mutate readonly
const transform = world.get(entity, Transform);
transform.x = 150; // TypeScript error!
world.set(entity, Transform, transform);

// ✅ CORRECT: Use update() for partial changes (fastest!)
world.update(entity, Transform, { x: 150 });

// ✅ ALSO CORRECT: Use set() to replace all fields
world.set(entity, Transform, { x: 150, y: 200, rotation: 0 });
```

### Component Reuse with Tags

```typescript
// Create tag components (empty schemas)
const Enemy = defineComponent('Enemy', {
  _tag: BinaryCodec.u8, // Dummy field
});

const Player = defineComponent('Player', {
  _tag: BinaryCodec.u8,
});

// Add tags
world.add(entity, Enemy, { _tag: 1 });

// Query with tags
for (const entity of world.query(Transform, Enemy)) {
  // Only enemy entities with Transform
}
```

## Integration with Existing Code

The ECS integrates seamlessly with your existing networking code:

```typescript
// Define components (same schema for storage AND network!)
const Transform = defineComponent('Transform', {
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  rotation: BinaryCodec.f32,
});

// Use in ECS
world.add(entity, Transform, { x: 100, y: 200, rotation: 0 });

// Use in snapshots (same schema!)
snapshotRegistry.register('transform', Transform.arrayCodec);
```

## Best Practices

### 1. Keep Components Small
```typescript
// Good: Small, focused components
const Transform = defineComponent('Transform', { x: f32, y: f32, rotation: f32 });
const Velocity = defineComponent('Velocity', { vx: f32, vy: f32 });

// Bad: Large, monolithic component
const Entity = defineComponent('Entity', {
  x, y, rotation, vx, vy, health, maxHealth, damage, ...
});
```

### 2. Use Partial Updates
```typescript
// Good: Update only what changed
world.update(entity, Transform, { x: newX });

// Bad: Get + set for single field
const t = world.get(entity, Transform);
t.x = newX;
world.set(entity, Transform, t);
```

### 3. Batch Operations
```typescript
// Good: Query once, process many
for (const entity of world.query(Transform, Velocity)) {
  // Process all entities in one loop
}

// Bad: Individual queries
for (const entity of world.getEntities()) {
  if (world.has(entity, Transform) && world.has(entity, Velocity)) {
    // Slower
  }
}
```

### 4. Avoid Nested Queries
```typescript
// Bad: O(n²) complexity
for (const e1 of world.query(Transform)) {
  for (const e2 of world.query(Transform)) {
    // Very slow!
  }
}

// Good: Use spatial partitioning for collision detection
const grid = new SpatialGrid();
// ... (see NavMesh or implement your own)
```

## Limitations

- **Maximum 32 components** per world (bitmask limit)
- **Fixed max entities** (set at world creation, affects memory)
- **No component inheritance** (composition over inheritance)
- **No component dependencies** (manage manually)

## See Also

- [BinaryCodec](../core/binary-codec/README.md) - Schema definitions
- [PooledCodec](../core/pooled-codec/README.md) - Zero-copy serialization
- [Networking](../net/README.md) - Client/Server integration
