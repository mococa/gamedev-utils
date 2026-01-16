import { Component } from "./component";
import { Entity, World } from "./world";

/**
 * Extract component data type from Component<T>
 */
type InferComponentData<C> = C extends Component<infer T> ? T : never;

/**
 * Extract the alias (key) and fields from a field mapping object.
 * { transform2d: ['x', 'y'] } => { alias: 'transform2d', fields: ['x', 'y'] }
 */
type ExtractFieldMapping<T> = T extends Record<string, readonly any[]>
  ? {
      [K in keyof T]: {
        alias: K;
        fields: T[K];
      }
    }[keyof T]
  : never;

/**
 * Build entity proxy from components and field mappings.
 * Maps each alias to an object with the specified fields from the corresponding component.
 */
type BuildEntityProxy<
  Components extends readonly Component<any>[],
  FieldMappings extends readonly any[]
> = {
  [Index in keyof FieldMappings as ExtractFieldMapping<FieldMappings[Index]>["alias"]]: Index extends keyof Components
    ? Components[Index] extends Component<any>
      ? ExtractFieldMapping<FieldMappings[Index]>["fields"] extends readonly (keyof InferComponentData<Components[Index]>)[]
        ? {
            [F in ExtractFieldMapping<FieldMappings[Index]>["fields"][number]]: F extends keyof InferComponentData<Components[Index]>
              ? InferComponentData<Components[Index]>[F]
              : never
          }
        : never
      : never
    : never
};

/**
 * Builder for creating ergonomic systems with automatic field array caching.
 *
 * Provides a fluent API that compiles down to RAW API performance:
 * - User writes ergonomic code with entity.component.field syntax
 * - System automatically caches TypedArrays and creates proxies
 * - Runtime performance matches direct array access
 * - Fully type-safe with IntelliSense support
 *
 * @example
 * ```typescript
 * world
 *   .addSystem()
 *   .with(Transform2D, Velocity)
 *   .fields([
 *     { transform2d: ['x', 'y'] },
 *     { velocity: ['vx', 'vy'] }
 *   ])
 *   .run((entity, deltaTime) => {
 *     // entity.transform2d and entity.velocity are fully typed!
 *     entity.transform2d.x += entity.velocity.vx * deltaTime;
 *     entity.transform2d.y += entity.velocity.vy * deltaTime;
 *   });
 * ```
 */
export class SystemBuilder<C extends Component<any>[]> {
  constructor(
    private world: World,
    private components: C
  ) {}

  /**
   * Specify which components this system should query for.
   *
   * @param components - Components to query
   * @returns This builder for chaining with updated component types
   *
   * @example
   * ```typescript
   * .with(Transform2D, Velocity)
   * ```
   */
  with<NewC extends Component<any>[]>(...components: NewC): SystemBuilder<NewC> {
    (this as any).components = components;
    return this as any;
  }

  /**
   * Specify which component fields should be accessible via proxy.
   *
   * Pass an array of objects mapping aliases to field arrays.
   * Each object corresponds to a component in with() by index.
   *
   * Fully type-safe: field names are checked against component schemas,
   * and the entity proxy type is inferred from the mappings.
   *
   * @param fieldMappings - Array of { alias: [fields] } objects, one per component
   * @returns Executable system
   *
   * @example
   * ```typescript
   * .with(Transform2D, Velocity)
   * .fields([
   *   { transform2d: ['x', 'y'] },
   *   { velocity: ['vx', 'vy'] }
   * ])
   * ```
   */
  fields<
    const FM extends {
      [K in keyof C]: C[K] extends Component<infer T>
        ? Record<string, readonly (keyof T)[]>
        : never
    }
  >(
    fieldMappings: FM
  ): TypedSystemBuilder<C, FM> {
    return new TypedSystemBuilder(this.world, this.components, fieldMappings);
  }
}

/**
 * Typed system builder that knows the entity proxy type.
 * Created after fields() is called with concrete field mappings.
 */
class TypedSystemBuilder<C extends Component<any>[], FM extends any[]> {
  constructor(
    private world: World,
    private components: C,
    private fieldMappings: FM
  ) {}

  /**
   * Set the system callback with full type safety.
   *
   * @param callback - Function that receives typed entity proxy and deltaTime
   * @returns Executable system
   */
  run(callback: (entity: BuildEntityProxy<C, FM>, deltaTime: number) => void): ExecutableSystem {
    // Build the executable system
    const system = this.buildSystem(this.fieldMappings as any, callback as any);

    // Register with world
    this.world._registerSystem(system);

    return system;
  }

  /**
   * Build the executable system with cached field arrays and proxy entity.
   * @private
   */
  private buildSystem(fieldMappings: any[], userCallback: (entity: any, deltaTime: number) => void): ExecutableSystem {
    const world = this.world;
    const components = this.components;

    // Cache field arrays once at system creation
    const fieldArrayCache: Record<string, Record<string, any>> = {};
    const componentByAlias: Record<string, Component<any>> = {};

    // Iterate over components and their field mappings
    for (let i = 0; i < components.length; i++) {
      const component = components[i]!;
      const mapping = fieldMappings[i];

      if (!mapping) continue;

      // Extract alias and fields from { alias: ['fields'] } object
      const alias = Object.keys(mapping)[0]!;
      const fields = mapping[alias];

      componentByAlias[alias] = component;
      fieldArrayCache[alias] = {};

      // Cache all field arrays for this component
      for (const fieldName of fields) {
        const array = (world as any).getFieldArray(component, fieldName);
        fieldArrayCache[alias][fieldName as string] = array;
      }
    }

    // Create the executable system
    return new ExecutableSystem(
      world,
      components,
      userCallback,
      fieldArrayCache,
      componentByAlias
    );
  }
}

/**
 * Executable system that can be run with world.runSystems().
 *
 * Contains cached field arrays and generates proxy entities for ergonomic access.
 */
export class ExecutableSystem {
  private currentEid: Entity = 0;

  constructor(
    private world: World,
    private components: Component<any>[],
    private userCallback: (entity: any, deltaTime: number) => void,
    private fieldArrayCache: Record<string, Record<string, any>>,
    private componentByAlias: Record<string, Component<any>>
  ) {}

  /**
   * Execute the system for all matching entities.
   *
   * @param deltaTime - Time delta to pass to system callback
   */
  execute(deltaTime: number): void {
    const entities = this.world.query(...this.components);
    const proxyEntity = this.createProxyEntity();

    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i]!;
      this.currentEid = eid;
      this.userCallback(proxyEntity, deltaTime);
    }
  }

  /**
   * Create a proxy entity that maps field access to direct array access.
   * @private
   */
  private createProxyEntity(): any {
    const entity: any = {};
    const currentEidGetter = () => this.currentEid;

    // Create proxy for each component alias
    for (const [alias, fields] of Object.entries(this.fieldArrayCache)) {
      entity[alias] = {};

      for (const [fieldName, array] of Object.entries(fields)) {
        Object.defineProperty(entity[alias], fieldName, {
          get: () => {
            const eid = currentEidGetter();
            return array[eid];
          },
          set: (value: any) => {
            const eid = currentEidGetter();
            array[eid] = value;
          },
          enumerable: true,
          configurable: false
        });
      }

      // Seal the component proxy to prevent accidental property additions
      Object.seal(entity[alias]);
    }

    return entity;
  }

  /**
   * Get the components this system operates on.
   */
  getComponents(): Component<any>[] {
    return this.components;
  }
}
