import Phaser from "phaser";
import { COLS, ROWS, HEX_WIDTH, HEX_HEIGHT, getHexCenter, inBounds } from "../hex";
import { generateWorld, drawRivers } from "../mapgen";
import { findPath } from "../pathfinding";
import {
	Entity,
	createEntity,
	isUnit,
	isEnemy,
	resetTurn,
	EntityType,
	TEAM_BLUE,
	TEAM_RED,
} from "../entities";
import { BIOME_YIELDS, RIVER_BONUS, FOREST_BONUS, SPECIAL_RESOURCES } from "../economy";
import { computeVisibleTiles } from "../visibility";
import { canAttackAdjacent, findMoveAndAttackPath, executeAttack, executeMove } from "../combat";
import {
	drawTerrain,
	drawHillshade,
	drawForest,
	drawResources,
	drawTileYields,
	drawEntityIcon,
	drawSelection,
	drawHoverHighlight,
	drawMovePath,
	drawFog,
	playAttackAnimation,
} from "../sprites";
import { mountHUD } from "../ui/GameHUD";
import { createCursorManager, CursorType } from "../ui/cursors";

export class HexGridScene extends Phaser.Scene {
	private isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private camStartX = 0;
	private camStartY = 0;

	constructor() {
		super("HexGridScene");
	}

