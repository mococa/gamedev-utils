# GameDev Utils

A comprehensive collection of TypeScript utilities designed for game development, with a focus on multiplayer games, networking, and performance-critical applications.

## Overview

This repository provides a modular set of utilities that solve common game development challenges including binary serialization, event handling, fixed-rate updates, interpolation, snapshot management, and unique ID generation. Each utility is designed to be lightweight, type-safe, and performance-oriented.

## Utilities

### 1. Binary Codec

**Location:** `binary-codec/`

A minimal schema-driven binary encoding and decoding library for efficient network serialization in multiplayer games.

**Key Features:**
- Fixed-size field support (u8, u16, u32, i8, i16, i32, f32, f64)
- Automatic buffer sizing and validation
- Type-safe schema definitions
- Big-endian encoding for network compatibility
- Support for complex types (vec2, vec3, color, strings)
- Zero dependencies on external serialization libraries

**Use Cases:**
- Network packet serialization for multiplayer games
- State synchronization between clients and servers
- Efficient data storage for replay systems
- Minimizing bandwidth usage in real-time applications

**Example:**
```typescript
import { BinaryCodec, Schema } from './binary-codec/binary-codec';

type PlayerState = {
  id: number;
  x: number;
  y: number;
  health: number;
};

const playerSchema: Schema<PlayerState> = {
  id: BinaryCodec.u8,
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  health: BinaryCodec.u8,
};

const player: PlayerState = { id: 1, x: 100.5, y: 200.3, health: 75 };
const buffer = BinaryCodec.encode(playerSchema, player);

const decoded = { id: 0, x: 0, y: 0, health: 0 };
BinaryCodec.decode(playerSchema, buffer, decoded);
```

---

### 2. Event System

**Location:** `events/`

A high-performance callback-based event handling system designed for event-driven architectures.

**Key Features:**
- Type-safe event names and payloads using TypeScript tuples
- Standard event registration with `on()`
- One-time event listeners with `once()`
- Event removal with `off()`
- Selective or global event clearing with `clear()`
- Better performance than native EventEmitter (see benchmarks in README)

**Use Cases:**
- Game entity communication
- UI event handling
- Network message dispatch
- State change notifications
- Decoupling game systems

**Example:**
```typescript
import { EventSystem } from './events/event-system';

type GameEvents = [
  ['player:join', { playerId: string; username: string }],
  ['player:move', { playerId: string; x: number; y: number }],
  ['game:end', { winner: string }]
];

const events = new EventSystem<GameEvents>({
  events: ['player:join', 'player:move', 'game:end']
});

events.on('player:join', ({ playerId, username }) => {
  console.log(`${username} joined the game`);
});

events.once('game:end', ({ winner }) => {
  console.log(`Game over! Winner: ${winner}`);
});

events.emit('player:join', { playerId: '123', username: 'Player1' });
events.emit('game:end', { winner: 'Player1' });
```

---

### 3. Fixed Ticker

**Location:** `fixed-ticker/`

A deterministic fixed-rate update loop manager essential for consistent physics and game logic in both client and server environments.

**Key Features:**
- Fixed timestep updates for deterministic behavior
- Accumulator-based time management
- Configurable tick rate (e.g., 60 Hz, 30 Hz)
- Protection against spiral of death (max ticks per frame)
- Tick counting and accumulated time tracking
- Optional callback for skipped ticks

**Use Cases:**
- Physics simulations requiring consistent timesteps
- Server-authoritative game loops
- Deterministic multiplayer synchronization
- Replay systems that require frame-perfect accuracy

**Example:**
```typescript
import { FixedTicker } from './fixed-ticker/fixed-ticker';

const ticker = new FixedTicker({
  rate: 60, // 60 ticks per second
  onTick: (deltaTime, tick) => {
    // Run game logic at fixed 60 Hz
    updatePhysics(deltaTime);
    updateEntities(deltaTime);
    console.log(`Tick ${tick} processed`);
  },
  onTickSkipped: (skipped) => {
    console.warn(`Skipped ${skipped} ticks due to frame lag`);
  }
});

// In your game loop
function gameLoop(frameTime: number) {
  ticker.tick(frameTime); // Pass elapsed time in seconds

  // Use accumulated time for interpolation
  const alpha = ticker.accumulatedTime * ticker.rate;
  interpolateRender(alpha);

  requestAnimationFrame(gameLoop);
}
```

---

### 4. Generate ID

**Location:** `generate-id/`

A cryptographically secure unique identifier generator using the Web Crypto API.

**Key Features:**
- Cryptographically secure random number generation
- Customizable ID length
- Optional prefix support
- Hexadecimal output format
- Cross-platform compatibility (browser and Node.js)

**Use Cases:**
- Generating unique entity IDs
- Session token creation
- Player identification
- Message/packet ID assignment
- Temporary object keys

