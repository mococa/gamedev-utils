## Benchmark Environment

* **CPU:** Intel i5-2400 (4c / 4t, Sandy Bridge, 3.4 GHz)
* **OS:** Linux x64
* **Runtime (Murow):** Bun `bun run .ts`
* **Runtime (Bevy):** Rust (release)
* **Methodology:**

  * Fixed workload
  * **5 runs per entity count**
  * Values shown are **averages**
  * No rendering
  * Same logical systems count

---

## Murow ECS (TypeScript / Bun)

**11 systems — 5-run average**

| Entities | Avg Frame Time |     Approx FPS |
| -------: | -------------: | -------------: |
|      500 |    **0.55 ms** | **~1,810 FPS** |
|    1,000 |    **0.68 ms** | **~1,470 FPS** |
|    5,000 |    **3.15 ms** |   **~317 FPS** |
|   10,000 |    **5.98 ms** |   **~167 FPS** |
|   25,000 |   **14.71 ms** |    **~68 FPS** |
|   50,000 |   **29.11 ms** |    **~34 FPS** |

---

## Bevy ECS (Rust)

**11 systems — 5-run average**

| Entities | Avg Frame Time |  Approx FPS |
| -------: | -------------: | ----------: |
|      500 |        0.03 ms | ~33,000 FPS |
|    1,000 |        0.05 ms | ~20,000 FPS |
|    5,000 |        0.22 ms |  ~4,600 FPS |
|   10,000 |        0.43 ms |  ~2,300 FPS |
|   25,000 |        1.07 ms |    ~930 FPS |
|   50,000 |        2.15 ms |    ~465 FPS |

---

## Relative Comparison (i5-2400 @ 50k entities)

| Engine         | Avg Time |          Relative |
| -------------- | -------: | ----------------: |
| Bevy (Rust)    |  2.15 ms |                1× |
| Murow (TS/Bun) | 29.11 ms | **~13.5× slower** |

---

## Interpretation (concise, honest)

* Murow previously showed **high fixed per-frame overhead**; this has been **substantially reduced**.
* Remaining performance gap is primarily due to:

  * dynamic typing
  * JS object indirection
  * lack of compile-time layout guarantees
* Scaling curve is now **strongly linear** across all tested ranges, indicating:

  * cache-friendly iteration
  * amortized scheduler and system overhead
* Performance is **fully viable for real-time logic** in server-side sims, turn-based games, authoritative networking, and deterministic replay.
* Direct comparison to Rust ECS is **informational, not aspirational**; the benchmark establishes **practical bounds**, not parity.

---

## Practical Takeaway

* **≤10k entities:** high-frequency real-time simulation is easily achievable
* **≤25k entities:** stable ≥60 FPS logic step
* **≤50k entities:** stable ~30–35 FPS logic step on decade-old CPUs
* Renderer, physics, and extremely hot loops should still be **native or offloaded** when absolute throughput is required
