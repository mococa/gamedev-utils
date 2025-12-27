# Murow

A lightweight TypeScript game engine for server-authoritative multiplayer games.

## Installation

```bash
npm install murow
```

## Usage

```typescript
import {
  FixedTicker,
  EventSystem,
  BinaryCodec,
  generateId,
  lerp,
  NavMesh,
  PooledCodec,
  IntentTracker,
  Reconciliator
} from 'murow';
// or
import { FixedTicker } from 'murow/core';
```

## Modules

### Core Utilities
- `FixedTicker`: Deterministic fixed-rate update loop
- `EventSystem`: High-performance event handling
- `BinaryCodec`: Schema-driven binary serialization
- `generateId`: Cryptographically secure ID generation
- `lerp`: Linear interpolation utility
- `NavMesh`: Pathfinding with dynamic obstacles
- `PooledCodec`: Object-pooled binary codec
- `IntentTracker` & `Reconciliator`: Client-side prediction

### Protocol Layer
Minimalist networking primitives:
- `IntentRegistry`: Type-safe intent codec registry
- `SnapshotCodec`: Binary encoding for state deltas
- `Snapshot<T>`: Delta-based state updates
- `applySnapshot()`: Deep merge snapshots into state

Works harmoniously with core utilities (`FixedTicker`, `IntentTracker`, `Reconciliator`).

See [Protocol Layer Documentation](./src/protocol/README.md) for usage.

## Building

```bash
npm install
npm run build
```

## License

MIT
