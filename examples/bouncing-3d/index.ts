import createContext from 'pex-context';
import { perspective as createCamera, orbiter as createOrbiter } from 'pex-cam';
import { mat4 } from 'pex-math';
import { cube, sphere } from 'primitive-geometry';
import {
  World,
  defineComponent,
  BinaryCodec,
  lerp,
  GameLoop,
} from '../../src';

// Separate components for better ECS architecture
namespace Components {
  export const Position = defineComponent('Position', {
    x: BinaryCodec.f32,
    y: BinaryCodec.f32,
    z: BinaryCodec.f32,
  });

  export const Rotation = defineComponent('Rotation', {
    x: BinaryCodec.f32,
    y: BinaryCodec.f32,
    z: BinaryCodec.f32,
  });

  export const Scale = defineComponent('Scale', {
    x: BinaryCodec.f32,
    y: BinaryCodec.f32,
    z: BinaryCodec.f32,
  });

  export const Velocity = defineComponent('Velocity', {
    x: BinaryCodec.f32,
    y: BinaryCodec.f32,
    z: BinaryCodec.f32,
  });

  export const Model = defineComponent('Model', {
    modelId: BinaryCodec.u8,
  });

  export const Health = defineComponent('Health', {
    value: BinaryCodec.f32,
  });

  export const ScaleSpeed = defineComponent('ScaleSpeed', {
    value: BinaryCodec.f32,
  });
}

const WIDTH = Math.min(1200, window.innerWidth - 8);
const HEIGHT = Math.min(800, window.innerHeight - 8);
const DEPTH = 600;

interface ModelData {
  vertexBuffer: any;
  indexBuffer: any;
  indexCount: number;
  normalBuffer?: any;
  color?: number[];
}

interface InterpolationState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

/**
 * PexRenderer handles rendering of entities using pex for 3D graphics.
 * It loads GLTF models from URLs and interpolates entity transforms for smooth rendering.
 */
class PexRenderer {
  ctx: any;
  camera: any;
  orbiter: any;
  models: ModelData[] = [];
  modelInstances: Map<number, number[]> = new Map(); // mat4 is a number array
  pipeline: any;
  clearPass: any;

  // Interpolation state per entity
  previousState: Map<number, InterpolationState> = new Map();

  constructor() { }

