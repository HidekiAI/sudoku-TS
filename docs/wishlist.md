# Wishlist

> Future feature ideas. Not planned, not committed — just tracked so they don't get forgotten.

## Annotations (pencil marks)

- Per-cell candidate set (`Set<CellValue>[][]` or `boolean[][][]`)
- Input mode toggle: "place value" vs "toggle annotation"
- Render annotations as small numbers in empty cells (3×3 mini-grid)
- Hint endpoint populates annotations with valid candidates instead of filling the cell
- Annotations stored server-side for persistence

## Leaderboard

- Server tracks completed games with time, moves, hints used
- `GET /api/leaderboard` returns top times per difficulty
- Client shows leaderboard on completion or from menu

## Undo / move history

- Server stores move history per session
- `POST /api/games/:id/undo` reverts last move
- Client bindings (e.g. Ctrl+Z)

## Timer display

- Real-time elapsed timer in client (currently updates only on keypress)
- Could use `Effect.interval` / `Stream` for per-second ticks

## Difficulty unlock progression

- Easy → Medium → Hard → Expert: must complete one to unlock next
- Track unlock state client-side (localStorage)

## Themes / color schemes

- Multiple color palettes (high-contrast, dark, colorblind-friendly)
- Configurable via menu or config file
