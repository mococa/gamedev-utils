import { ClientNetwork, lerp } from "../../src";
import { BrowserWebSocketClientTransport } from "../../src/net/adapters/browser-websocket";
import {
    createIntentRegistry,
    createSnapshotRegistry,
    Intents,
    type GameStateUpdate,
    PLAYER_SIZE,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    Simulation,
} from "./shared";

const WS_PORT = 3007;

class GameClient {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    status: HTMLElement;

    network!: ClientNetwork<GameStateUpdate>;
    connected = false;
    myId: string | null = null;

    keys: Record<string, boolean> = {};
    currentInput: { dx: number; dy: number } = { dx: 0, dy: 0 };

    simulation: Simulation;

    previousPositions: Map<string, { x: number; y: number }> = new Map();
    lerpAlpha = 1;

    localPlayerTickPosition: { x: number; y: number } | null = null;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.status = document.getElementById('status')!;

        this.simulation = new Simulation({
            onTick: (deltaTime, tick) => {
                this.handleTickInput();
            },
        });

        this.lerpAlpha = 3 * (1 / this.simulation.ticker.rate);

        this.setupInput();
        this.connect();
    }

    connect() {
        this.updateStatus('connecting', 'Connecting...');

        const transport = new BrowserWebSocketClientTransport(`ws://mococa:${WS_PORT}`);

        this.network = new ClientNetwork({
            transport,
            intentRegistry: createIntentRegistry(),
            snapshotRegistry: createSnapshotRegistry(),
            config: {
                debug: false,
                heartbeatInterval: 15000,
                heartbeatTimeout: 45000,
            },
        });

        this.network.onConnect(() => {
            this.connected = true;
            this.updateStatus('connected', 'Connected');
            this.startGameLoop();
        });

        this.network.onDisconnect(() => {
            this.connected = false;
            this.updateStatus('disconnected', 'Disconnected');
        });

        this.network.onSnapshot<GameStateUpdate>('gameState', (snapshot) => {
            this.handleSnapshot(snapshot);
        });
    }

    updateStatus(className: string, text: string) {
        this.status.className = className;
        this.status.textContent = text;
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    getInput() {
        let dx = 0, dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;

        return { dx, dy };
    }

    handleSnapshot(snapshot: { tick: number; updates: Partial<GameStateUpdate> }) {
        if (!this.connected) {
            this.connected = true;
            this.updateStatus('connected', 'Connected');
            this.startGameLoop();
        }

        this.loadAuthoritativeState(snapshot.updates as GameStateUpdate);
    }

    loadAuthoritativeState(players: GameStateUpdate) {
        if (this.myId === null && players.length > 0) {
            const lastPlayer = players[players.length - 1];
            this.myId = lastPlayer.id;
            this.simulation.localPlayerId = this.myId;
        }

        for (const playerData of players) {
            let player = this.simulation.players.get(playerData.id);
            if (!player) {
                player = {
                    id: playerData.id,
                    x: playerData.x,
                    y: playerData.y,
                    vx: 0,
                    vy: 0,
                    color: playerData.color,
                };
                this.simulation.players.set(playerData.id, player);
                if (playerData.id === this.myId) {
                    this.localPlayerTickPosition = { x: playerData.x, y: playerData.y };
                }
            } else {
                player.x = playerData.x;
                player.y = playerData.y;
                if (playerData.id === this.myId && this.localPlayerTickPosition) {
                    this.localPlayerTickPosition.x = playerData.x;
                    this.localPlayerTickPosition.y = playerData.y;
                }
            }
        }
    }

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
                x = lerp(prev.x, player.x, this.lerpAlpha);
                y = lerp(prev.y, player.y, this.lerpAlpha);
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

    startGameLoop() {
        let lastTime = performance.now();

        const loop = (currentTime: number) => {
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            this.captureInput();
            this.simulation.update(deltaTime);
            this.updateLocalPlayerPosition(deltaTime);
            this.render();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    updateLocalPlayerPosition(deltaTime: number) {
        // No local prediction - just use server position
    }

    captureInput() {
        this.currentInput = this.getInput();
    }

    handleTickInput() {
        if (!this.connected) return;

        const input = this.currentInput;

        // Send raw input direction (-1, 0, or 1), server will normalize
        const intent: Intents.Move = {
            kind: Intents.Move.kind,
            tick: this.simulation.ticker.tickCount,
            vx: input.dx,
            vy: input.dy,
        };

        if (this.network.hasIntentChanged(intent, (last, current) =>
            last.vx !== current.vx || last.vy !== current.vy
        )) {
            this.network.sendIntent(intent);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
