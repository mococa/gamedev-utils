/**
 * A binary field descriptor.
 * Defines how a single value is serialized/deserialized
 * at a fixed byte size.
 */
export type Field<T> = {
  /** Size of the field in bytes */
  size: number;

  /**
   * Writes a value into a DataView at the given offset.
   * @param dv DataView to write into
   * @param o Byte offset
   * @param v Value to write
   */
  write(dv: DataView, o: number, v: T): void;

  /**
   * Reads a value from a DataView at the given offset.
   * @param dv DataView to read from
   * @param o Byte offset
   */
  read(dv: DataView, o: number): T;
};

/**
 * A schema mapping object keys to binary fields.
 * The order of iteration defines the binary layout.
 *
 * IMPORTANT:
 * Property order is respected as insertion order.
 * Do not rely on computed or dynamic keys.
 */
export type Schema<T> = {
  [K in keyof T]: Field<T[K]>;
};

/**
 * Internal symbol used to cache computed schema byte size.
 */
const SCHEMA_SIZE = Symbol("schemaSize");

/**
 * Computes and caches the total byte size of a schema.
 * @param schema Binary schema definition
 */
function getSchemaSize<T extends object>(schema: Schema<T>): number {
  const cached = (schema as any)[SCHEMA_SIZE];
  if (cached !== undefined) return cached;

  let size = 0;
  for (const k of Object.keys(schema) as (keyof T)[]) {
    size += schema[k].size;
  }

  (schema as any)[SCHEMA_SIZE] = size;
  return size;
}

/**
 * Base codec implementation.
 * Handles schema-driven encoding/decoding.
 */
export class BaseBinaryCodec {
  /**
   * Encodes an object into a binary buffer using the given schema.
   *
   * Allocates a right-sized buffer per call.
   * Safe for concurrent and re-entrant usage.
   *
   * @param schema Binary schema definition
   * @param data Object to encode
   * @returns A Uint8Array containing the encoded bytes
   */
  protected static encodeInto<T extends object>(
    schema: Schema<T>,
    data: T
  ): Uint8Array {
    const size = getSchemaSize(schema);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);

    let o = 0;
    for (const k of Object.keys(schema) as (keyof T)[]) {
      const f = schema[k];
      f.write(view, o, data[k]);
      o += f.size;
    }

    return new Uint8Array(buffer);
  }

  /**
   * Decodes a binary buffer into a target object using the given schema.
   *
   * Validates buffer size before reading.
   * Does not mutate shared state.
   *
   * @param schema Binary schema definition
   * @param buf Buffer containing encoded data
   * @param target Target object to mutate
   * @returns The mutated target object
   */
  protected static decodeInto<T extends object>(
    schema: Schema<T>,
    buf: Uint8Array,
    target: T
  ): T {
    const expectedSize = getSchemaSize(schema);

    if (buf.byteLength < expectedSize) {
      throw new RangeError(
        `Buffer too small: expected ${expectedSize} bytes, got ${buf.byteLength}`
      );
    }

    const view = new DataView(
      buf.buffer,
      buf.byteOffset,
      buf.byteLength
    );

    let o = 0;
    for (const k of Object.keys(schema) as (keyof T)[]) {
      const f = schema[k];
      target[k] = f.read(view, o);
      o += f.size;
    }

    return target;
  }
}

/**
 * Built-in binary primitive field definitions.
 */
export class BinaryPrimitives {
  /** Unsigned 8-bit integer */
  static readonly u8: Field<number> = {
    size: 1,
    write: (dv, o, v) => dv.setUint8(o, v),
    read: (dv, o) => dv.getUint8(o),
  };

  /**
   * Unsigned 16-bit integer (big-endian).
   * Endianness is explicit and stable.
   */
  static readonly u16: Field<number> = {
    size: 2,
    write: (dv, o, v) => dv.setUint16(o, v, false),
    read: (dv, o) => dv.getUint16(o, false),
  };

  /** 32-bit floating point number (IEEE 754, big-endian) */
  static readonly f32: Field<number> = {
    size: 4,
    write: (dv, o, v) => dv.setFloat32(o, v, false),
    read: (dv, o) => dv.getFloat32(o, false),
  };
}

/**
 * Public codec API.
 * Re-exports primitives and exposes encode/decode helpers.
 */
export class BinaryCodec extends BaseBinaryCodec {
  /** Unsigned 8-bit integer field */
  static readonly u8 = BinaryPrimitives.u8;
  /** Unsigned 16-bit integer field */
  static readonly u16 = BinaryPrimitives.u16;
  /** 32-bit floating point field */
  static readonly f32 = BinaryPrimitives.f32;

  /**
   * Encodes an object into a binary buffer.
   */
  static encode<T extends object>(
    schema: Schema<T>,
    data: T
  ): Uint8Array {
    return this.encodeInto(schema, data);
  }

  /**
   * Decodes a binary buffer into an existing object.
   */
  static decode<T extends object>(
    schema: Schema<T>,
    buf: Uint8Array,
    target: T
  ): T {
    return this.decodeInto(schema, buf, target);
  }
}