  async init() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);

    // Create WebGL context using pex
    this.ctx = createContext({ canvas, pixelRatio: window.devicePixelRatio });

    // Setup camera
    this.camera = createCamera({
      fov: Math.PI / 4,
      aspect: WIDTH / HEIGHT,
      near: 0.1,
      far: 2000,
      position: [WIDTH * 0.5, HEIGHT * 0.5, 1200],
      target: [WIDTH * 0.5, HEIGHT * 0.5, 0],
    });

    // Setup orbiter for camera control
    this.orbiter = createOrbiter({ camera: this.camera, element: canvas });

    // Create pipeline with shaders
    this.pipeline = this.ctx.pipeline({
      vert: `
        attribute vec3 aPosition;
        attribute vec3 aNormal;

        uniform mat4 uProjectionMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uModelMatrix;

        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
          vPosition = worldPos.xyz;
          vNormal = mat3(uModelMatrix) * aNormal;
          gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }
      `,
      frag: `
        #ifdef GL_ES
        precision highp float;
        #endif

        varying vec3 vNormal;
        varying vec3 vPosition;

        uniform vec3 uLightPos;
        uniform vec3 uColor;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 lightDir = normalize(uLightPos - vPosition);
          float diff = max(dot(normal, lightDir), 0.0);
          vec3 ambient = 0.3 * uColor;
          vec3 diffuse = diff * uColor;
          gl_FragColor = vec4(ambient + diffuse, 1.0);
        }
      `,
      depthTest: true,
      cullFace: true,
    });

    // Create clear pass
    this.clearPass = this.ctx.pass({
      clearColor: [0.1, 0.1, 0.12, 1],
      clearDepth: 1,
    });

    // Create geometric models (cube and sphere primitives)
    await this.createGeometricModels();
  }

  async createGeometricModels() {
    // Create a cube
    const cubeGeom = cube();
    this.models.push(this.createModelFromGeometry(cubeGeom, [1.0, 0.2, 0.2])); // Red

    // Create a sphere
    const sphereGeom = sphere();
    this.models.push(this.createModelFromGeometry(sphereGeom, [0.2, 1.0, 0.2])); // Green

    // Load Suzanne model from Khronos glTF samples
    await this.loadGltfModel(
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Suzanne/glTF/Suzanne.gltf',
      [0.2, 0.2, 1.0] // Blue
    );
  }

  createModelFromGeometry(geom: any, color: number[]): ModelData {
    return {
      vertexBuffer: this.ctx.vertexBuffer(geom.positions),
      normalBuffer: this.ctx.vertexBuffer(geom.normals),
      indexBuffer: this.ctx.indexBuffer(geom.cells),
      indexCount: geom.cells.length * 3,
      color,
    };
  }

  async loadGltfModel(url: string, color: number[]) {
    try {
      console.log(`Loading GLTF model from ${url}...`);

      // Fetch the GLTF JSON
      const response = await fetch(url);
      const gltf = await response.json();

      // Get the base URL for loading binary and texture files
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      // Parse the first mesh in the GLTF file
      if (gltf.meshes && gltf.meshes.length > 0) {
        const mesh = gltf.meshes[0];
        const primitive = mesh.primitives[0];

        // Load buffers
        const bufferPromises = gltf.buffers.map(async (buffer: any) => {
          const bufferUrl = baseUrl + buffer.uri;
          const bufferResponse = await fetch(bufferUrl);
          return await bufferResponse.arrayBuffer();
        });
        const buffers = await Promise.all(bufferPromises);

        // Extract accessor data for vectors (positions, normals)
        const getVectorData = (accessorIndex: number): number[][] => {
          const accessor = gltf.accessors[accessorIndex];
          const bufferView = gltf.bufferViews[accessor.bufferView];
          const buffer = buffers[bufferView.buffer];

          const componentTypeMap: { [key: number]: any } = {
            5126: Float32Array, // FLOAT
            5123: Uint16Array,  // UNSIGNED_SHORT
            5125: Uint32Array,  // UNSIGNED_INT
          };

          const TypedArray = componentTypeMap[accessor.componentType];
          const elementSizeMap: { [key: string]: number } = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
          const elementSize = elementSizeMap[accessor.type as string] || 1;

          const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
          const data = new TypedArray(buffer, byteOffset, accessor.count * elementSize);

          const result: number[][] = [];
          for (let i = 0; i < accessor.count; i++) {
            const element: number[] = [];
            for (let j = 0; j < elementSize; j++) {
              element.push(data[i * elementSize + j]);
            }
            result.push(element);
          }
          return result;
        };

        // Extract accessor data for scalars (indices)
        const getScalarData = (accessorIndex: number): number[] => {
          const accessor = gltf.accessors[accessorIndex];
          const bufferView = gltf.bufferViews[accessor.bufferView];
          const buffer = buffers[bufferView.buffer];

          const componentTypeMap: { [key: number]: any } = {
            5126: Float32Array, // FLOAT
            5123: Uint16Array,  // UNSIGNED_SHORT
            5125: Uint32Array,  // UNSIGNED_INT
          };

          const TypedArray = componentTypeMap[accessor.componentType];
          const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
          const data = new TypedArray(buffer, byteOffset, accessor.count);

          return Array.from(data);
        };

        // Get positions, normals, and indices
        const positions = getVectorData(primitive.attributes.POSITION);
        const normals = primitive.attributes.NORMAL !== undefined
          ? getVectorData(primitive.attributes.NORMAL)
          : positions.map(() => [0, 1, 0]); // Default normals if not provided
        const indices = primitive.indices !== undefined
          ? getScalarData(primitive.indices)
          : positions.map((_: any, i: number) => i); // Generate indices if not provided

        // Create buffers
        const positionsFlat = new Float32Array(positions.flatMap(p => p));
        const normalsFlat = new Float32Array(normals.flatMap(n => n));
        const indicesArray = indices.length > 65535
          ? new Uint32Array(indices)
          : new Uint16Array(indices);

        this.models.push({
          vertexBuffer: this.ctx.vertexBuffer(positionsFlat),
          normalBuffer: this.ctx.vertexBuffer(normalsFlat),
          indexBuffer: this.ctx.indexBuffer(indicesArray),
          indexCount: indices.length,
          color,
        });

        console.log(`Successfully loaded GLTF model from ${url}`);
      }
    } catch (error) {
      console.error(`Failed to load GLTF model from ${url}:`, error);
    }
  }

  /**
   * Store the previous state of all entities for interpolation.
   */
  storePreviousState(world: World) {
    for (const eid of world.query(Components.Position)) {
      const position = world.get(eid, Components.Position);
      const rotation = world.has(eid, Components.Rotation)
        ? world.get(eid, Components.Rotation)
        : { x: 0, y: 0, z: 0 };
      const scale = world.has(eid, Components.Scale)
        ? world.get(eid, Components.Scale)
        : { x: 1, y: 1, z: 1 };

      this.previousState.set(eid, {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
        scale: { x: scale.x, y: scale.y, z: scale.z },
      });
    }
  }

  /**
   * Render the ECS world using pex.
   * Interpolates entity transforms with the given alpha factor.
   */
  render(world: World, alpha: number) {
    const ctx = this.ctx;

    // Setup projection and view matrices
    const projectionMatrix = this.camera.projectionMatrix;
    const viewMatrix = this.camera.viewMatrix;

    // Light position
    const lightPos = [WIDTH * 0.5, HEIGHT * 2, 800];

    // Render each entity with Position, Scale, and Model components
    const query = world.query(Components.Position, Components.Scale, Components.Model);

    // Collect all draw commands first
    const drawCommands: any[] = [];

    for (const eid of query) {
      let modelMatrix = this.modelInstances.get(eid)!;

      // Create model matrix if it doesn't exist
      if (!modelMatrix) {
        modelMatrix = mat4.create();
        this.modelInstances.set(eid, modelMatrix);
      }

      // Get current state
      const position = world.get(eid, Components.Position);
      const rotation = world.has(eid, Components.Rotation)
        ? world.get(eid, Components.Rotation)
        : { x: 0, y: 0, z: 0 };
      const scale = world.get(eid, Components.Scale);
      const model = world.get(eid, Components.Model);

      // Interpolate for smooth rendering
      const prev = this.previousState.get(eid);
      let x, y, z, rotX, rotY, rotZ, scaleX, scaleY, scaleZ;

      if (prev) {
        x = lerp(prev.position.x, position.x, alpha);
        y = lerp(prev.position.y, position.y, alpha);
        z = lerp(prev.position.z, position.z, alpha);
        rotX = lerp(prev.rotation.x, rotation.x, alpha);
        rotY = lerp(prev.rotation.y, rotation.y, alpha);
        rotZ = lerp(prev.rotation.z, rotation.z, alpha);
        scaleX = lerp(prev.scale.x, scale.x, alpha);
        scaleY = lerp(prev.scale.y, scale.y, alpha);
        scaleZ = lerp(prev.scale.z, scale.z, alpha);
      } else {
        x = position.x;
        y = position.y;
        z = position.z;
        rotX = rotation.x;
        rotY = rotation.y;
        rotZ = rotation.z;
        scaleX = scale.x;
        scaleY = scale.y;
        scaleZ = scale.z;
      }

      // Build model matrix
      mat4.identity(modelMatrix);
      mat4.translate(modelMatrix, [x, y, z]);
      mat4.rotate(modelMatrix, rotX, [1, 0, 0]); // Rotate around X axis
      mat4.rotate(modelMatrix, rotY, [0, 1, 0]); // Rotate around Y axis
      mat4.rotate(modelMatrix, rotZ, [0, 0, 1]); // Rotate around Z axis
      mat4.scale(modelMatrix, [scaleX, scaleY, scaleZ]);

      // Get the model data
      const modelData = this.models[model.modelId % this.models.length];

      if (modelData && modelData.vertexBuffer) {
        drawCommands.push({
          pipeline: this.pipeline,
          attributes: {
            aPosition: modelData.vertexBuffer,
            aNormal: modelData.normalBuffer,
          },
          indices: modelData.indexBuffer,
          uniforms: {
            uProjectionMatrix: projectionMatrix,
            uViewMatrix: viewMatrix,
            uModelMatrix: modelMatrix,
            uLightPos: lightPos,
            uColor: modelData.color || [1.0, 1.0, 1.0],
          },
        });
      }
    }

    // Submit all draw commands within the pass
    ctx.submit(this.clearPass, () => {
      for (const cmd of drawCommands) {
        ctx.submit(cmd);
      }
    });
  }

  /**
   * Clean up model instances for despawned entities.
   */
  cleanup(world: World) {
    for (const [eid] of this.modelInstances) {
      if (!world.isAlive(eid)) {
        this.modelInstances.delete(eid);
        this.previousState.delete(eid);
      }
    }
  }
}

