/**
 * Protocol Layer - Type-safe networking primitives
 *
 * This layer enforces:
 * - Type-safe intent definitions (extend Intent interface)
 * - Type-safe snapshot definitions (Snapshot<YourState>)
 * - Memory-efficient encoding (use PooledCodec from core)
 *
 * You provide:
 * - Your intent types
 * - Your state types
 * - Your schemas (for binary encoding)
 * - Codec instances (instantiate once, reuse)
 *
 * @example
 * ```ts
 * // Define your types
 * interface MoveIntent extends Intent {
 *   kind: 1;
 *   tick: number;
 *   dx: number;
 *   dy: number;
 * }
 *
 * interface GameState {
 *   players: Record<number, { x: number; y: number }>;
 * }
 *
 * // Create codecs once (reuse these!)
 * const intentRegistry = new IntentRegistry();
 * intentRegistry.register(1, new PooledCodec(moveSchema));
 *
 * const snapshotCodec = new SnapshotCodec<GameState>(
 *   new PooledCodec(stateSchema)
 * );
 *
 * // Use them
 * const buf = intentRegistry.encode(intent);
 * const snapshot = snapshotCodec.decode(buf);
 * ```
 */

export * from "./intent";
export * from "./snapshot";
