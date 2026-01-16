import { Component } from "./component";
import { Entity, World } from "./world";

/**
 * System helper that provides automatic field array caching.
 *
 * Combines the ergonomics of EntityHandle with the performance of RAW API.
 * Field arrays are cached on first access for zero-cost abstraction.
 *
 * @example
 * ```typescript
 * // Create system once at initialization
 * const movement = world.system(Transform, Velocity);
 *
 * // Access field arrays - cached on first access
 * const { Transform_x: tx, Transform_y: ty, Velocity_vx: vx, Velocity_vy: vy } = movement.fields;
 *
 * // In game loop - direct array access (RAW API performance)
 * for (const eid of movement.query()) {
 *   tx[eid] += vx[eid] * dt;
 *   ty[eid] += vy[eid] * dt;
 * }
 * ```
 */
export class System<C extends Component<any>[]> {
  private fieldCache: Record<string, any> = {};

  /**
   * Proxy that automatically caches field arrays on first access.
   * Access fields using ComponentName_fieldName format.
   */
  readonly fields: any;

  constructor(
    private world: World,
    private components: C
  ) {
    const cache = this.fieldCache;
    const worldRef = this.world;
    const componentsRef = this.components;

    // Create proxy that auto-caches field arrays
    this.fields = new Proxy({}, {
      get(target: any, prop: string) {
        // Check cache first
        if (cache[prop] !== undefined) {
          return cache[prop];
        }

        // Parse "ComponentName_fieldName" format
        const underscoreIndex = prop.indexOf('_');
        if (underscoreIndex === -1) {
          return undefined;
        }

        const compName = prop.substring(0, underscoreIndex);
        const fieldName = prop.substring(underscoreIndex + 1);

        // Find component by name
        const component = componentsRef.find(c => c.name === compName);

        if (component && fieldName) {
          // Get and cache the field array
          const array = worldRef.getFieldArray(component, fieldName as any);
          cache[prop] = array;
          return array;
        }

        return undefined;
      }
    });
  }

  /**
   * Query entities matching the system's components.
   *
   * @returns Array of entity IDs
   *
   * @example
   * ```typescript
   * for (const eid of system.query()) {
   *   // Process entity...
   * }
   * ```
   */
  query(): readonly Entity[] {
    return this.world.query(...(this.components as Component<any>[]));
  }

  /**
   * Run a callback for each entity in the query.
   * Convenience method that combines query() with a loop.
   *
   * @param fn - Callback function that receives entity ID and system instance
   *
   * @example
   * ```typescript
   * const { Transform_x: tx, Velocity_vx: vx } = system.fields;
   *
   * system.run((eid) => {
   *   tx[eid] += vx[eid] * dt;
   * });
   * ```
   */
  run(fn: (eid: Entity, sys: this) => void): void {
    const entities = this.query();
    for (let i = 0; i < entities.length; i++) {
      fn(entities[i]!, this);
    }
  }
}
