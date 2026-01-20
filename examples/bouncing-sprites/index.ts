import { Application, Graphics, Sprite, Texture } from 'pixi.js';
import {
  World,
  defineComponent,
  BinaryCodec,
  createDriver,
  FixedTicker,
  lerp
} from '../../src';


namespace Components {
  export const Transform = defineComponent('Transform', {
    x: BinaryCodec.f32,
    y: BinaryCodec.f32,
    rotation: BinaryCodec.f32,
  });

  export const Velocity = defineComponent('Velocity', {
    vx: BinaryCodec.f32,
    vy: BinaryCodec.f32,
  });

  export const Sprite = defineComponent('Sprite', {
    textureId: BinaryCodec.u16, // Index into texture array
    scale: BinaryCodec.f32,
  });
}

const WIDTH = 1200;
const HEIGHT = 800;

/**
 * PixiRenderer handles rendering of entities using PixiJS.
 * It interpolates entity positions for smooth rendering.
 * It also manages sprite creation and cleanup.
 */
class PixiRenderer {
  app: Application;
  sprites: Map<number, Sprite> = new Map();
  textures: Texture[] = [];

  // Interpolation state
  previousPositions: Map<number, { x: number; y: number; rotation: number }> = new Map();

  constructor() {
    this.app = new Application();
  }

  async init() {
    await this.app.init({
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: 0x1a1a2e,
    });
    document.body.appendChild(this.app.canvas);

    // Create simple colored textures (no external image files needed)
    this.textures.push(this.createCircleTexture(0x00ff00)); // Green
    this.textures.push(this.createCircleTexture(0xff0000)); // Red
  }

  createCircleTexture(color: number): Texture {
    const graphics = new Graphics();
    graphics.circle(16, 16, 16);
    graphics.fill({ color });
    return this.app.renderer.generateTexture(graphics);
  }

  /**
   * Store the previous state of all entities in the world.
   * For interpolation during rendering.
   * 
   * @param world ECS world to store previous state from
   */
  storePreviousState(world: World) {
    for (const eid of world.query(Components.Transform)) {
      const transform = world.get(eid, Components.Transform);
      this.previousPositions.set(eid, {
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation,
      });
    }
  }

  /**
   * Render the ECS world using PixiJS.
   * This runs every frame and interpolates entity positions
   * with the given alpha factor from the fixed ticker.
   * 
   * @param world ECS world to render
   * @param alpha Interpolation factor between ticks
   */
  render(world: World, alpha: number) {
    for (const eid of world.query(Components.Transform, Components.Sprite)) {
      let sprite = this.sprites.get(eid);

      // Create sprite if it doesn't exist
      if (!sprite) {
        const spriteData = world.get(eid, Components.Sprite);
        sprite = new Sprite(this.textures[spriteData.textureId]);
        sprite.anchor.set(0.5);
        sprite.scale.set(spriteData.scale);
        this.app.stage.addChild(sprite);
        this.sprites.set(eid, sprite);
      }

      // Get current physics state
      const transform = world.get(eid, Components.Transform);

      // Interpolate for smooth rendering
      const prev = this.previousPositions.get(eid);
      if (prev) {
        sprite.x = lerp(prev.x, transform.x, alpha);
        sprite.y = lerp(prev.y, transform.y, alpha);
        sprite.rotation = lerp(prev.rotation, transform.rotation, alpha);
      } else {
        sprite.x = transform.x;
        sprite.y = transform.y;
        sprite.rotation = transform.rotation;
      }
    }
  }

  /**
   * Clean up sprites for despawned entities.
   * 
   * @param world ECS world to check for despawned entities
   */
  cleanup(world: World) {
    for (const [eid, sprite] of this.sprites) {
      if (!world.isAlive(eid)) {
        this.app.stage.removeChild(sprite);
        sprite.destroy();
        this.sprites.delete(eid);
        this.previousPositions.delete(eid);
      }
    }
  }
}

const AMOUNT_OF_ENTITIES = 16_000;

/**
 * Game class with ECS simulation calling pixi rendering.
 */
class Game {
  world: World;
  renderer: PixiRenderer;
  ticker: FixedTicker;

  constructor() {
    // Setup ECS world
    this.world = new World({
      maxEntities: AMOUNT_OF_ENTITIES + 100, // Extra buffer for despawned entities
      components: Object.values(Components),
    });

    // Setup Pixi renderer
    this.renderer = new PixiRenderer();

    // Setup fixed ticker (15 ticks per second for deterministic physics)
    this.ticker = new FixedTicker({
      rate: 10,
      onTick: (dt) => {
        this.fixedUpdate(dt);
      },
    });

    // Register physics systems using ergonomic API
    this.setupSystems();

    // Spawn some entities after renderer is ready
    this.renderer.init().then(() => {
      this.spawnEntities();
      this.start();
    });
  }

  setupSystems() {
    // Movement system - updates position from velocity
    this.world
      .addSystem()
      .query(Components.Transform, Components.Velocity)
      .fields([
        { transform: ['x', 'y'] },
        { velocity: ['vx', 'vy'] }
      ])
      .run((entity, deltaTime) => {
        // Ergonomic way yay
        entity.transform_x += entity.velocity_vx * deltaTime;
        entity.transform_y += entity.velocity_vy * deltaTime;

        // invert velocities if hitting bounds
        const tx = entity.transform_x;
        const ty = entity.transform_y;
        if (tx <= 0 || tx >= WIDTH) entity.velocity_vx *= -1;
        if (ty <= 0 || ty >= HEIGHT) entity.velocity_vy *= -1;
      });
  }

  spawnEntities() {
    // Spawn entities with random positions, velocities and sizes
    for (let i = 0; i < AMOUNT_OF_ENTITIES; i++) {
      const eid = this.world.spawn();

      this.world.entity(eid)
        .add(Components.Transform, {
          x: Math.random() * WIDTH,
          y: Math.random() * HEIGHT,
          rotation: 0,
        })
        .add(Components.Velocity, {
          vx: (Math.random() - 0.5) * 100,
          vy: (Math.random() - 0.5) * 100,
        })
        .add(Components.Sprite, {
          textureId: Math.random() > 0.5 ? 0 : 1,
          scale: 0.02 + Math.random() * 0.08,
        });
    }
  }

  fixedUpdate(deltaTime: number) {
    // Store previous state before physics updates
    this.renderer.storePreviousState(this.world);

    // Run systems at fixed rate (Updates physics)
    this.world.runSystems(deltaTime);

    // Clean up despawned entities every 5 seconds
    if (this.ticker.tickCount % (this.ticker.rate * 5) === 0) {
      this.renderer.cleanup(this.world);
    }
  }

  start() {
    // Create client loop driver (uses requestAnimationFrame)
    const driver = createDriver('client', (dt: number) => {
      // Accumulate time and run fixed ticks as needed
      this.ticker.tick(dt);

      // Render with interpolation using alpha
      this.renderer.render(this.world, this.ticker.alpha);
    });

    driver.start();
  }
}

new Game();
