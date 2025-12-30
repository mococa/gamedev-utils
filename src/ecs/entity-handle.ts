import { Component } from "./component";
import { Entity, World } from "./world";

/**
 * Syntactic sugar wrapper for entity operations.
 *
 * **Zero runtime overhead** - This class is designed to be inlined by JavaScript engines.
 * Modern JIT compilers (V8, SpiderMonkey, JavaScriptCore) will inline these simple method
 * calls, making them identical in performance to raw World API calls.
 *
 * @example
 * ```typescript
 * // Fluent chaining API
 * const player = world.entity(world.spawn())
 *   .add(Transform, { x: 0, y: 0, rotation: 0 })
 *   .add(Health, { current: 100, max: 100 })
 *   .add(Velocity, { vx: 0, vy: 0 });
 *
 * // Use the handle
 * player.update(Transform, { x: 10 });
 * const health = player.get(Health);
 *
 * // Access raw entity ID
 * console.log(player.id); // number
 * ```
 *
 * @example
 * ```typescript
 * // Compared to raw API:
 * const playerId = world.spawn();
 * world.add(playerId, Transform, { x: 0, y: 0, rotation: 0 });
 * world.add(playerId, Health, { current: 100, max: 100 });
 * world.update(playerId, Transform, { x: 10 });
 * const health = world.get(playerId, Health);
 *
 * // Both approaches have identical performance after JIT optimization
 * ```
 */
export class EntityHandle {
  /**
   * Creates an entity handle wrapping a world and entity ID.
   *
   * **Note**: Prefer using `world.entity(id)` factory method for cleaner code.
   *
   * @param world - The world managing this entity
   * @param id - The entity ID
   *
   * @example
   * ```typescript
   * // Direct construction (verbose)
   * const handle = new EntityHandle(world, world.spawn());
   *
   * // Preferred factory method (cleaner)
   * const handle = world.entity(world.spawn());
   * ```
   */
  constructor(
    private readonly world: World,
    private readonly _id: Entity
  ) {}

  /**
   * Add a component to this entity with initial data.
   * Returns `this` for method chaining.
   *
   * @param component - Component definition to add
   * @param data - Initial component data
   * @returns This handle for chaining
   *
   * @example
   * ```typescript
   * entity
   *   .add(Transform, { x: 0, y: 0, rotation: 0 })
   *   .add(Health, { current: 100, max: 100 });
   * ```
   */
  add<T extends object>(component: Component<T>, data: T): this {
    this.world.add(this._id, component, data);
    return this;
  }

  /**
   * Get component data for this entity.
   * Returns a readonly reusable object (zero allocations).
   *
   * @param component - Component to retrieve
   * @returns Readonly component data
   *
   * @example
   * ```typescript
   * const transform = entity.get(Transform);
   * console.log(transform.x, transform.y);
   * ```
   */
  get<T extends object>(component: Component<T>): Readonly<T> {
    return this.world.get(this._id, component);
  }

  /**
   * Update specific fields of a component.
   * Returns `this` for method chaining.
   *
   * More efficient than get + set for partial changes.
   *
   * @param component - Component to update
   * @param data - Partial data to update
   * @returns This handle for chaining
   *
   * @example
   * ```typescript
   * // Update single field
   * entity.update(Transform, { x: 150 });
   *
   * // Chain multiple updates
   * entity
   *   .update(Transform, { x: 100, y: 200 })
   *   .update(Health, { current: 50 });
   * ```
   */
  update<T extends object>(component: Component<T>, data: Partial<T>): this {
    this.world.update(this._id, component, data);
    return this;
  }

  /**
   * Set component data for this entity, overwriting all fields.
   * Returns `this` for method chaining.
   *
   * @param component - Component to set
   * @param data - Complete component data
   * @returns This handle for chaining
   *
   * @example
   * ```typescript
   * entity.set(Transform, { x: 100, y: 200, rotation: 0 });
   * ```
   */
  set<T extends object>(component: Component<T>, data: T): this {
    this.world.set(this._id, component, data);
    return this;
  }

  /**
   * Check if this entity has a specific component.
   *
   * @param component - Component to check
   * @returns True if entity has the component
   *
   * @example
   * ```typescript
   * if (entity.has(Health)) {
   *   const health = entity.get(Health);
   * }
   * ```
   */
  has<T extends object>(component: Component<T>): boolean {
    return this.world.has(this._id, component);
  }

  /**
   * Remove a component from this entity.
   * Returns `this` for method chaining.
   *
   * @param component - Component to remove
   * @returns This handle for chaining
   *
   * @example
   * ```typescript
   * entity
   *   .remove(Velocity)
   *   .remove(Health);
   * ```
   */
  remove<T extends object>(component: Component<T>): this {
    this.world.remove(this._id, component);
    return this;
  }

  /**
   * Despawn this entity, removing all components.
   * The entity ID will be reused.
   *
   * **Note**: This handle becomes invalid after despawning.
   *
   * @example
   * ```typescript
   * entity.despawn();
   * // entity is now invalid - don't use it!
   * ```
   */
  despawn(): void {
    this.world.despawn(this._id);
  }

  /**
   * Check if this entity is alive.
   *
   * @returns True if entity exists in the world
   *
   * @example
   * ```typescript
   * if (entity.isAlive()) {
   *   entity.update(Health, { current: 0 });
   * }
   * ```
   */
  isAlive(): boolean {
    return this.world.isAlive(this._id);
  }

  /**
   * Get the raw entity ID.
   *
   * Use this when you need to pass the entity to raw World API methods
   * or store the ID for later use.
   *
   * @example
   * ```typescript
   * const id = entity.id;
   * world.add(id, Transform, { x: 0, y: 0, rotation: 0 });
   * ```
   */
  get id(): Entity {
    return this._id;
  }

  /**
   * Get a mutable copy of component data.
   *
   * **Note**: This allocates a new object. Use sparingly in hot paths.
   *
   * @param component - Component to retrieve
   * @returns Mutable copy of component data
   *
   * @example
   * ```typescript
   * const transform = entity.getMutable(Transform);
   * transform.x = 100; // OK to mutate
   * entity.set(Transform, transform);
   * ```
   */
  getMutable<T extends object>(component: Component<T>): T {
    return this.world.getMutable(this._id, component);
  }
}