const AMOUNT_OF_ENTITIES = 3_000; // Reduced for 3D performance

/**
 * Game class with ECS simulation and pex 3D rendering.
 */
class Game extends GameLoop {
  world: World;
  renderer: PexRenderer;

  constructor() {
    super({ tickRate: 44, type: 'client' });

    this.events.on('render', ({ alpha, deltaTime }) => {
      this.renderer.render(this.world, alpha);
    });

    this.events.on('skip', ({ ticks }) => {
      this.world.runSystems(ticks / this.options.tickRate);
    })

    this.events.on('tick', ({ tick, deltaTime }) => {
      this.renderer.storePreviousState(this.world); // store previous state for renderer lerping
      this.world.runSystems(deltaTime);
      this.renderer.cleanup(this.world); // remove despawned entities from renderer

      if (tick % (this.options.tickRate * 2) === 0) {
        const fpsEl = document.querySelector("#fps");
        if (!fpsEl) return;

        fpsEl.textContent = `FPS: ${this.fps.toFixed(2)} | Entities: ${this.world.getEntityCount()}`;
      }
    });

    // Setup ECS world
    this.world = new World({
      maxEntities: AMOUNT_OF_ENTITIES + 100,
      components: Object.values(Components),
    });

    // Setup Pex renderer
    this.renderer = new PexRenderer();

    this.setupSystems();

    this.renderer.init().then(() => {
      this.spawnEntities();
      this.start();

      const fpsEl = document.querySelector("#fps");
      if (!fpsEl) return;
      fpsEl.textContent = `FPS: ${this.fps.toFixed(2)} | Entities: ${this.world.getEntityCount()}`;
    });
  }

