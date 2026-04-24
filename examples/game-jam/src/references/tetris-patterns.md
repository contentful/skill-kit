# Tetris Game Design Patterns

## Core Mechanics

**Board:** A 10-wide, 20-tall grid. Cells are either empty or filled with a color.

**Pieces (Tetrominoes):** Seven standard shapes: I, O, T, S, Z, J, L. Each is a 4-cell polyomino.

**Gravity:** Pieces fall at a rate that increases with level. Soft drop (accelerate) and hard drop (instant place) are standard.

**Line Clearing:** When a row is completely filled, it is removed and all rows above shift down. Clearing multiple lines at once awards bonus points.

**Rotation:** Use the Super Rotation System (SRS) for wall kicks and floor kicks. This allows pieces to rotate even when adjacent to walls or other pieces.

## Scoring

| Action | Points |
|--------|--------|
| Single line | 100 × level |
| Double | 300 × level |
| Triple | 500 × level |
| Tetris (4 lines) | 800 × level |
| T-Spin Single | 800 × level |
| T-Spin Double | 1200 × level |
| Soft drop | 1 per cell |
| Hard drop | 2 per cell |

## Rendering Approaches

**Canvas:** Best for performance. Draw the grid as colored rectangles. Straightforward to implement ghost pieces and animations.

**DOM:** Use a CSS Grid or table of div elements. Easier to style with CSS but slower for animations. Good for simple implementations.

**WebGL:** Overkill for standard Tetris, but enables 3D effects, particle systems, and shader-based visuals.

## Architecture Tips

- Separate game state from rendering. The board should be a pure data structure.
- Use a game loop with requestAnimationFrame for smooth rendering.
- Handle input through a key-state map, not individual keydown events.
- Implement a "bag" randomizer: shuffle all 7 pieces, deal them in order, repeat. This prevents long droughts of any piece.
