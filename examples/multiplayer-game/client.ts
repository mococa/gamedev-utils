import {
    ClientNetwork,
    generateId,
    lerp,
    Reconciliator,
} from "../../src";

import { BrowserWebSocketClientTransport } from "../../src/net/adapters/browser-websocket";
import {
    Simulation,
    Intents,
    GameStateUpdate,
    createIntentRegistry,
    createSnapshotRegistry,
    PLAYER_SIZE,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    WS_PORT,
    createRpcRegistry,
    RPCs,
} from "./shared";

/* ================================
   Client
================================ */

export class GameClient {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    network!: ClientNetwork<GameStateUpdate>;
    simulation: Simulation;

    myId: string | null = null;
    connected = false;

    keys: Record<string, boolean> = {};
    lastSnapshotTick = 0;

    reconciler: Reconciliator<Intents.Move, GameStateUpdate>;
    previousPositions: Map<string, { x: number; y: number }> = new Map();
    lerpAlpha: number = 1;

    constructor() {
        this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;

        this.simulation = new Simulation();

        // Hook into tick event to apply input and send intents
        this.simulation.events.on('tick', ({ tick }) => this.tick(tick));

        this.reconciler = new Reconciliator({
            onLoadState: (state) => this.loadSnapshot(state),
            onReplay: (intents) => {
                if (intents.length > 0) {
                    console.log(`Replaying ${intents.length} intents for prediction correction.`);
                }

                // Replay each intent: apply velocity + step
                // This must match the tick() logic exactly
                for (const intent of intents) {
                    this.simulation.applyVelocity(this.myId!, intent);
                    this.simulation.step();
                }
            },
        });

        this.setupInput();
        this.connect();
    }

    /* ================================
       Networking
    ================================ */

    connect() {
        const transport = new BrowserWebSocketClientTransport(`ws://mococa:${WS_PORT}`);

        this.network = new ClientNetwork({
            transport,
            intentRegistry: createIntentRegistry(),
            snapshotRegistry: createSnapshotRegistry(),
            rpcRegistry: createRpcRegistry(),
            config: {
                debug: false,
                heartbeatInterval: 15000,
                heartbeatTimeout: 45000,
            },
        });

        this.network.onConnect(() => {
            this.connected = true;
            console.log('connected.');

            const id = generateId({ prefix: 'player_', size: 16 });
            this.myId = id;
            this.network.sendRpc(RPCs.SpawnPlayer, { id });
            this.simulation.spawn(id);
            this.start();
        });

        this.network.onSnapshot("gameState", (snapshot) => {
            if (!snapshot.updates) return;

            this.reconciler.onSnapshot({
                tick: snapshot.tick,
                state: snapshot.updates as GameStateUpdate,
            });
        });
    }

    /* ================================
       Input
    ================================ */

    setupInput() {
        window.addEventListener("keydown", e => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener("keyup", e => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    readInput() {
        let vx = 0;
        let vy = 0;

        if (this.keys["w"] || this.keys["arrowup"]) vy -= 1;
        if (this.keys["s"] || this.keys["arrowdown"]) vy += 1;
        if (this.keys["a"] || this.keys["arrowleft"]) vx -= 1;
        if (this.keys["d"] || this.keys["arrowright"]) vx += 1;

        return { vx, vy };
    }

    /* ================================
       Game Loop
    ================================ */

    start() {
        let last = performance.now();

        const loop = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;

            this.simulation.update(dt);
            this.render();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    tick(tick: number) {
        if (!this.connected || !this.myId) return;

        const input = this.readInput();

        // Create intent
        const intent: Intents.Move = {
            kind: Intents.Move.kind,
            tick,
            vx: input.vx,
            vy: input.vy,
        };

        // Send intent to server and track locally
        this.network.sendIntent(intent);
        this.reconciler.trackIntent(tick, intent);

        // Apply client-side prediction (must match replay logic)
        this.simulation.applyVelocity(this.myId, intent);
        this.simulation.step();
    }

    /* ================================
       Snapshot Handling
    ================================ */

    loadSnapshot(state: GameStateUpdate) {
        for (const p of state) {
            let player = this.simulation.players.get(p.id);

            if (!player) {
                // Spawn new player from server snapshot
                player = this.simulation.spawn(p.id);
            }

            // Update position from authoritative server state
            player.x = p.x;
            player.y = p.y;
            player.color = p.color;
        }
    }

    /* ================================
       Rendering
    ================================ */

    renderGrid() {
        this.ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.ctx.fillStyle = '#0f3460';
        this.ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        this.ctx.strokeStyle = 'rgba(78, 205, 196, 0.1)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < WORLD_WIDTH; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, WORLD_HEIGHT);
            this.ctx.stroke();
        }
        for (let y = 0; y < WORLD_HEIGHT; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(WORLD_WIDTH, y);
            this.ctx.stroke();
        }
    }

    renderPlayers() {
        for (const [playerId, player] of this.simulation.players) {
            let x = player.x;
            let y = player.y;

            const prev = this.previousPositions.get(playerId);
            if (prev) {
                x = lerp(prev.x, player.x, this.simulation.ticker.alpha);
                y = lerp(prev.y, player.y, this.simulation.ticker.alpha);
                prev.x = x;
                prev.y = y;
            } else if (playerId !== this.myId) {
                this.previousPositions.set(playerId, { x, y });
            }

            this.ctx.fillStyle = player.color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, PLAYER_SIZE / 2, 0, Math.PI * 2);
            this.ctx.fill();

            if (playerId === this.myId) {
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(playerId.substring(0, 8), x, y - PLAYER_SIZE);
        }
    }

    renderDebugInfo() {
        this.ctx.fillStyle = '#4ECDC4';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Players: ${this.simulation.players.size}`, 10, 20);
        this.ctx.fillText(`My ID: ${this.myId ? this.myId.substring(0, 12) : 'none'}`, 10, 40);
        this.ctx.fillText(`Tick: ${this.simulation.ticker.tickCount}`, 10, 60);
    }

    render() {
        this.renderGrid();
        this.renderPlayers();
        this.renderDebugInfo();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
