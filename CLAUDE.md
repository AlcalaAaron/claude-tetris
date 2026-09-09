# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A playable Tetris clone in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running / testing

There is no build, lint, or test tooling. To run the game, just open `index.html` directly in a browser, or serve the directory statically:

```bash
npx serve .
# or: python3 -m http.server 8000
```

There are no automated tests. Verify changes by loading the page and playing the game manually (movement, rotation, line clears, pause, game over/restart).

## Architecture

Three files, no modules/bundler — everything is global scope loaded via a single `<script src="game.js">`.

- `index.html` — DOM shell: the `#board` canvas (300×600, i.e. `COLS(10) × BLOCK(30)` by `ROWS(20) × BLOCK(30)`), the `#next-canvas` preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro visual theme only; no game logic.
- `game.js` — all state and logic, structured around a `requestAnimationFrame` loop:
  - **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-color index (1–7).
  - **Pieces**: `PIECES` are square matrices; rotation is done via `rotateCW` (transpose), and `tryRotate` applies wall-kick offsets `[0, -1, 1, -2, 2]` on collision.
  - **Collision**: `collide(shape, ox, oy)` is the single source of truth for both movement and rotation legality — reuse it rather than writing bespoke bounds checks.
  - **Game loop**: `loop(ts)` accumulates elapsed time (`dropAccum`) against `dropInterval` and advances the piece or calls `lockPiece()`.
  - **Locking/clearing**: `lockPiece` → `merge` (bakes piece into `board`) → `clearLines` (bottom-up scan, splices full rows, updates score/level/`dropInterval`) → `spawn` (promotes `next` to `current`, generates a new `next`; if the new piece immediately collides, calls `endGame`).
  - **Ghost piece**: `ghostY()` projects the current piece straight down; used both for drawing (`draw`, alpha 0.2) and by `hardDrop`.
  - **Scoring**: `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop = 2 pts/cell dropped, soft drop = 1 pt/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
  - All rendering goes through `drawBlock(context, x, y, colorIndex, size, alpha)`, shared by the board canvas and the next-piece preview canvas.
  - Input is a single `keydown` listener switching on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause).

If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
