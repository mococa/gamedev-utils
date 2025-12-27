import { describe, expect, test } from "bun:test";
import {
  ObjectPool,
  PooledDecoder,
  PooledEncoder,
  PooledCodec,
  PooledArrayDecoder,
} from "./pooled-codec";
import { BinaryCodec, BinaryPrimitives, Schema } from "../binary-codec";

describe("ObjectPool", () => {
  test("should create new object when pool is empty", () => {
    const pool = new ObjectPool(() => ({ value: 0 }));
    const obj = pool.acquire();
    expect(obj).toEqual({ value: 0 });
  });

  test("should reuse released objects", () => {
    const pool = new ObjectPool(() => ({ value: 0 }));
    const obj1 = pool.acquire();
    obj1.value = 42;
    pool.release(obj1);

    const obj2 = pool.acquire();
    expect(obj2.value).toBe(42);
    expect(obj2).toBe(obj1); // Same object reference
  });

  test("should handle multiple acquire/release cycles", () => {
    const pool = new ObjectPool(() => ({ count: 0 }));

    const obj1 = pool.acquire();
    obj1.count = 1;
    pool.release(obj1);

    const obj2 = pool.acquire();
    obj2.count = 2;
    pool.release(obj2);

    const obj3 = pool.acquire();
    expect(obj3.count).toBe(2); // Gets the last released object
  });

  test("should release multiple objects at once", () => {
    const pool = new ObjectPool(() => ({ id: 0 }));

    const objs = [
      pool.acquire(),
      pool.acquire(),
      pool.acquire(),
    ];

    objs.forEach((obj, i) => (obj.id = i));
    pool.releaseAll(objs);

    const reused1 = pool.acquire();
    const reused2 = pool.acquire();
    const reused3 = pool.acquire();

    expect([reused1.id, reused2.id, reused3.id].sort()).toEqual([0, 1, 2]);
  });
});

describe("PooledDecoder", () => {
  test("should decode data into pooled objects", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.f32,
    };

    const decoder = new PooledDecoder(schema);

    // Use BinaryCodec to encode the data first
    const data = { value: 10.5 };
    const buffer = BinaryCodec.encode(schema, data);

    const obj = decoder.decode(buffer);
    expect(obj.value).toBeCloseTo(10.5, 5);
  });

  test("should reuse released objects", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u32,
    };

    const decoder = new PooledDecoder(schema);

    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 42, false);

    const obj1 = decoder.decode(buffer);
    expect(obj1.value).toBe(42);

    decoder.release(obj1);

    view.setUint32(0, 100, false);
    const obj2 = decoder.decode(buffer);
    expect(obj2.value).toBe(100);
    expect(obj2).toBe(obj1); // Same object reference
  });

  test("should decode into existing target object", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u8,
    };

    const decoder = new PooledDecoder(schema);

    // Use BinaryCodec to encode the data first
    const data = { value: 10 };
    const buffer = BinaryCodec.encode(schema, data);
    const target = { value: 0 };

    decoder.decodeInto(buffer, target);
    expect(target.value).toBe(10);
  });
});

describe("PooledArrayDecoder", () => {
  test("should decode multiple buffers into pooled objects", () => {
    const schema: Schema<{ id: number }> = {
      id: BinaryPrimitives.u32,
    };

    const arrayDecoder = new PooledArrayDecoder(schema);

    const buffers = [
      new Uint8Array([0, 0, 0, 1]),
      new Uint8Array([0, 0, 0, 2]),
      new Uint8Array([0, 0, 0, 3]),
    ];

    const objs = arrayDecoder.decodeAll(buffers);
    expect(objs.length).toBe(3);
    expect(objs[0].id).toBe(1);
    expect(objs[1].id).toBe(2);
    expect(objs[2].id).toBe(3);
  });

  test("should release multiple objects", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u8,
    };

    const arrayDecoder = new PooledArrayDecoder(schema);

    // Use BinaryCodec to encode the data first
    const buffers = [
      BinaryCodec.encode(schema, { value: 10 }),
      BinaryCodec.encode(schema, { value: 20 }),
      BinaryCodec.encode(schema, { value: 30 }),
    ];

    const objs = arrayDecoder.decodeAll(buffers);
    const objValues = objs.map(o => o.value);
    expect(objValues).toEqual([10, 20, 30]);

    arrayDecoder.releaseAll(objs);

    // Decode again and verify objects are reused (checking references)
    const newObjs = arrayDecoder.decodeAll(buffers);
    // Objects should be reused (same references)
    let reuseCount = 0;
    for (const newObj of newObjs) {
      if (objs.includes(newObj)) reuseCount++;
    }
    expect(reuseCount).toBeGreaterThan(0);
  });
});

