# kulturas

A hex-grid, turn-based civilisation-style game. Phaser 3 renders the map; Solid.js renders the
HUD and menus on top. Single Vite app, no backend. Remote: `bluebird-technologies/my-phaser-game`.

## Stack

- TypeScript, Vite 5, Phaser 3, Solid.js via `vite-plugin-solid` (JSX import source `solid-js`),
  `simplex-noise` for map generation, CSS Modules for UI styling. Package manager: pnpm.

## Layout

- `src/main.ts` boots Phaser; `src/scenes/HexGridScene.ts` is the main scene.
- `src/*.ts` are the game systems: hex maths, mapgen, pathfinding, economy, combat, entities,
  actions, visibility, save/load, event log, sprites, theme.
- `src/ui/` holds Solid components with sibling `.module.css` files (HUD, cards, action bar,
  save/load menu, knowledge tree).
- `src/kitchen-sink/` and `kitchen-sink/index.html` form a second Vite entry that showcases
  components and Phaser rendering.
- `public/assets/` holds sprites and images; `dist/` is build output (ignored).

## Commands

- `pnpm dev` — Vite dev server
- `pnpm check` — `prettier --check . && eslint . && tsc --noEmit`
- `pnpm format` — Prettier write
- `pnpm build` / `pnpm preview` — production bundle

## Conventions

- Prettier: tabs (width 4), print width 100, double quotes, trailing commas. `pnpm check`
  runs Prettier on every file including Markdown, so format docs too.
- ESLint flat config (`eslint.config.js`): `@eslint/js` recommended, typescript-eslint
  recommended, `eslint-config-prettier`.
- No tests exist; `pnpm check` is the only gate. There is no README.

## Quality gate

Run `pnpm check` before committing.