**Example:**
```typescript
import { generateId } from './generate-id/generate-id';

// Basic usage
const id = generateId();
// "f3a2b1c4d5e67890"

// With prefix
const playerId = generateId({ prefix: 'player_' });
// "player_f3a2b1c4d5e67890"

// Custom length
const sessionId = generateId({ prefix: 'session_', size: 32 });
// "session_00f3a2b1c4d5e6789012345678"

// Usage in game
const entities = new Map();
const entityId = generateId({ prefix: 'entity_' });
entities.set(entityId, { x: 0, y: 0, type: 'player' });
```

---

### 5. Lerp (Linear Interpolation)

**Location:** `lerp/`

A mathematical utility for smooth value transitions and animations.

**Key Features:**
- Standard linear interpolation formula
- No clamping (allows extrapolation)
- Clear documentation with examples
- Useful for animations, camera movements, and smooth transitions

**Use Cases:**
- Smooth movement animations
- Camera interpolation
- Color transitions
- Value blending in UI
- Client-side prediction and reconciliation

**Example:**
```typescript
import { lerp } from './lerp/lerp';

// Basic interpolation
const value = lerp(0, 100, 0.5); // 50

// Smooth movement
const startX = 0;
const endX = 100;
const progress = 0.75;
const currentX = lerp(startX, endX, progress); // 75

// Animation over time
function animate(startPos: number, endPos: number, duration: number) {
  const startTime = Date.now();

  function update() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1.0);
    const position = lerp(startPos, endPos, t);

    updateEntityPosition(position);

    if (t < 1.0) {
      requestAnimationFrame(update);
    }
  }

  update();
}

// Client-side prediction interpolation
function interpolatePosition(previous: Vector2, current: Vector2, alpha: number) {
  return {
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha)
  };
}
```

---

### 6. Snapshot Buffer

**Location:** `snapshot-buffer/`

A circular buffer for storing and managing historical game state snapshots, essential for rollback netcode and replay systems.

**Key Features:**
- Tick-indexed state storage
- Automatic buffer size management
- State cloning with `structuredClone` by default
- Customizable clone function
- Replay functionality with range support
- Snapshot discarding for memory management

**Use Cases:**
- Rollback networking for fighting games
- Client-side prediction and server reconciliation
- Replay and spectator systems
- Debugging and state inspection
- Time travel debugging

**Example:**
```typescript
import { SnapshotBuffer } from './snapshot-buffer/snapshot-buffer';

type GameState = {
  players: Array<{ id: string; x: number; y: number }>;
  projectiles: Array<{ x: number; y: number; vx: number; vy: number }>;
  tick: number;
};

const buffer = new SnapshotBuffer<GameState>(100); // Keep last 100 states

// Store snapshots each tick
let currentTick = 0;
function gameLoop() {
  const state: GameState = {
    players: [{ id: 'p1', x: 10, y: 20 }],
    projectiles: [],
    tick: currentTick
  };

  buffer.store(currentTick, state);
  currentTick++;
}

// Retrieve a specific snapshot
const pastState = buffer.at(currentTick - 10);

// Get latest snapshot
const latest = buffer.latest;
if (latest) {
  console.log(`Latest tick: ${latest.tick}`);
}

// Rollback netcode example
function rollbackAndReplay(serverTick: number, serverState: GameState) {
  // Discard states newer than server state
  const snapshot = buffer.at(serverTick);

  if (snapshot) {
    // Restore to server state
    applyState(snapshot);

    // Replay inputs from serverTick to current
    buffer.replay((state, tick) => {
      if (tick > serverTick) {
        reapplyLocalInput(state, tick);
      }
    }, serverTick, currentTick);
  }
}

// Memory management
buffer.discardUntil(currentTick - 60); // Keep only last 60 ticks
```

---

## Installation

Each utility is designed to be used independently. You can copy individual modules into your project:

```bash
# Clone the repository
git clone https://github.com/mococa/gamedev-utils.git

# Copy specific utility
cp -r gamedev-utils/binary-codec your-project/utils/
cp -r gamedev-utils/events your-project/utils/
```

Alternatively, you can use the utilities directly from the source:

```typescript
import { BinaryCodec } from './gamedev-utils/binary-codec/binary-codec';
import { EventSystem } from './gamedev-utils/events/event-system';
import { FixedTicker } from './gamedev-utils/fixed-ticker/fixed-ticker';
import { generateId } from './gamedev-utils/generate-id/generate-id';
import { lerp } from './gamedev-utils/lerp/lerp';
import { SnapshotBuffer } from './gamedev-utils/snapshot-buffer/snapshot-buffer';
```

---

## Complete Multiplayer Game Example

Here's how these utilities work together in a multiplayer game:

