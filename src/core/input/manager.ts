import type { ButtonState, InputEventSource, InputHandlers, InputSnapshot } from "./types";

/**
 * Manages input state for keyboard and mouse.
 * Listens to input events from a specified source
 * and provides snapshots of the current input state.
 */
export class InputManager {
    private keys: Record<string, ButtonState> = {};
    private mouse = {
        x: 0, y: 0, dx: 0, dy: 0,
        left: false, right: false, middle: false, scrollDelta: { x: 0, y: 0 },
    };
    private prevKeys: Record<string, boolean> = {};
    private prevMouse = { left: false, right: false, middle: false };
    private handlers: InputHandlers = {
        keydown: (e: KeyboardEvent) => this.onKeyDown(e),
        keyup: (e: KeyboardEvent) => this.onKeyUp(e),
        mousemove: (e: MouseEvent) => this.onMouseMove(e),
        mousedown: (e: MouseEvent) => this.onMouseDown(e),
        mouseup: (e: MouseEvent) => this.onMouseUp(e),
        wheel: (e: WheelEvent) => this.onMouseWheel(e),
        swipe: (direction: 'up' | 'down' | 'left' | 'right') => this.onSwipe(direction),
        pinch: (scale: number) => this.onPinch(scale),
    };
    private inputSource: InputEventSource;

    /**
     * Peeks at the current input state without modifying it.
     * Useful for checking input state without affecting hit/release detection.
     * 
     * @returns A snapshot of the current input state.
     */
    peek(): InputSnapshot {
        const keys: Record<string, ButtonState> = {};

        for (const k in this.keys) {
            const now = this.keys[k].down;
            keys[k] = { down: now, hit: false, released: false };
        }

        return {
            mouse: {
                position: { x: this.mouse.x, y: this.mouse.y },
                delta: {
                    position: { x: this.mouse.dx, y: this.mouse.dy },
                    scroll: { x: this.mouse.scrollDelta.x, y: this.mouse.scrollDelta.y },
                },
                left: { down: this.mouse.left, hit: false, released: false },
                right: { down: this.mouse.right, hit: false, released: false },
                middle: { down: this.mouse.middle, hit: false, released: false },
            },
            keys,
        };
    }

    /**
     * Takes a snapshot of the current input state
     * and returns it. Also updates internal state
     * to prepare for the next snapshot.
     *
     * @returns InputSnapshot of current input state 
     */
    snapshot(): InputSnapshot {
        const keys: Record<string, ButtonState> = {};

        for (const k in this.keys) {
            const now = this.keys[k].down;
            const prev = this.prevKeys[k] ?? false;

            keys[k] = {
                down: now,
                hit: now && !prev,
                released: !now && prev,
            };

            this.prevKeys[k] = now;
        }

        const left = this.mouse.left;

        const snapshot: InputSnapshot = {
            mouse: {
                position: { x: this.mouse.x, y: this.mouse.y },
                delta: {
                    position: { x: this.mouse.dx, y: this.mouse.dy },
                    scroll: { x: this.mouse.scrollDelta.x, y: this.mouse.scrollDelta.y },
                },
                left: button(this.mouse.left, this.prevMouse.left),
                right: button(this.mouse.right, this.prevMouse.right),
                middle: button(this.mouse.middle, this.prevMouse.middle),
            },
            keys,
        };

        this.mouse.dx = this.mouse.dy = 0;
        this.prevMouse.left = left;
        this.prevMouse.right = this.mouse.right;
        this.prevMouse.middle = this.mouse.middle;
        this.mouse.scrollDelta.x = this.mouse.scrollDelta.y = 0;

        return snapshot;
    }

    listen(inputSource: InputEventSource) {
        if (this.inputSource) {
            this.inputSource.detach();
        }

        this.inputSource = inputSource;
        this.inputSource.attach(this.handlers);
    }

    unlisten() {
        if (!this.inputSource) return;
        this.inputSource.detach();
    }

    private onKeyDown(e: KeyboardEvent) {
        this.keys[e.code] = this.keys[e.code] || { down: false, hit: false, released: false };
        this.keys[e.code].down = true;
    }

    private onKeyUp(e: KeyboardEvent) {
        this.keys[e.code] = this.keys[e.code] || { down: false, hit: false, released: false };
        this.keys[e.code].down = false;
    }

    private onMouseMove(e: MouseEvent) {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.mouse.dx += x - this.mouse.x;
        this.mouse.dy += y - this.mouse.y;

        this.mouse.x = x;
        this.mouse.y = y;
    }

    private onMouseDown(e: MouseEvent) {
        if (e.button === 0) this.mouse.left = true;
        if (e.button === 1) this.mouse.middle = true;
        if (e.button === 2) this.mouse.right = true;
    }

    private onMouseUp(e: MouseEvent) {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 1) this.mouse.middle = false;
        if (e.button === 2) this.mouse.right = false;
    }

    private onMouseWheel(e: WheelEvent) {
        this.mouse.scrollDelta.x += e.deltaX;
        this.mouse.scrollDelta.y += e.deltaY;
    }

    private onSwipe(direction: 'up' | 'down' | 'left' | 'right') {
        // TODO: Implement swipe handling
    }

    private onPinch(scale: number) {
        // TODO: Implement pinch handling
    }
}

function button(now: boolean, prev: boolean): ButtonState {
    return {
        down: now,
        hit: now && !prev,
        released: !now && prev,
    };
}