  setupSystems() {
    // Movement system - updates position from velocity in 3D
    this.world
      .addSystem()
      .query(Components.Position, Components.Velocity, Components.Rotation)
      .fields([
        { position: ['x', 'y', 'z'] },
        { velocity: ['x', 'y', 'z'] },
        { rotation: ['x', 'y', 'z'] }
      ])
      .run((entity, deltaTime) => {
        entity.position_x += entity.velocity_x * deltaTime;
        entity.position_y += entity.velocity_y * deltaTime;
        entity.position_z += entity.velocity_z * deltaTime;

        // Add rotation for visual effect
        entity.rotation_x += deltaTime * 0.5;
        entity.rotation_y += deltaTime * 0.3;
      });

    // Bounce system - inverts velocity when hitting bounds in 3D
    this.world
      .addSystem()
      .query(Components.Position, Components.Velocity)
      .fields([
        { position: ['x', 'y', 'z'] },
        { velocity: ['x', 'y', 'z'] }
      ])
      .when((entity) => {
        return (
          entity.position_x <= 0 ||
          entity.position_x >= WIDTH ||
          entity.position_y <= 0 ||
          entity.position_y >= HEIGHT ||
          entity.position_z <= -DEPTH ||
          entity.position_z >= DEPTH
        );
      })
      .run((entity) => {
        if (entity.position_x <= 0 || entity.position_x >= WIDTH) {
          entity.velocity_x *= -1;
        }
        if (entity.position_y <= 0 || entity.position_y >= HEIGHT) {
          entity.velocity_y *= -1;
        }
        if (entity.position_z <= -DEPTH || entity.position_z >= DEPTH) {
          entity.velocity_z *= -1;
        }
      });

    // Health decay system
    this.world.addSystem()
      .query(Components.Health)
      .fields([{ health: ['value'] }])
      .run((entity, deltaTime) => {
        entity.health_value -= 10 * deltaTime;
      });

    // Rescaling system - in a sine wave pattern
    this.world.addSystem()
      .query(Components.Scale, Components.ScaleSpeed)
      .fields([
        { scale: ['x', 'y', 'z'] },
        { factor: ['value'] }
      ])
      .run((entity, deltaTime) => {
        const speed = entity.factor_value * deltaTime * 0.15;
        const amplitude = 0.75;
        const ellapsed = Date.now();
        const scaleAmount = Math.sin(ellapsed * speed) * amplitude + 1.0;

        entity.scale_x = 10 * scaleAmount;
        entity.scale_y = 10 * scaleAmount;
        entity.scale_z = 10 * scaleAmount;
      });

    // Despawn system
    this.world.addSystem()
      .query(Components.Health)
      .fields([{ health: ['value'] }])
      .when((entity) => entity.health_value <= 0)
      .run((entity) => {
        entity.despawn();
      });
  }

  spawnEntities() {
    // Spawn entities with random 3D positions, velocities and sizes
    for (let i = 0; i < AMOUNT_OF_ENTITIES; i++) {
      const eid = this.world.spawn();

      const scale = 5 + Math.random() * 10;

      this.world.entity(eid)
        .add(Components.Health, {
          value: 10000 + Math.floor(Math.random() * 90),
        })
        .add(Components.Position, {
          x: Math.random() * WIDTH,
          y: Math.random() * HEIGHT,
          z: (Math.random() - 0.5) * DEPTH * 2,
        })
        .add(Components.Rotation, {
          x: Math.random() * Math.PI * 2,
          y: Math.random() * Math.PI * 2,
          z: Math.random() * Math.PI * 2,
        })
        .add(Components.Scale, {
          x: scale,
          y: scale,
          z: scale,
        })
        .add(Components.ScaleSpeed, {
          value: Math.random(),
        })
        .add(Components.Velocity, {
          x: (Math.random() - 0.5) * 100,
          y: (Math.random() - 0.5) * 100,
          z: (Math.random() - 0.5) * 100,
        })
        .add(Components.Model, {
          modelId: Math.floor(Math.random() * 3), // 0=cube, 1=sphere, 2=Suzanne
        });
    }
  }
}

new Game();