```typescript
import { BinaryCodec, Schema } from './binary-codec/binary-codec';
import { EventSystem } from './events/event-system';
import { FixedTicker } from './fixed-ticker/fixed-ticker';
import { generateId } from './generate-id/generate-id';
import { lerp } from './lerp/lerp';
import { SnapshotBuffer } from './snapshot-buffer/snapshot-buffer';

// 1. Define game state and schema
type PlayerState = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
};

const playerSchema: Schema<PlayerState> = {
  id: BinaryCodec.u8,
  x: BinaryCodec.f32,
  y: BinaryCodec.f32,
  vx: BinaryCodec.f32,
  vy: BinaryCodec.f32,
  health: BinaryCodec.u8,
};

type GameState = {
  players: Map<string, PlayerState>;
  tick: number;
};

// 2. Set up event system
type NetworkEvents = [
  ['state:update', { buffer: Uint8Array }],
  ['player:join', { playerId: string }],
  ['player:input', { playerId: string; input: any }]
];

const events = new EventSystem<NetworkEvents>({
  events: ['state:update', 'player:join', 'player:input']
});

// 3. Create snapshot buffer for rollback
const snapshots = new SnapshotBuffer<GameState>(120); // 2 seconds at 60 Hz

// 4. Set up fixed ticker for server
const serverTicker = new FixedTicker({
  rate: 60,
  onTick: (dt, tick) => {
    // Update physics
    updateGameLogic(dt);

    // Store snapshot
    snapshots.store(tick, gameState);

    // Serialize and broadcast every 3 ticks (20 Hz)
    if (tick % 3 === 0) {
      broadcastState(tick);
    }
  }
});

// 5. Network serialization
function broadcastState(tick: number) {
  const players = Array.from(gameState.players.values());

  players.forEach(player => {
    const buffer = BinaryCodec.encode(playerSchema, player);
    events.emit('state:update', { buffer });
  });
}

// 6. Client interpolation
function renderFrame() {
  const alpha = serverTicker.accumulatedTime * serverTicker.rate;

  gameState.players.forEach((player, id) => {
    const prev = snapshots.at(gameState.tick - 1)?.players.get(id);
    const curr = player;

    if (prev && curr) {
      const renderX = lerp(prev.x, curr.x, alpha);
      const renderY = lerp(prev.y, curr.y, alpha);

      drawPlayer(id, renderX, renderY);
    }
  });
}

// 7. Player management
events.on('player:join', ({ playerId }) => {
  const player: PlayerState = {
    id: parseInt(playerId),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    health: 100
  };

  gameState.players.set(playerId, player);
  console.log(`Player ${playerId} joined`);
});
```

---

## Design Philosophy

These utilities follow key principles:

1. **Zero Dependencies**: Each utility is self-contained and doesn't rely on external libraries
2. **Type Safety**: Full TypeScript support with strong type inference
3. **Performance**: Optimized for game development scenarios with minimal overhead
4. **Modularity**: Each utility can be used independently
5. **Determinism**: Especially important for multiplayer games (FixedTicker, SnapshotBuffer)
6. **Production Ready**: Robust error handling and validation

---

## Performance Considerations

- **BinaryCodec**: Significantly smaller payloads than JSON (typically 60-80% reduction)
- **EventSystem**: Faster than native EventEmitter due to callback-based architecture
- **FixedTicker**: Prevents frame rate dependencies and ensures deterministic updates
- **SnapshotBuffer**: Uses `structuredClone` by default, but allows custom clone functions for optimization
- **GenerateId**: Uses cryptographically secure random generation (crypto.getRandomValues)
- **Lerp**: Simple mathematical operation with minimal overhead

---

## Browser and Node.js Compatibility

All utilities are compatible with:
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Node.js 16+
- Deno
- Bun

Requirements:
- TypeScript 4.5+
- ES2020 or higher

---

## License

MIT

---

## Contributing

Contributions are welcome! Each utility maintains its own README with detailed documentation. When contributing:

1. Maintain type safety and documentation
2. Include examples in module-specific README files
3. Ensure cross-platform compatibility
4. Write clear, performance-oriented code
5. Add appropriate error handling

---

## Related Resources

- [Binary Serialization Best Practices](https://gafferongames.com/post/serialization_strategies/)
- [Fixed Timestep Game Loops](https://gafferongames.com/post/fix_your_timestep/)
- [Rollback Networking](https://www.gamedeveloper.com/programming/fighting-game-networking)
- [Client-Side Prediction](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)

---

## Author

**Luiz Felipe Moureau** ([@mococa](https://github.com/mococa))

---

## Repository Structure

```
gamedev-utils/
├── binary-codec/
│   ├── binary-codec.ts
│   └── README.md
├── events/
│   ├── event-system.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── fixed-ticker/
│   ├── fixed-ticker.ts
│   ├── package.json
│   └── README.md
├── generate-id/
│   ├── generate-id.ts
│   ├── package.json
│   └── README.md
├── lerp/
│   ├── lerp.ts
│   ├── package.json
│   └── README.md
├── snapshot-buffer/
│   ├── snapshot-buffer.ts
│   └── README.md
└── README.md
```