	create() {
		// --- World ---
		const world = generateWorld();
		const { biomeMap, levelMap, rivers, riverTiles, forestTiles, resourceMap } = world;

		// --- Static layers ---
		drawTerrain(this.add.graphics(), biomeMap, levelMap, ROWS, COLS);
		drawHillshade(this.add.graphics(), levelMap, ROWS, COLS);
		drawRivers(this.add.graphics(), rivers, biomeMap);
		drawForest(this.add.graphics(), forestTiles, ROWS, COLS);
		drawResources(this.add.graphics(), resourceMap);

		// Yield dots on every tile
		const yieldGfx = this.add.graphics();
		for (let row = 0; row < ROWS; row++) {
			for (let col = 0; col < COLS; col++) {
				const biome = biomeMap[row][col];
				const tileYield = { ...BIOME_YIELDS[biome] };
				const key = `${col},${row}`;
				if (forestTiles.has(key)) {
					tileYield.resources += FOREST_BONUS.resources;
					tileYield.growth += FOREST_BONUS.growth;
					tileYield.happiness += FOREST_BONUS.happiness;
					tileYield.knowledge += FOREST_BONUS.knowledge;
				}
				if (riverTiles.has(key)) {
					tileYield.resources += RIVER_BONUS.resources;
					tileYield.growth += RIVER_BONUS.growth;
					tileYield.happiness += RIVER_BONUS.happiness;
					tileYield.knowledge += RIVER_BONUS.knowledge;
				}
				const resId = resourceMap.get(key);
				if (resId) {
					const r = SPECIAL_RESOURCES[resId].yield;
					tileYield.resources += r.resources;
					tileYield.growth += r.growth;
					tileYield.happiness += r.happiness;
					tileYield.knowledge += r.knowledge;
				}
				const { x, y } = getHexCenter(col, row);
				drawTileYields(yieldGfx, x, y, tileYield);
			}
		}

		// --- Fog of war (above terrain, below entities) ---
		const fogGfx = this.add.graphics();

		// --- Entities (above fog) ---
		const entityGfx = this.add.graphics();
		const selectGfx = this.add.graphics();
		const entities: Entity[] = [];
		const entityAt = new Map<string, Entity>();

		const redrawEntities = () => {
			entityGfx.clear();
			for (const e of entities) {
				if (!visibleTiles.has(`${e.col},${e.row}`)) continue;
				const { x, y } = getHexCenter(e.col, e.row);
				drawEntityIcon(entityGfx, x, y, e.team, e.config.type);
			}
		};

		// Placement
		const placeable: Array<{ col: number; row: number }> = [];
		for (let row = 0; row < ROWS; row++) {
			for (let col = 0; col < COLS; col++) {
				const b = biomeMap[row][col];
				if ((b === "grassland" || b === "desert") && !riverTiles.has(`${col},${row}`)) {
					placeable.push({ col, row });
				}
			}
		}
		for (let i = placeable.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[placeable[i], placeable[j]] = [placeable[j], placeable[i]];
		}
		const bluePool = placeable.filter((t) => t.row < ROWS / 2);
		const redPool = placeable.filter((t) => t.row >= ROWS / 2);
		const spawn = (pool: typeof placeable, idx: number, team: number, type: EntityType) => {
			const tile = pool[idx];
			if (!tile) return;
			const ent = createEntity(tile.col, tile.row, team, type);
			entities.push(ent);
			entityAt.set(`${ent.col},${ent.row}`, ent);
		};
		spawn(bluePool, 0, TEAM_BLUE, "village");
		spawn(bluePool, 1, TEAM_BLUE, "worker");
		spawn(bluePool, 2, TEAM_BLUE, "warrior");
		spawn(redPool, 0, TEAM_RED, "village");
		spawn(redPool, 1, TEAM_RED, "worker");
		spawn(redPool, 2, TEAM_RED, "warrior");

		// --- Turn state ---
		const TEAMS = [TEAM_BLUE, TEAM_RED];
		let activeTeam = TEAM_BLUE;

		// --- Fog of war (per-team explored memory) ---
		const exploredByTeam = new Map<number, Set<string>>();
		for (const t of TEAMS) exploredByTeam.set(t, new Set());
		let visibleTiles = new Set<string>();

		const redrawFog = () => {
			visibleTiles = computeVisibleTiles(
				entities,
				activeTeam,
				levelMap,
				biomeMap,
				forestTiles,
			);
			const explored = exploredByTeam.get(activeTeam)!;
			for (const key of visibleTiles) explored.add(key);
			drawFog(fogGfx, visibleTiles, explored);
		};
		redrawFog();
		redrawEntities();

		// --- Selection ---
		let selected: Entity | null = null;

		// --- UI ---
		const cursor = createCursorManager(this);
		const hud = mountHUD(activeTeam, () => {
			// Switch to next team
			const idx = TEAMS.indexOf(activeTeam);
			activeTeam = TEAMS[(idx + 1) % TEAMS.length];
			for (const e of entities) {
				if (e.team === activeTeam) resetTurn(e);
			}
			selected = null;
			selectGfx.clear();
			moveLineGfx.clear();
			hud.updatePanel(null);
			hud.setActiveTeam(activeTeam);
			redrawFog();
			redrawEntities();
			cursor.set("default");
		});

		this.events.on("shutdown", () => {
			hud.destroy();
		});

		// --- Camera ---
		const gridW = COLS * HEX_WIDTH + HEX_WIDTH / 2;
		const gridH = ROWS * HEX_HEIGHT * 0.75 + HEX_HEIGHT * 0.25;
		this.cameras.main.setBounds(
			-HEX_WIDTH,
			-HEX_HEIGHT,
			gridW + HEX_WIDTH * 2,
			gridH + HEX_HEIGHT * 2,
		);
		this.cameras.main.centerOn(gridW / 2, gridH / 2);

		// --- Input helpers ---
		const hoverGfx = this.add.graphics();
		const moveLineGfx = this.add.graphics();
		let hoveredCol = -1;
		let hoveredRow = -1;

		const screenToHex = (px: number, py: number) => {
			const wp = this.cameras.main.getWorldPoint(px, py);
			const aRow = Math.round(wp.y / (HEX_HEIGHT * 0.75));
			const ro = aRow % 2 === 1 ? HEX_WIDTH / 2 : 0;
			const aCol = Math.round((wp.x - ro) / HEX_WIDTH);
			let bC = -1,
				bR = -1,
				bD = Infinity;
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					const r = aRow + dr,
						c = aCol + dc;
					if (!inBounds(c, r)) continue;
					const { x, y } = getHexCenter(c, r);
					const d = (wp.x - x) ** 2 + (wp.y - y) ** 2;
					if (d < bD) {
						bD = d;
						bC = c;
						bR = r;
					}
				}
			}
			return { col: bC, row: bR };
		};

		const resolveCursor = (): CursorType => {
			if (!selected || selected.stamina <= 0) return "default";
			if (hoveredCol < 0 || (hoveredCol === selected.col && hoveredRow === selected.row))
				return "default";

			const ent = entityAt.get(`${hoveredCol},${hoveredRow}`);
			if (ent && isEnemy(selected, ent) && isUnit(selected)) {
				if (canAttackAdjacent(selected, ent)) return "attack";
				if (
					findMoveAndAttackPath(
						selected,
						ent,
						biomeMap,
						levelMap,
						riverTiles,
						forestTiles,
						entityAt,
					)
				)
					return "attack";
				return "blocked";
			}
			if (ent) return "default";

			const result = findPath(
				selected.col,
				selected.row,
				hoveredCol,
				hoveredRow,
				biomeMap,
				levelMap,
				riverTiles,
				forestTiles,
			);
			const reachable = result && Math.floor(selected.stamina - result.totalCost) >= 0;
			return reachable ? "move" : "blocked";
		};

		// --- Hover ---
		const explored = () => exploredByTeam.get(activeTeam)!;
		const updateHover = (col: number, row: number) => {
			hoverGfx.clear();
			moveLineGfx.clear();
			hud.updateTileInfo(null);
			if (col < 0) return;

			const key = `${col},${row}`;
			const isVisible = visibleTiles.has(key);
			const isExplored = explored().has(key);
			if (!isVisible && !isExplored) return;

			drawHoverHighlight(hoverGfx, col, row);

			if (selected && (col !== selected.col || row !== selected.row)) {
				const hoveredEnt = isVisible ? entityAt.get(key) : undefined;

				if (hoveredEnt && isEnemy(selected, hoveredEnt) && isUnit(selected)) {
					if (canAttackAdjacent(selected, hoveredEnt)) {
						hud.updatePanel(selected, hoveredEnt);
					} else {
						const moveAtk = findMoveAndAttackPath(
							selected,
							hoveredEnt,
							biomeMap,
							levelMap,
							riverTiles,
							forestTiles,
							entityAt,
						);
						hud.updatePanel(selected, hoveredEnt);
						if (moveAtk) {
							drawMovePath(
								moveLineGfx,
								moveAtk.path.tiles,
								moveAtk.path.costs,
								selected.stamina,
								true,
							);
						}
					}
				} else {
					hud.updatePanel(selected);
					if (selected.stamina > 0 && !hoveredEnt) {
						const result = findPath(
							selected.col,
							selected.row,
							col,
							row,
							biomeMap,
							levelMap,
							riverTiles,
							forestTiles,
						);
						if (result && result.tiles.length > 1) {
							const reachable = Math.floor(selected.stamina - result.totalCost) >= 0;
							drawMovePath(
								moveLineGfx,
								result.tiles,
								result.costs,
								selected.stamina,
								reachable,
							);
						}
					}
				}
			} else if (selected) {
				hud.updatePanel(selected);
			} else {
				// No selection — show hovered entity or tile info
				const hoveredEnt = isVisible ? entityAt.get(key) : undefined;
				if (hoveredEnt) {
					hud.updatePanel(hoveredEnt);
					hud.updateTileInfo(null);
				} else {
					hud.updatePanel(null);
					// Build tile info for the hovered tile
					const biome = biomeMap[row]?.[col];
					if (biome) {
						const hasRiver = riverTiles.has(key);
						const hasForest = forestTiles.has(key);
						const resId = resourceMap.get(key);
						hud.updateTileInfo({
							biome,
							baseYield: { ...BIOME_YIELDS[biome] },
							featureYield: hasRiver
								? { ...RIVER_BONUS }
								: hasForest
									? { ...FOREST_BONUS }
									: null,
							featureLabel: hasRiver ? "River" : hasForest ? "Forest" : null,
							resource: resId ? SPECIAL_RESOURCES[resId] : null,
						});
					} else {
						hud.updateTileInfo(null);
					}
				}
			}

			cursor.set(resolveCursor());
		};

		// --- Pointer events ---
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (this.isDragging) {
				this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX);
				this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY);
				hoverGfx.clear();
				moveLineGfx.clear();
				hoveredCol = -1;
				return;
			}
			const { col, row } = screenToHex(pointer.x, pointer.y);
			if (col !== hoveredCol || row !== hoveredRow) {
				hoveredCol = col;
				hoveredRow = row;
				updateHover(col, row);
			}
		});

		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			this.isDragging = true;
			this.dragStartX = pointer.x;
			this.dragStartY = pointer.y;
			this.camStartX = this.cameras.main.scrollX;
			this.camStartY = this.cameras.main.scrollY;
		});

		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
			const wasDrag =
				Math.abs(pointer.x - this.dragStartX) > 4 ||
				Math.abs(pointer.y - this.dragStartY) > 4;
			this.isDragging = false;
			if (wasDrag) return;
			if (!pointer.leftButtonReleased()) return;
			if (hoveredCol < 0) return;

			const ent = entityAt.get(`${hoveredCol},${hoveredRow}`);
			const afterAttack = (attacker: Entity, target: Entity) => {
				if (target.health <= 0) {
					entityAt.delete(`${target.col},${target.row}`);
					entities.splice(entities.indexOf(target), 1);
				}
				redrawFog();
				redrawEntities();
				selectGfx.clear();
				drawSelection(selectGfx, attacker.col, attacker.row);
				hud.updatePanel(attacker);
				cursor.set(resolveCursor());
			};

			// Move
			if (
				selected &&
				selected.stamina > 0 &&
				!ent &&
				(hoveredCol !== selected.col || hoveredRow !== selected.row)
			) {
				const result = findPath(
					selected.col,
					selected.row,
					hoveredCol,
					hoveredRow,
					biomeMap,
					levelMap,
					riverTiles,
					forestTiles,
				);
				if (result && Math.floor(selected.stamina - result.totalCost) >= 0) {
					executeMove(selected, hoveredCol, hoveredRow, result.totalCost, entityAt);
					redrawFog();
					redrawEntities();
					moveLineGfx.clear();
					selectGfx.clear();
					drawSelection(selectGfx, selected.col, selected.row);
					hud.updatePanel(selected);
					cursor.set(resolveCursor());
					return;
				}
			}

			// Adjacent attack
			if (selected && ent && canAttackAdjacent(selected, ent)) {
				const attacker = selected,
					target = ent;
				executeAttack(attacker, target);
				playAttackAnimation(this, attacker.col, attacker.row, target.col, target.row, () =>
					afterAttack(attacker, target),
				);
				return;
			}

			// Move-and-attack
			if (selected && ent && isEnemy(selected, ent) && isUnit(selected)) {
				const moveAtk = findMoveAndAttackPath(
					selected,
					ent,
					biomeMap,
					levelMap,
					riverTiles,
					forestTiles,
					entityAt,
				);
				if (moveAtk) {
					const attacker = selected,
						target = ent;
					executeMove(
						attacker,
						moveAtk.neighbor.col,
						moveAtk.neighbor.row,
						moveAtk.path.totalCost,
						entityAt,
					);
					executeAttack(attacker, target);
					redrawFog();
					redrawEntities();
					moveLineGfx.clear();
					playAttackAnimation(
						this,
						attacker.col,
						attacker.row,
						target.col,
						target.row,
						() => afterAttack(attacker, target),
					);
					return;
				}
				return; // unreachable enemy — ignore click
			}

			// Toggle selection (only own team)
			if (ent) {
				if (ent.team !== activeTeam) return;
				selected = selected === ent ? null : ent;
			} else {
				selected = null;
			}

			selectGfx.clear();
			if (selected) drawSelection(selectGfx, selected.col, selected.row);
			hud.updatePanel(selected);
			cursor.set(resolveCursor());
		});

		// --- Right-click deselect ---
		this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
			if (pointer.rightButtonReleased()) {
				selected = null;
				selectGfx.clear();
				moveLineGfx.clear();
				hoverGfx.clear();
				hud.updatePanel(null);
				cursor.set("default");
			}
		});

		this.input.on(
			"wheel",
			(
				pointer: Phaser.Input.Pointer,
				_g: Phaser.GameObjects.GameObject[],
				_dx: number,
				deltaY: number,
			) => {
				this.cameras.main.setZoom(
					Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.5, 3),
				);
				const { col, row } = screenToHex(pointer.x, pointer.y);
				hoveredCol = col;
				hoveredRow = row;
				updateHover(col, row);
			},
		);
	}
}
