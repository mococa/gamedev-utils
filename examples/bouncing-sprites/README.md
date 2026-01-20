# Bouncing Sprites - ECS with Pixi.js Example

A demonstration of integrating a high-performance ECS (Entity Component System) with Pixi.js 8 for smooth 2D game rendering. This example renders **16,000 bouncing sprites** at 60+ FPS with interpolated physics, and can scale to handle even more.

## Features

- **16,000+ Bouncing Sprites**: Handles tens of thousands of entities with smooth motion (scalable to even more)
- **Fixed 10 TPS Physics**: Deterministic game logic running at 10 ticks per second (can be set as low as 1 TPS!)
- **60+ FPS Rendering**: Smooth rendering with interpolation between physics ticks
- **Rate-Independent Rendering**: The physics tick rate doesn't affect visual smoothness - interpolation ensures silky-smooth motion even at 1 TPS
- **ECS Architecture**: Clean separation of data (components) and logic (systems)
- **Pixi.js 8**: Modern 2D WebGL rendering
- **Automatic Interpolation**: Uses `ticker.alpha` for smooth motion between physics updates

## Architecture

### Components

- **Transform**: Position (x, y) and rotation
- **Velocity**: Movement vector (vx, vy)
- **Sprite**: Visual representation (textureId, scale)

### Systems

1. **Movement System**: Updates position based on velocity and handles boundary collisions by inverting velocity

### Game Loop

```
┌─────────────────────────────────────┐
│  requestAnimationFrame (variable)   │
│  - Run physics ticks (10 TPS fixed) │
│    - Store previous positions       │
│    - Update physics systems         │
│  - Render with interpolation        │
│  - Cleanup despawned entities       │
└─────────────────────────────────────┘
```

The key to smooth rendering at variable frame rates with fixed physics is **interpolation**:

```typescript
// Run fixed-rate physics
ticker.tick(dt); // Calls fixedUpdate which stores previous state

// Render interpolated state
// ticker.alpha is between 0.0 and 1.0
renderer.render(world, ticker.alpha);
```

## How It Works

### 1. Fixed Physics Tick (10 TPS)

Physics runs at exactly 10 times per second (100ms per tick), ensuring deterministic behavior regardless of frame rate:

```typescript
const ticker = new FixedTicker({
  rate: 10,
  onTick: (dt) => this.fixedUpdate(dt),
});
```

### 2. Variable Rendering (60+ FPS)

Rendering happens as fast as possible (typically 60 FPS) and interpolates between physics states:

```typescript
const driver = createDriver('client', (dt: number) => {
  ticker.tick(dt); // Accumulates time and runs fixed updates
  renderer.render(world, ticker.alpha);
});
```

### 3. Interpolation

The `ticker.alpha` value (0.0 to 1.0) represents how far we are between the previous and current physics state:

```typescript
sprite.x = lerp(prevX, currentX, alpha);
```

This creates smooth motion even though physics only updates 10 times per second.

**The beauty of interpolation**: You can set the tick rate to 1 TPS (`rate: 1`) and the sprites will still move smoothly at 60 FPS! The visual experience remains identical because the renderer interpolates between physics states. This separation of physics simulation rate from rendering rate is crucial for:
- **Performance**: Run physics as slow as needed for your game logic
- **Determinism**: Lower tick rates are easier to synchronize in multiplayer
- **Smoothness**: Rendering always looks fluid regardless of simulation rate

## Running the Example

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Build for production:

```bash
bun run build
```

