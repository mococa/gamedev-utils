/**
 * GameDev Utils
 *
 * A collection of utilities for game development, including:
 * - Binary codecs for efficient serialization
 * - Event system for decoupled communication
 * - Fixed-timestep ticker for deterministic simulation
 * - ID generation utilities
 * - Linear interpolation (lerp) utilities
 * - NavMesh pathfinding with obstacle management
 * - Pooled codecs for zero-allocation networking
 * - Prediction system for client-side prediction
 * - Protocol layer for networked multiplayer games
 */

// Core utilities
export * from "./core";

// Protocol layer for networking
export * from "./protocol";
