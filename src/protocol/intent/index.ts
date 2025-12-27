/**
 * Intent system for client-to-server actions.
 *
 * Intents are player/AI actions that need to be:
 * 1. Encoded efficiently (binary)
 * 2. Sent over network
 * 3. Decoded on the other end
 * 4. Processed deterministically
 *
 * @example
 * ```ts
 * import { Intent, IntentRegistry } from './protocol/intent';
 * import { PooledCodec } from '../core/pooled-codec';
 * import { BinaryCodec } from '../core/binary-codec';
 *
 * // 1. Define your intent type
 * interface MoveIntent extends Intent {
 *   kind: 1;
 *   tick: number;
 *   dx: number;
 *   dy: number;
 * }
 *
 * // 2. Create registry and register once (reuse this instance)
 * const registry = new IntentRegistry();
 * registry.register(1, new PooledCodec({
 *   kind: BinaryCodec.u8,
 *   tick: BinaryCodec.u32,
 *   dx: BinaryCodec.f32,
 *   dy: BinaryCodec.f32,
 * }));
 *
 * // 3. Encode/decode
 * const buf = registry.encode(intent);
 * const decoded = registry.decode(1, buf);
 * ```
 */

export type { Intent } from "./intent";
export { IntentRegistry } from "./intent-registry";
