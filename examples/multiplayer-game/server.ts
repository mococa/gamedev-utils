import { ServerNetwork } from "../../src/net/server";
import { BunWebSocketServerTransport } from "../../src/net/adapters/bun-websocket";
import {
    Simulation,
    createIntentRegistry,
    createSnapshotRegistry,
    Intents,
    type GameStateUpdate,
} from "./shared";

const PORT = 3007;
const HTTP_PORT = 3008;

class GameServer {
    simulation: Simulation;
    network: ServerNetwork<any, GameStateUpdate>;
    currentTick = 0;

    constructor() {
        this.simulation = new Simulation({
            onTick: (deltaTime, tick) => {
                this.currentTick = tick ?? 0;
                // Server doesn't need input before tick - velocities are set by intents
            },
            onTickAfter: () => {
                // Send snapshots to all peers (only if game state changed)
                const gameState = this.simulation.getGameState();
                let peersToUpdate = 0;

                for (const peerId of this.network.getPeerIds()) {
                    const confirmedClientTick = this.network.getConfirmedClientTick(peerId);

                    // sendSnapshotToPeerIfChanged automatically detects changes using hash comparison
                    if (this.network.sendSnapshotToPeerIfChanged(peerId, 'gameState', {
                        tick: confirmedClientTick, // Client tick for reconciliation
                        updates: gameState,
                    })) {
                        peersToUpdate++;
                    }
                }

                if (peersToUpdate > 0) {
                    console.log(`Server tick ${this.currentTick}: Sent snapshots to ${peersToUpdate}/${this.network.getPeerIds().length} peers`);
                }
            },
        });

        // Create transport
        const transport = BunWebSocketServerTransport.create(PORT);

        // Create network with intents and snapshots
        this.network = new ServerNetwork({
            transport,
            intentRegistry: createIntentRegistry(),
            createPeerSnapshotRegistry: createSnapshotRegistry,
            config: {
                debug: false,
                heartbeatInterval: 10000,  // Send heartbeat every 10 seconds
                heartbeatTimeout: 45000,   // Timeout after 45 seconds of no messages
            },
        });

        this.setupNetworkHandlers();
    }

    setupNetworkHandlers() {
        // Handle new player connections
        this.network.onConnection((peerId) => {
            console.log(`Player connected: ${peerId}`);
            this.simulation.spawn(peerId);

            // Send initial game state to the new player immediately
            const gameState = this.simulation.getGameState();
            this.network.sendSnapshotToPeer(peerId, 'gameState', {
                tick: 0, // No client ticks confirmed yet
                updates: gameState,
            });
        });

        // Handle player disconnections
        this.network.onDisconnection((peerId) => {
            console.log(`Player disconnected: ${peerId}`);
            this.simulation.removePlayer(peerId);
            // Note: ServerNetwork automatically cleans up internal state
        });

        // Handle move intents
        this.network.onIntent(Intents.Move, (peerId, intent) => {
            console.log(`Intent received: peer=${peerId.substring(0, 8)}, clientTick=${intent.tick}, serverTick=${this.currentTick}, direction=(${intent.vx},${intent.vy})`);

            // setPlayerVelocity handles normalization and speed calculation
            this.simulation.setPlayerVelocity(peerId, intent.vx, intent.vy);
        });
    }

    start() {
        console.log(`Game server starting on port ${PORT}...`);
        console.log(`WebSocket endpoint: ws://mococa:${PORT}`);
        console.log(`HTTP server starting on port ${HTTP_PORT}...`);
        console.log(`Open http://mococa:${HTTP_PORT} in your browser to play!`);

        // Start HTTP server to serve the client
        this.startHttpServer();

        // Game loop - simulation.update() will trigger onTick callback
        let lastTime = performance.now();
        setInterval(() => {
            const currentTime = performance.now();
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;

            // Update simulation (this triggers onTick callback which handles responses)
            this.simulation.update(deltaTime);
        }, 1000 / this.simulation.ticker.rate);
    }

    startHttpServer() {
        Bun.serve({
            port: HTTP_PORT,
            async fetch(req) {
                const url = new URL(req.url);

                // Serve the client HTML file
                if (url.pathname === '/' || url.pathname === '/index.html') {
                    const file = Bun.file('./client.html');
                    return new Response(file, {
                        headers: {
                            'Content-Type': 'text/html',
                        },
                    });
                }

                // Serve the bundled client JS
                if (url.pathname === '/client.js') {
                    const file = Bun.file('./client.js');
                    return new Response(file, {
                        headers: {
                            'Content-Type': 'application/javascript',
                        },
                    });
                }

                return new Response('Not Found', { status: 404 });
            },
        });
    }
}

// Start the server
const server = new GameServer();
server.start();