describe("PooledEncoder", () => {
  test("should encode objects into pooled buffers", () => {
    const schema: Schema<{ x: number; y: number }> = {
      x: BinaryPrimitives.f32,
      y: BinaryPrimitives.f32,
    };

    const encoder = new PooledEncoder(schema);
    const data = { x: 5.5, y: 10.5 };

    const buffer = encoder.encode(data);
    expect(buffer.length).toBe(8);

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    expect(view.getFloat32(0, false)).toBeCloseTo(5.5, 5);
    expect(view.getFloat32(4, false)).toBeCloseTo(10.5, 5);
  });

  test("should reuse released buffers", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u32,
    };

    const encoder = new PooledEncoder(schema, 16);
    const data1 = { value: 42 };

    const buffer1 = encoder.encode(data1);
    encoder.release(buffer1);

    const data2 = { value: 100 };
    const buffer2 = encoder.encode(data2);

    // Should reuse the same underlying buffer
    expect(buffer2.buffer).toBe(buffer1.buffer);
  });

  test("should handle custom buffer size", () => {
    const schema: Schema<{ id: number }> = {
      id: BinaryPrimitives.u8,
    };

    const encoder = new PooledEncoder(schema, 64);
    const data = { id: 5 };

    const buffer = encoder.encode(data);
    expect(buffer.length).toBe(1); // Only actual data
  });
});

describe("PooledCodec", () => {
  test("should encode and decode with pooling", () => {
    const schema: Schema<{ id: number }> = {
      id: BinaryPrimitives.u32,
    };

    const codec = new PooledCodec(schema);
    const data = { id: 123 };

    const encoded = codec.encode(data);
    const decoded = codec.decode(encoded);

    expect(decoded.id).toBe(123);
  });

  test("should reuse objects after release", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u32,
    };

    const codec = new PooledCodec(schema);

    const encoded1 = codec.encode({ value: 42 });
    const decoded1 = codec.decode(encoded1);
    expect(decoded1.value).toBe(42);

    codec.release(decoded1);

    const encoded2 = codec.encode({ value: 100 });
    const decoded2 = codec.decode(encoded2);
    expect(decoded2.value).toBe(100);
    expect(decoded2).toBe(decoded1); // Same object
  });

  test("should handle multiple encode/decode cycles", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u16,
    };

    const codec = new PooledCodec(schema);

    for (let i = 0; i < 100; i++) {
      const data = { value: i * 10 };
      const encoded = codec.encode(data);
      const decoded = codec.decode(encoded);

      expect(decoded.value).toBe(i * 10);

      codec.release(decoded);
    }
  });

  test("should work with single field schemas", () => {
    const schema: Schema<{
      id: number;
    }> = {
      id: BinaryPrimitives.u32,
    };

    const codec = new PooledCodec(schema);
    const data = {
      id: 999,
    };

    const encoded = codec.encode(data);
    const decoded = codec.decode(encoded);

    expect(decoded.id).toBe(999);
  });
});

describe("PooledCodec - Memory Efficiency", () => {
  test("should reduce allocations with pooling", () => {
    const schema: Schema<{ value: number }> = {
      value: BinaryPrimitives.u32,
    };

    const codec = new PooledCodec(schema);
    const objects: any[] = [];

    const times = 10000;

    // Encode and decode {times} times
    for (let i = 0; i < times; i++) {
      const encoded = codec.encode({ value: i });
      const decoded = codec.decode(encoded);
      objects.push(decoded);
    }

    // Release all
    objects.forEach((obj) => codec.release(obj));

    // Decode again - should reuse objects
    const newObjects: any[] = [];
    for (let i = 0; i < times; i++) {
      const encoded = codec.encode({ value: i });
      const decoded = codec.decode(encoded);
      newObjects.push(decoded);
    }

    // At least some objects should be reused
    let reusedCount = 0;
    for (const newObj of newObjects) {
      if (objects.includes(newObj)) {
        reusedCount++;
      }
    }

    expect(reusedCount).toBeGreaterThan(0);
  });

  test("should handle concurrent encode/decode without release", () => {
    const schema: Schema<{ id: number }> = {
      id: BinaryPrimitives.u16,
    };

    const codec = new PooledCodec(schema);
    const objects: any[] = [];

    // Create many objects without releasing
    for (let i = 0; i < 50; i++) {
      const encoded = codec.encode({ id: i });
      const decoded = codec.decode(encoded);
      objects.push(decoded);
    }

    expect(objects.length).toBe(50);
    objects.forEach((obj, i) => expect(obj.id).toBe(i));
  });
});
