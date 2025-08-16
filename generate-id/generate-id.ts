/**
 * @description
 * Generates a unique identifier using the Web Crypto API.
 * The identifier is a 64-bit number represented as a hexadecimal string.
 *
 * @returns {string} A unique identifier in hexadecimal format.
 */
export function generateId(): string {
  const arr = crypto.getRandomValues(new Uint32Array(2));
  const id = (BigInt(arr[0]) << 32n) | BigInt(arr[1]); // 64-bit number
  return id.toString(16).padEnd(16, "0");
}
