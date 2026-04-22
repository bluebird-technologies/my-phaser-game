import Phaser from "phaser";
import {
	COLS,
	ROWS,
	HEX_WIDTH,
	HEX_HEIGHT,
	getHexCenter,
	getNeighbors,
	hexDistance,
	inBounds,
} from "../hex";
import { generateWorld, drawRivers } from "../mapgen";
import { findPath } from "../pathfinding";
import {
	Entity,
	createEntity,
	isUnit,
	isBuilding,
	isEnemy,
	resetTurn,
	EntityType,
	TEAM_BLUE,
	TEAM_RED,
} from "../entities";
import {
	BIOME_YIELDS,
	RIVER_BONUS,
	FOREST_BONUS,
	VILLAGE_BONUS,
	SPECIAL_RESOURCES,
	SpecialResourceId,
	SettlementState,
	RealmState,
	TileYield,
	VILLAGE_TILE_CAPACITY,
	createSettlementState,
	createRealmState,
	buildSettlementStats,
	getBorderTiles,
	getSlotCapacity,
	moveCitizen,
	seedSettlementCitizens,
	tickSettlementGrowth,
	tickSettlementProduction,
	predictProductionGain,
	cancelProduction,
	tileBounty,
} from "../economy";
import { ACTIONS, ActionContext, ActionId } from "../actions";
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
	drawPlannedPath,
	clearMovePathTexts,
	drawCitizen,
	drawFog,
	playAttackAnimation,
	playMoveAnimation,
	isPointInCitizenSlot,
} from "../sprites";
import { mountHUD, HUDControls } from "../ui/GameHUD";
import type { TileInfo } from "../ui/ResourceCard";
import { createCursorManager, CursorType } from "../ui/cursors";
import { EventLog } from "../eventLog";

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
		const { biomeMap, levelMap, rivers, riverTiles, riverFlow, forestTiles, resourceMap } =
			world;

		// --- Static terrain layers ---
		drawTerrain(this.add.graphics(), biomeMap, levelMap, ROWS, COLS);
		drawHillshade(this.add.graphics(), levelMap, ROWS, COLS);
		drawRivers(this.add.graphics(), rivers, biomeMap);
		drawForest(this.add.graphics(), forestTiles, ROWS, COLS);

		// ─── Layer stack (bottom → top) ───
		// Fog hides unseen tiles
		const fogGfx = this.add.graphics();
		// Selection halo — sits BELOW the entity so the pin/building silhouette
		// draws on top, clipping the halo to just the outer edge
		const selectGfx = this.add.graphics();
		// Buildings (village hex badges) — below yield dots and resources
		const buildingGfx = this.add.graphics();
		// Yield dots — above buildings, below units
		const yieldGfx = this.add.graphics();
		// Special resources — above buildings, below units so unit pins can
		// cover the resource icon (revealed again on hover via the overlay)
		const resourcesGfx = this.add.graphics();
		// Unit pins — above yields and resources
		const unitGfx = this.add.graphics();
		// Hover overlay — re-draws the hovered tile's yield dots AND special
		// resource on top of units, so hovering reveals everything beneath
		const hoverOverlayGfx = this.add.graphics();
		// Hover highlight ring
		const hoverGfx = this.add.graphics();
		// Planned (multi-turn) path overlay — drawn below the movement preview
		const plannedPathGfx = this.add.graphics();
		// Movement path preview
		const moveLineGfx = this.add.graphics();
		const moveTexts: Phaser.GameObjects.Text[] = [];
		// Citizen placement UI — always on top of map art so the clickable slots are
		// accessible. `placementTexts` holds the N/M label text objects so they can
		// be destroyed on each redraw (Graphics.clear() doesn't touch text objects).
		const placementGfx = this.add.graphics();
		const placementTexts: Phaser.GameObjects.Text[] = [];
		// Selected-unit overlay — re-draws the currently-selected unit pin ABOVE
		// placement badges so the pin is always fully visible when selected.
		const selectedUnitGfx = this.add.graphics();

		const entities: Entity[] = [];
		// Units block pathfinding and take click priority.
		const entityAt = new Map<string, Entity>();
		// Buildings live in their own map so units can stack on top of friendly buildings.
		const buildingAt = new Map<string, Entity>();
		// Entities currently being tween-animated between tiles. The scene
		// skips drawing these in unitGfx + selectedUnitGfx so the tweening
		// sprite (drawn on its own graphic) is the only copy visible.
		const animatingEntities = new Set<Entity>();
		// Multi-turn planned routes (Civ-style). Key = entity, value = remaining
		// tiles to walk (starting from the entity's current position).
		const plannedPaths = new Map<Entity, Array<{ col: number; row: number }>>();

		const eventLog = new EventLog();
		(window as unknown as Record<string, unknown>).eventLog = eventLog;

		/** Unit first, then building — for click hit-testing & hover. */
		const getEntityAt = (col: number, row: number): Entity | undefined => {
			const key = `${col},${row}`;
			return entityAt.get(key) ?? buildingAt.get(key);
		};

		/** Put an entity on the map in the correct slot based on its category. */
		const placeEntity = (ent: Entity) => {
			const key = `${ent.col},${ent.row}`;
			if (isBuilding(ent)) buildingAt.set(key, ent);
			else entityAt.set(key, ent);
		};

		/** Remove an entity from its map slot (precise — does not affect the other slot). */
		const unplaceEntity = (ent: Entity) => {
			const key = `${ent.col},${ent.row}`;
			if (isBuilding(ent)) buildingAt.delete(key);
			else entityAt.delete(key);
		};

		/** Compute the total per-turn yield for a single tile (biome + features + special resource). */
		const computeTileYield = (col: number, row: number): TileYield => {
			const biome = biomeMap[row][col];
			const key = `${col},${row}`;
			const t: TileYield = { ...BIOME_YIELDS[biome] };
			if (forestTiles.has(key)) {
				t.resources += FOREST_BONUS.resources;
				t.growth += FOREST_BONUS.growth;
				t.happiness += FOREST_BONUS.happiness;
				t.knowledge += FOREST_BONUS.knowledge;
			}
			if (riverTiles.has(key)) {
				t.resources += RIVER_BONUS.resources;
				t.growth += RIVER_BONUS.growth;
				t.happiness += RIVER_BONUS.happiness;
				t.knowledge += RIVER_BONUS.knowledge;
			}
			const resId = resourceMap.get(key);
			if (resId) {
				const r = SPECIAL_RESOURCES[resId].yield;
				t.resources += r.resources;
				t.growth += r.growth;
				t.happiness += r.happiness;
				t.knowledge += r.knowledge;
			}
			// Village tile carries a passive yield bonus like a built-in special resource
			if (buildingAt.has(key)) {
				t.resources += VILLAGE_BONUS.resources;
				t.growth += VILLAGE_BONUS.growth;
				t.happiness += VILLAGE_BONUS.happiness;
				t.knowledge += VILLAGE_BONUS.knowledge;
			}
			return t;
		};

		/**
		 * Find a destination tile for a citizen being displaced from `sourceKey`.
		 * Priority:
		 *   1. The village tile (if it's not the source AND has free capacity)
		 *   2. The highest-bounty border tile with free capacity (excluding source)
		 * Returns null if there's nowhere with space.
		 */
		const findDisplacementDestination = (
			state: SettlementState,
			village: Entity,
			sourceKey: string,
		): string | null => {
			const villageKey = `${village.col},${village.row}`;

			// 1. Village tile takes priority
			if (sourceKey !== villageKey) {
				const villageCount = state.citizenTiles.get(villageKey) ?? 0;
				if (villageCount < VILLAGE_TILE_CAPACITY) return villageKey;
			}

			// 2. Highest-bounty border tile with space
			const border = getBorderTiles(village.col, village.row, state.population, biomeMap);
			const candidates = Array.from(border).filter((k) => k !== sourceKey);
			candidates.sort((a, b) => {
				const [ac, ar] = a.split(",").map(Number);
				const [bc, br] = b.split(",").map(Number);
				return tileBounty(computeTileYield(bc, br)) - tileBounty(computeTileYield(ac, ar));
			});
			for (const key of candidates) {
				const cap = getSlotCapacity(key, villageKey);
				const current = state.citizenTiles.get(key) ?? 0;
				if (current < cap) return key;
			}
			return null;
		};

		/** Redraws tile overlays (resources + yield dots), filtered to visible tiles. */
		const redrawOverlays = () => {
			// Special resources — only on visible tiles
			resourcesGfx.clear();
			const visibleResources = new Map<string, SpecialResourceId>();
			for (const [key, resId] of resourceMap) {
				if (visibleTiles.has(key)) visibleResources.set(key, resId);
			}
			drawResources(resourcesGfx, visibleResources);

			// Yield dots — only on visible tiles
			yieldGfx.clear();
			for (const key of visibleTiles) {
				const [col, row] = key.split(",").map(Number);
				const { x, y } = getHexCenter(col, row);
				drawTileYields(yieldGfx, x, y, computeTileYield(col, row));
			}
		};

		const redrawEntities = () => {
			buildingGfx.clear();
			unitGfx.clear();
			for (const e of entities) {
				if (animatingEntities.has(e)) continue;
				if (!visibleTiles.has(`${e.col},${e.row}`)) continue;
				const { x, y } = getHexCenter(e.col, e.row);
				const gfx = isBuilding(e) ? buildingGfx : unitGfx;
				drawEntityIcon(gfx, x, y, e.team, e.config.type);
			}
			// Keep the selected-unit overlay in sync with the unit layer
			redrawSelectedUnitOverlay();
		};

		const redrawPlannedPaths = () => {
			plannedPathGfx.clear();
			for (const [ent, path] of plannedPaths) {
				if (ent.team !== activeTeam) continue;
				const fullPath = [{ col: ent.col, row: ent.row }, ...path];
				drawPlannedPath(plannedPathGfx, fullPath);
			}
		};

		// Placement — build the pool of spawnable tiles (grassland/desert, no
		// rivers, not already occupied), shuffle, and split into per-team halves.
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

		const placeAt = (col: number, row: number, team: number, type: EntityType): Entity => {
			const ent = createEntity(col, row, team, type);
			entities.push(ent);
			placeEntity(ent);
			eventLog.record({
				type: "entity_spawned",
				entityId: ent.id,
				entityType: type,
				col,
				row,
			});
			return ent;
		};

		// Spawn each team's starting villager on the first free tile in its pool,
		// then drop the warrior on the nearest free pool tile within 3 hexes of
		// the villager so the two units always start as a pair.
		const WARRIOR_MAX_DIST = 3;
		const spawnTeam = (pool: typeof placeable, team: number) => {
			const villagerTile = pool.find((t) => !entityAt.has(`${t.col},${t.row}`));
			if (!villagerTile) return;
			const villager = placeAt(villagerTile.col, villagerTile.row, team, "villager");

			const warriorCandidates = pool
				.filter((t) => {
					if (t.col === villager.col && t.row === villager.row) return false;
					if (entityAt.has(`${t.col},${t.row}`)) return false;
					return (
						hexDistance(villager.col, villager.row, t.col, t.row) <= WARRIOR_MAX_DIST
					);
				})
				// Prefer the closest tile so the pair starts clustered. Ties broken
				// by pool order, which is already shuffled.
				.sort(
					(a, b) =>
						hexDistance(villager.col, villager.row, a.col, a.row) -
						hexDistance(villager.col, villager.row, b.col, b.row),
				);

			const warriorTile = warriorCandidates[0];
			if (warriorTile) placeAt(warriorTile.col, warriorTile.row, team, "warrior");

			// Second warrior — pick the next closest free tile
			const warrior2Candidates = pool
				.filter((t) => {
					if (entityAt.has(`${t.col},${t.row}`)) return false;
					return (
						hexDistance(villager.col, villager.row, t.col, t.row) <= WARRIOR_MAX_DIST
					);
				})
				.sort(
					(a, b) =>
						hexDistance(villager.col, villager.row, a.col, a.row) -
						hexDistance(villager.col, villager.row, b.col, b.row),
				);
			const warrior2Tile = warrior2Candidates[0];
			if (warrior2Tile) placeAt(warrior2Tile.col, warrior2Tile.row, team, "warrior");
		};
		spawnTeam(bluePool, TEAM_BLUE);
		spawnTeam(redPool, TEAM_RED);

		// --- Settlement + realm state ---
		// Settlements are keyed by the village entity so state follows the building,
		// even if the village's tile position changes in the future.
		const settlements = new Map<Entity, SettlementState>();
		const realmsByTeam = new Map<number, RealmState>();
		realmsByTeam.set(TEAM_BLUE, createRealmState());
		realmsByTeam.set(TEAM_RED, createRealmState());

		const ensureSettlement = (village: Entity): SettlementState => {
			let s = settlements.get(village);
			if (!s) {
				s = createSettlementState(village.col, village.row);
				// Smart-place starting citizens: max in town center, rest on best border tile.
				seedSettlementCitizens(village, s, biomeMap, forestTiles, riverTiles, resourceMap);
				settlements.set(village, s);
			}
			return s;
		};

		const countWarriorsForTeam = (team: number): number =>
			entities.filter((e) => e.team === team && e.config.type === "warrior").length;

		const countSettlementsForTeam = (team: number): number =>
			entities.filter((e) => e.team === team && isBuilding(e)).length;

		const computeStatsFor = (village: Entity) => {
			const state = ensureSettlement(village);
			const realm = realmsByTeam.get(village.team)!;
			return buildSettlementStats(
				village,
				state,
				realm,
				biomeMap,
				forestTiles,
				riverTiles,
				resourceMap,
				countWarriorsForTeam(village.team),
				countSettlementsForTeam(village.team),
			);
		};

		/**
		 * Draws citizen slot badges:
		 * - For every visible village owned by either team, draws filled slots
		 *   for tiles that have citizens placed (always visible).
		 * - For the currently-selected village, additionally draws empty slots
		 *   for ALL its border tiles (so the player can see where citizens can
		 *   still be placed).
		 * - Each badge shows "N/M" text. The N portion is red if N > M.
		 * - Text objects are tracked in `placementTexts` and destroyed on each
		 *   redraw (Phaser Graphics.clear() doesn't touch text objects).
		 */
		const redrawPlacement = (selectedVillage: Entity | null) => {
			placementGfx.clear();
			for (const t of placementTexts) t.destroy();
			placementTexts.length = 0;

			// Track which tiles already had a badge drawn (so we don't render
			// the same slot twice — once for filled, once for selected-empty).
			const drawn = new Set<string>();

			// Filled slots — every visible village's placed citizens
			for (const e of entities) {
				if (!isBuilding(e)) continue;
				if (!visibleTiles.has(`${e.col},${e.row}`)) continue;
				const state = settlements.get(e);
				if (!state) continue;
				const villageKey = `${e.col},${e.row}`;
				for (const [key, count] of state.citizenTiles) {
					if (count <= 0) continue;
					if (!visibleTiles.has(key)) continue;
					if (drawn.has(key)) continue;
					const [col, row] = key.split(",").map(Number);
					const { x, y } = getHexCenter(col, row);
					const cap = getSlotCapacity(key, villageKey);
					drawCitizen(placementGfx, this, placementTexts, x, y, e.team, count, cap);
					drawn.add(key);
				}
			}

			// All border slots for the selected village (including 0/M empties)
			if (selectedVillage && isBuilding(selectedVillage)) {
				const state = ensureSettlement(selectedVillage);
				const villageKey = `${selectedVillage.col},${selectedVillage.row}`;
				const border = getBorderTiles(
					selectedVillage.col,
					selectedVillage.row,
					state.population,
					biomeMap,
				);
				for (const key of border) {
					if (!visibleTiles.has(key)) continue;
					if (drawn.has(key)) continue;
					const [col, row] = key.split(",").map(Number);
					const { x, y } = getHexCenter(col, row);
					const count = state.citizenTiles.get(key) ?? 0;
					const cap = getSlotCapacity(key, villageKey);
					drawCitizen(
						placementGfx,
						this,
						placementTexts,
						x,
						y,
						selectedVillage.team,
						count,
						cap,
					);
					drawn.add(key);
				}
			}
		};

		// --- Turn state ---
		const TEAMS = [TEAM_BLUE, TEAM_RED];
		let activeTeam = TEAM_BLUE;
		let turnNumber = 1;

		eventLog.setTurnState(turnNumber, activeTeam);
		eventLog.record({ type: "game_started", seed: 0 });

		// --- Fog of war (per-team explored memory) ---
		const exploredByTeam = new Map<number, Set<string>>();
		for (const t of TEAMS) exploredByTeam.set(t, new Set());
		let visibleTiles = new Set<string>();

		// --- Selection ---
		let selected: Entity | null = null;
		const selectedVillage = (): Entity | null =>
			selected && isBuilding(selected) ? selected : null;

		/**
		 * Redraw the selected-unit overlay. Units are normally drawn in `unitGfx`
		 * (below placement badges), but the currently-selected unit pin needs to
		 * appear ABOVE placement so it's never hidden by citizen slot badges.
		 */
		const redrawSelectedUnitOverlay = () => {
			selectedUnitGfx.clear();
			if (!selected) return;
			if (isBuilding(selected)) return;
			if (animatingEntities.has(selected)) return;
			if (!visibleTiles.has(`${selected.col},${selected.row}`)) return;
			const { x, y } = getHexCenter(selected.col, selected.row);
			drawEntityIcon(selectedUnitGfx, x, y, selected.team, selected.config.type);
		};

		const redrawFog = () => {
			visibleTiles = computeVisibleTiles(
				entities,
				activeTeam,
				levelMap,
				biomeMap,
				forestTiles,
			);
			const explored = exploredByTeam.get(activeTeam)!;
			const newTiles: string[] = [];
			for (const key of visibleTiles) {
				if (!explored.has(key)) newTiles.push(key);
				explored.add(key);
			}
			if (newTiles.length > 0) {
				eventLog.record({
					type: "tile_explored",
					tiles: newTiles,
				});
			}
			drawFog(fogGfx, visibleTiles, explored);
			redrawOverlays();
			redrawPlacement(selectedVillage());
			redrawPlannedPaths();
		};
		redrawFog();
		redrawEntities();

		// --- Action context (shared by ActionBar predicates) ---
		const actionContext: ActionContext = {
			entityAt,
			biomeMap,
			getSettlement: (village) => {
				const direct = settlements.get(village);
				if (direct) return direct;
				for (const [v, state] of settlements) {
					if (v.col === village.col && v.row === village.row) return state;
				}
				return null;
			},
			getResourcesPerTurn: (village) => {
				const state = actionContext.getSettlement?.(village);
				if (!state) return 0;
				return predictProductionGain(
					village,
					state,
					biomeMap,
					forestTiles,
					riverTiles,
					resourceMap,
				);
			},
		};

		// --- UI ---
		const cursor = createCursorManager(this);
		// Forward-declared so handleAction can close over it before mountHUD is called.
		// eslint-disable-next-line prefer-const
		let hud: HUDControls;

		/** Push the selected entity into the HUD, with settlement stats if it's a building. */
		const refreshHudPanel = (ent: Entity | null, target: Entity | null = null) => {
			hud.updatePanel(ent, target);
			if (ent && isBuilding(ent)) {
				hud.updateSettlement(computeStatsFor(ent));
			} else {
				hud.updateSettlement(null);
			}
			// Citizen placement overlay follows the current selection (village only).
			// Only show placement UI when the selection is truly a building (not a hover preview).
			const village = ent && isBuilding(ent) && ent === selected ? ent : null;
			redrawPlacement(village);
			redrawSelectedUnitOverlay();
		};

		const handleAction = (actionId: ActionId) => {
			if (!selected) return;
			// Ignore ActionBar clicks while any unit is tweening — the selected
			// unit may be the one moving, and consuming it mid-animation would
			// leave a sprite stranded.
			if (animatingEntities.size > 0) return;

			// Cancel in-progress production
			if (actionId === "trainWarrior") {
				const state = actionContext.getSettlement?.(selected);
				if (state?.currentProduction) {
					cancelProduction(state);
					selected.charges.trainWarrior = (selected.charges.trainWarrior ?? 0) + 1;
					seedSettlementCitizens(
						selected,
						state,
						biomeMap,
						forestTiles,
						riverTiles,
						resourceMap,
					);
					eventLog.record({
						type: "action_executed",
						entityId: selected.id,
						actionId: "cancelProduction",
						consumed: false,
						newEntityIds: [],
					});
					redrawFog();
					redrawEntities();
					refreshHudPanel(selected);
					syncEndTurnLabel();
					cursor.set("default");
					return;
				}
			}

			const def = ACTIONS[actionId];
			if (!def || !def.canExecute(selected, actionContext)) return;

			const actor = selected;
			const result = def.execute(actor, actionContext);
			const newIds: string[] = [];
			if (result.consumed) {
				unplaceEntity(actor);
				const idx = entities.indexOf(actor);
				if (idx >= 0) entities.splice(idx, 1);
				plannedPaths.delete(actor);
				selected = null;
				selectGfx.clear();
			}
			if (result.newEntities) {
				for (const ne of result.newEntities) {
					entities.push(ne);
					placeEntity(ne);
					newIds.push(ne.id);
				}
			}
			eventLog.record({
				type: "action_executed",
				entityId: actor.id,
				actionId,
				consumed: result.consumed,
				newEntityIds: newIds,
			});
			if (actionId === "trainWarrior") {
				const s = settlements.get(actor);
				if (s?.currentProduction) {
					eventLog.record({
						type: "production_started",
						villageId: actor.id,
						unitType: s.currentProduction.unitType,
						resourceCost: s.currentProduction.resourceCost,
						popCost: s.currentProduction.popCost,
					});
				}
			}
			if (result.removedEntities) {
				for (const re of result.removedEntities) {
					unplaceEntity(re);
					const i = entities.indexOf(re);
					if (i >= 0) entities.splice(i, 1);
					settlements.delete(re);
				}
			}

			// If a building action changed population (e.g. trainWarrior),
			// re-seed citizens to redistribute across tiles.
			if (isBuilding(actor) && settlements.has(actor)) {
				const state = settlements.get(actor)!;
				seedSettlementCitizens(
					actor,
					state,
					biomeMap,
					forestTiles,
					riverTiles,
					resourceMap,
				);
			}

			redrawFog();
			redrawEntities();
			refreshHudPanel(selected);
			syncEndTurnLabel();
			cursor.set("default");
		};

		/** Does this entity still have actions it can take this turn? */
		const hasActionsRemaining = (e: Entity): boolean => {
			if (isUnit(e) && e.stamina > 0) return true;
			const actions = e.config.actions;
			if (actions) {
				for (const [id, cfg] of Object.entries(actions)) {
					if (cfg && (e.charges[id as ActionId] ?? 0) > 0 && id !== "skipTurn") {
						const def = ACTIONS[id as ActionId];
						if (def && def.canExecute(e, actionContext)) return true;
					}
				}
			}
			return false;
		};

		/** Find the next entity on the active team that still has actions. */
		const nextUnitWithStamina = (): Entity | null => {
			const teamEnts = entities.filter(
				(e) => e.team === activeTeam && hasActionsRemaining(e),
			);
			if (teamEnts.length === 0) return null;
			if (!selected) return teamEnts[0];
			const curIdx = teamEnts.indexOf(selected);
			if (curIdx < 0) return teamEnts[0];
			return teamEnts[(curIdx + 1) % teamEnts.length];
		};

		/**
		 * Update the top-right button label based on state:
		 * - "Skip" if the currently selected entity has actions remaining
		 * - "Next" if the selected is done but other entities have actions
		 * - "End Turn" if all entities are done
		 */
		const syncEndTurnLabel = () => {
			if (selected && hasActionsRemaining(selected)) {
				const hasPlan = plannedPaths.has(selected) && selected.stamina > 0;
				hud.setEndTurnLabel(hasPlan ? "Continue" : "Skip");
				return;
			}
			const hasOthers = entities.some((e) => e.team === activeTeam && hasActionsRemaining(e));
			hud.setEndTurnLabel(hasOthers ? "Next" : "End Turn");
		};

		hud = mountHUD(
			activeTeam,
			() => {
				// "Continue" — walk planned path
				if (selected && hasActionsRemaining(selected)) {
					const plan = plannedPaths.get(selected);
					if (plan && plan.length > 0 && isUnit(selected)) {
						const mover = selected;
						if (mover.stamina > 0) {
							const dest = plan[plan.length - 1];
							const repath = findPath(
								mover.col,
								mover.row,
								dest.col,
								dest.row,
								biomeMap,
								levelMap,
								riverTiles,
								forestTiles,
								riverFlow,
							);
							if (repath && repath.tiles.length > 1) {
								let moveIdx = 0;
								for (let i = repath.tiles.length - 1; i >= 1; i--) {
									if (
										Math.floor(mover.stamina - repath.costs[i]) >= 0 &&
										!entityAt.has(
											`${repath.tiles[i].col},${repath.tiles[i].row}`,
										)
									) {
										moveIdx = i;
										break;
									}
								}
								if (moveIdx > 0) {
									const tile = repath.tiles[moveIdx];
									const pathTiles = repath.tiles.slice(0, moveIdx + 1);
									const cFromCol = mover.col,
										cFromRow = mover.row;
									executeMove(
										mover,
										tile.col,
										tile.row,
										repath.costs[moveIdx],
										entityAt,
									);
									eventLog.record({
										type: "entity_moved",
										entityId: mover.id,
										fromCol: cFromCol,
										fromRow: cFromRow,
										toCol: tile.col,
										toRow: tile.row,
										staminaCost: repath.costs[moveIdx],
									});
									const remaining = repath.tiles.slice(moveIdx);
									if (remaining.length > 1) {
										plannedPaths.set(mover, remaining.slice(1));
										eventLog.record({
											type: "path_planned",
											entityId: mover.id,
											tiles: remaining.slice(1),
										});
									} else {
										plannedPaths.delete(mover);
										eventLog.record({
											type: "path_cancelled",
											entityId: mover.id,
										});
									}
									animatingEntities.add(mover);
									redrawFog();
									redrawEntities();
									moveLineGfx.clear();
									clearMovePathTexts(moveTexts);
									selectGfx.clear();
									playMoveAnimation(
										this,
										mover.team,
										mover.config.type,
										pathTiles,
										() => {
											animatingEntities.delete(mover);
											redrawFog();
											redrawEntities();
											if (selected === mover) {
												drawSelection(
													selectGfx,
													mover.col,
													mover.row,
													mover.config.category,
												);
											}
											refreshHudPanel(selected);
											syncEndTurnLabel();
											cursor.set("default");
										},
									);
									return;
								}
							}
						}
						// Can't move along plan — exhaust stamina, keep the plan for next turn
						mover.stamina = 0;
						refreshHudPanel(selected);
					} else {
						// "Skip" — exhaust the selected entity's turn
						if (isUnit(selected)) selected.stamina = 0;
						const actions = selected.config.actions;
						if (actions) {
							for (const id of Object.keys(actions)) {
								selected.charges[id as ActionId] = 0;
							}
						}
						refreshHudPanel(selected);
					}
				}

				// "Next" — cycle to the next entity with actions remaining
				const movable = nextUnitWithStamina();
				if (movable) {
					selected = movable;
					selectGfx.clear();
					drawSelection(selectGfx, selected.col, selected.row, selected.config.category);
					const pos = getHexCenter(selected.col, selected.row);
					this.cameras.main.centerOn(pos.x, pos.y);
					refreshHudPanel(selected);
					syncEndTurnLabel();
					cursor.set("default");
					return;
				}

				// "End Turn" — all entities done, actually end the turn.
				// Tick settlements for the team that just finished: accumulate
				// growth and advance production queues.
				for (const [village, state] of settlements) {
					if (village.team !== activeTeam) continue;
					const oldPop = state.population;
					tickSettlementGrowth(
						village,
						state,
						biomeMap,
						forestTiles,
						riverTiles,
						resourceMap,
					);
					if (state.population !== oldPop) {
						eventLog.record({
							type: "settlement_growth",
							villageId: village.id,
							oldPop,
							newPop: state.population,
							growthBucket: state.growthBucket,
						});
					}
					const progBefore = state.currentProduction?.resourceProgress ?? 0;
					const produced = tickSettlementProduction(
						village,
						state,
						biomeMap,
						forestTiles,
						riverTiles,
						resourceMap,
					);
					if (!produced && state.currentProduction) {
						eventLog.record({
							type: "production_progressed",
							villageId: village.id,
							resourceAdded: state.currentProduction.resourceProgress - progBefore,
							progressAfter: state.currentProduction.resourceProgress,
							resourceCost: state.currentProduction.resourceCost,
						});
					}
					if (produced) {
						const neighbors = getNeighbors(village.col, village.row);
						const tile =
							neighbors.find((n) => {
								if (!inBounds(n.col, n.row)) return false;
								const biome = biomeMap[n.row]?.[n.col];
								if (!biome || biome === "mountain" || biome === "lake")
									return false;
								return !entityAt.has(`${n.col},${n.row}`);
							}) ??
							(entityAt.has(`${village.col},${village.row}`)
								? null
								: { col: village.col, row: village.row });
						if (tile) {
							const unit = createEntity(tile.col, tile.row, village.team, produced);
							unit.stamina = 0;
							entities.push(unit);
							placeEntity(unit);
							eventLog.record({
								type: "unit_produced",
								villageId: village.id,
								entityId: unit.id,
								entityType: produced,
								col: tile.col,
								row: tile.row,
							});
						}
					}
				}

				const idx = TEAMS.indexOf(activeTeam);
				const nextTeamIdx = (idx + 1) % TEAMS.length;
				activeTeam = TEAMS[nextTeamIdx];
				if (nextTeamIdx === 0) turnNumber++;
				eventLog.record({
					type: "turn_ended",
					nextTeam: activeTeam,
					nextTurn: turnNumber,
				});
				eventLog.setTurnState(turnNumber, activeTeam);
				for (const e of entities) {
					if (e.team === activeTeam) resetTurn(e);
				}

				selected = null;
				selectGfx.clear();
				moveLineGfx.clear();
				clearMovePathTexts(moveTexts);
				refreshHudPanel(null);
				hud.setActiveTeam(activeTeam);
				redrawFog();
				redrawEntities();
				const nextEnt =
					entities.find((e) => e.team === activeTeam && e.config.type === "village") ??
					entities.find((e) => e.team === activeTeam && e.config.type === "villager") ??
					entities.find((e) => e.team === activeTeam);
				if (nextEnt) {
					const pos = getHexCenter(nextEnt.col, nextEnt.row);
					this.cameras.main.centerOn(pos.x, pos.y);
				}
				hud.showTurnBanner(activeTeam, turnNumber);
				syncEndTurnLabel();
				cursor.set("default");
			},
			handleAction,
		);
		hud.setActionContext(actionContext);
		syncEndTurnLabel();

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
		this.cameras.main.setZoom(2.8);
		const startEnt =
			entities.find((e) => e.team === activeTeam && e.config.type === "village") ??
			entities.find((e) => e.team === activeTeam && e.config.type === "villager") ??
			entities.find((e) => e.team === activeTeam);
		if (startEnt) {
			const pos = getHexCenter(startEnt.col, startEnt.row);
			this.cameras.main.centerOn(pos.x, pos.y);
		} else {
			this.cameras.main.centerOn(gridW / 2, gridH / 2);
		}

		// --- Input helpers ---
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

			const ent = getEntityAt(hoveredCol, hoveredRow);
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
			// Block movement if the tile has a unit (friendly or enemy) or an enemy building.
			// Friendly buildings are passable — the unit can walk onto them.
			if (ent && (isUnit(ent) || ent.team !== selected.team)) return "default";

			const result = findPath(
				selected.col,
				selected.row,
				hoveredCol,
				hoveredRow,
				biomeMap,
				levelMap,
				riverTiles,
				forestTiles,
				riverFlow,
			);
			const reachable = result && Math.floor(selected.stamina - result.totalCost) >= 0;
			return reachable ? "move" : "blocked";
		};

		// --- Hover ---
		const explored = () => exploredByTeam.get(activeTeam)!;
		const buildTileInfo = (col: number, row: number): TileInfo | null => {
			const biome = biomeMap[row]?.[col];
			if (!biome) return null;
			const key = `${col},${row}`;
			const hasRiver = riverTiles.has(key);
			const hasForest = forestTiles.has(key);
			const resId = resourceMap.get(key);
			// Any building on the tile contributes the village bonus to the
			// total yield — mirrors computeTileYield so the hover card stays
			// consistent with the in-world yield dots.
			const building = buildingAt.get(key);
			return {
				biome,
				baseYield: { ...BIOME_YIELDS[biome] },
				featureYield: hasRiver
					? { ...RIVER_BONUS }
					: hasForest
						? { ...FOREST_BONUS }
						: null,
				featureLabel: hasRiver ? "River" : hasForest ? "Forest" : null,
				resource: resId ? SPECIAL_RESOURCES[resId] : null,
				improvementYield: building ? { ...VILLAGE_BONUS } : null,
				improvementLabel: building ? building.config.label : null,
			};
		};
		const updateHover = (col: number, row: number) => {
			hoverGfx.clear();
			moveLineGfx.clear();
			clearMovePathTexts(moveTexts);
			hoverOverlayGfx.clear();
			if (col < 0) {
				hud.updateTileInfo(null);
				return;
			}

			const key = `${col},${row}`;
			const isVisible = visibleTiles.has(key);
			const isExplored = explored().has(key);
			if (!isVisible && !isExplored) {
				hud.updateTileInfo(null);
				return;
			}

			drawHoverHighlight(hoverGfx, col, row);

			// Tile card always reflects the hovered tile (when visible), even when
			// a unit/building is selected — so players can inspect terrain without
			// losing their selection.
			hud.updateTileInfo(isVisible ? buildTileInfo(col, row) : null);

			// Re-draw the hovered tile's yield dots AND special resource on the
			// top-level overlay so they're visible even when a unit pin is on the tile.
			if (isVisible) {
				const { x, y } = getHexCenter(col, row);
				drawTileYields(hoverOverlayGfx, x, y, computeTileYield(col, row));
				const resId = resourceMap.get(key);
				if (resId) {
					drawResources(hoverOverlayGfx, new Map([[key, resId]]));
				}
			}

			if (selected && (col !== selected.col || row !== selected.row)) {
				const hoveredEnt = isVisible ? getEntityAt(col, row) : undefined;

				if (hoveredEnt && isEnemy(selected, hoveredEnt) && isUnit(selected)) {
					if (canAttackAdjacent(selected, hoveredEnt)) {
						refreshHudPanel(selected, hoveredEnt);
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
						refreshHudPanel(selected, hoveredEnt);
						if (moveAtk) {
							drawMovePath(
								moveLineGfx,
								moveAtk.path.tiles,
								moveAtk.path.costs,
								selected.stamina,
								true,
								this,
								moveTexts,
							);
						}
					}
				} else {
					refreshHudPanel(selected);
					const canMoveTo =
						!hoveredEnt ||
						(isBuilding(hoveredEnt) && hoveredEnt.team === selected.team);
					if (canMoveTo && isUnit(selected)) {
						const result = findPath(
							selected.col,
							selected.row,
							col,
							row,
							biomeMap,
							levelMap,
							riverTiles,
							forestTiles,
							riverFlow,
						);
						if (result && result.tiles.length > 1) {
							const reachable = Math.floor(selected.stamina - result.totalCost) >= 0;
							drawMovePath(
								moveLineGfx,
								result.tiles,
								result.costs,
								selected.stamina,
								reachable,
								this,
								moveTexts,
							);
						}
					}
				}
			} else if (selected) {
				refreshHudPanel(selected);
			} else {
				// No selection — show hovered entity if present, else just the tile card.
				const hoveredEnt = isVisible ? getEntityAt(col, row) : undefined;
				refreshHudPanel(hoveredEnt ?? null);
			}

			cursor.set(resolveCursor());
		};

		// --- Pointer events ---
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (this.isDragging) {
				this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX);
				this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY);
				hoverGfx.clear();
				hoverOverlayGfx.clear();
				moveLineGfx.clear();
				clearMovePathTexts(moveTexts);
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
			// Swallow clicks while any unit is mid-tween so rapid clicks can't
			// kick off a second move from the already-updated logical position
			// and end up with two sprites visible at once.
			if (animatingEntities.size > 0) return;

			// ─── Citizen placement (village selected) ───
			// Click on the small citizen hex slot to cycle the citizen count:
			//   - if not at max → increment (pull a citizen from anywhere)
			//   - if at max     → decrement and displace the citizen to the
			//                      village (1st choice) or the highest-bounty
			//                      tile with free capacity (2nd choice)
			// Clicks anywhere else on the tile fall through to normal cycle logic.
			if (selected && isBuilding(selected)) {
				const village = selected;
				const state = ensureSettlement(village);
				const border = getBorderTiles(village.col, village.row, state.population, biomeMap);
				const clickKey = `${hoveredCol},${hoveredRow}`;
				if (border.has(clickKey)) {
					const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
					const { x: tx, y: ty } = getHexCenter(hoveredCol, hoveredRow);
					if (isPointInCitizenSlot(wp.x, wp.y, tx, ty)) {
						const villageKey = `${village.col},${village.row}`;
						const cap = getSlotCapacity(clickKey, villageKey);
						const current = state.citizenTiles.get(clickKey) ?? 0;
						let moved = false;
						let citizenFrom = "";
						let citizenTo = "";
						if (current < cap) {
							citizenTo = clickKey;
							citizenFrom = villageKey;
							moved = moveCitizen(state, clickKey, villageKey);
						} else {
							const dest = findDisplacementDestination(state, village, clickKey);
							if (dest) {
								citizenTo = dest;
								citizenFrom = clickKey;
								moved = moveCitizen(state, dest, villageKey, clickKey);
							}
						}
						if (moved) {
							eventLog.record({
								type: "citizen_moved",
								villageId: village.id,
								fromTile: citizenFrom,
								toTile: citizenTo,
							});
							redrawPlacement(village);
							refreshHudPanel(village);
						}
						// Consume the click — even a no-op shouldn't deselect/cycle
						return;
					}
				}
			}

			const ent = getEntityAt(hoveredCol, hoveredRow);
			const afterAttack = (attacker: Entity, target: Entity) => {
				if (target.health <= 0) {
					eventLog.record({
						type: "entity_died",
						entityId: target.id,
						entityType: target.config.type,
						col: target.col,
						row: target.row,
						killedBy: attacker.id,
					});
					unplaceEntity(target);
					entities.splice(entities.indexOf(target), 1);
					settlements.delete(target);
					plannedPaths.delete(target);
					const realm = realmsByTeam.get(target.team);
					if (realm) realm.unitsLost += 1;
				}
				redrawFog();
				redrawEntities();
				selectGfx.clear();
				drawSelection(selectGfx, attacker.col, attacker.row, attacker.config.category);
				refreshHudPanel(attacker);
				syncEndTurnLabel();
				cursor.set(resolveCursor());
			};

			// Move — allowed onto empty tiles OR onto a friendly building (stacked).
			// Blocked by any unit (friendly or enemy) and by enemy buildings.
			const moveBlocked = ent && (isUnit(ent) || ent.team !== selected?.team);
			if (
				selected &&
				isUnit(selected) &&
				!moveBlocked &&
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
					riverFlow,
				);
				if (result && result.tiles.length > 1) {
					const mover = selected;
					const fullyReachable = Math.floor(mover.stamina - result.totalCost) >= 0;

					// Find the furthest tile the unit can reach this turn
					let moveIdx = result.tiles.length - 1;
					if (!fullyReachable) {
						moveIdx = 0;
						for (let i = result.tiles.length - 1; i >= 1; i--) {
							if (
								Math.floor(mover.stamina - result.costs[i]) >= 0 &&
								!entityAt.has(`${result.tiles[i].col},${result.tiles[i].row}`)
							) {
								moveIdx = i;
								break;
							}
						}
					}

					// No stamina — just store the entire path as planned
					if (moveIdx === 0) {
						plannedPaths.set(mover, result.tiles.slice(1));
						eventLog.record({
							type: "path_planned",
							entityId: mover.id,
							tiles: result.tiles.slice(1),
						});
						redrawFog();
						syncEndTurnLabel();
						return;
					}

					if (moveIdx > 0) {
						const moveTile = result.tiles[moveIdx];
						const moveCost = result.costs[moveIdx];
						const pathTiles = result.tiles.slice(0, moveIdx + 1);

						// Store remaining path for future turns
						plannedPaths.delete(mover);
						if (!fullyReachable) {
							const remaining = result.tiles.slice(moveIdx);
							if (remaining.length > 1) {
								plannedPaths.set(mover, remaining.slice(1));
								eventLog.record({
									type: "path_planned",
									entityId: mover.id,
									tiles: remaining.slice(1),
								});
							}
						}

						const moveFromCol = mover.col,
							moveFromRow = mover.row;
						executeMove(mover, moveTile.col, moveTile.row, moveCost, entityAt);
						eventLog.record({
							type: "entity_moved",
							entityId: mover.id,
							fromCol: moveFromCol,
							fromRow: moveFromRow,
							toCol: moveTile.col,
							toRow: moveTile.row,
							staminaCost: moveCost,
						});
						animatingEntities.add(mover);
						redrawFog();
						redrawEntities();
						moveLineGfx.clear();
						clearMovePathTexts(moveTexts);
						selectGfx.clear();
						playMoveAnimation(this, mover.team, mover.config.type, pathTiles, () => {
							animatingEntities.delete(mover);
							redrawFog();
							redrawEntities();
							if (selected === mover) {
								drawSelection(
									selectGfx,
									mover.col,
									mover.row,
									mover.config.category,
								);
							}
							refreshHudPanel(selected);
							syncEndTurnLabel();
							cursor.set(resolveCursor());
						});
						return;
					}
				}
			}

			// Adjacent attack
			if (selected && ent && canAttackAdjacent(selected, ent)) {
				const attacker = selected,
					target = ent;
				executeAttack(attacker, target);
				eventLog.record({
					type: "attack_executed",
					attackerId: attacker.id,
					targetId: target.id,
					damage: attacker.config.attackPower - target.config.defense,
					targetHealthAfter: target.health,
				});
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
					riverFlow,
				);
				if (moveAtk) {
					const attacker = selected,
						target = ent;
					const pathTiles = moveAtk.path.tiles;
					const fromCol = attacker.col,
						fromRow = attacker.row;
					executeMove(
						attacker,
						moveAtk.neighbor.col,
						moveAtk.neighbor.row,
						moveAtk.path.totalCost,
						entityAt,
					);
					eventLog.record({
						type: "entity_moved",
						entityId: attacker.id,
						fromCol,
						fromRow,
						toCol: moveAtk.neighbor.col,
						toRow: moveAtk.neighbor.row,
						staminaCost: moveAtk.path.totalCost,
					});
					executeAttack(attacker, target);
					eventLog.record({
						type: "attack_executed",
						attackerId: attacker.id,
						targetId: target.id,
						damage: attacker.config.attackPower - target.config.defense,
						targetHealthAfter: target.health,
					});
					animatingEntities.add(attacker);
					redrawFog();
					redrawEntities();
					moveLineGfx.clear();
					clearMovePathTexts(moveTexts);
					playMoveAnimation(this, attacker.team, attacker.config.type, pathTiles, () => {
						animatingEntities.delete(attacker);
						redrawEntities();
						playAttackAnimation(
							this,
							attacker.col,
							attacker.row,
							target.col,
							target.row,
							() => afterAttack(attacker, target),
						);
					});
					return;
				}
				return; // unreachable enemy — ignore click
			}

			// Cycle selection through stacked entities on this tile (own team only).
			// Single entity → click toggles select/deselect.
			// Multiple entities → clicks wrap around the stack (unit ↔ building).
			// Right-click always deselects.
			{
				const clickKey = `${hoveredCol},${hoveredRow}`;
				const stack: Entity[] = [];
				const unitHere = entityAt.get(clickKey);
				const buildingHere = buildingAt.get(clickKey);
				if (unitHere && unitHere.team === activeTeam) stack.push(unitHere);
				if (buildingHere && buildingHere.team === activeTeam) stack.push(buildingHere);

				if (stack.length === 0) {
					selected = null;
				} else if (stack.length === 1) {
					// Toggle select/deselect
					selected = selected === stack[0] ? null : stack[0];
				} else {
					// Wrap-around cycle — never deselect via cycle (use right-click)
					const currentIdx = selected ? stack.indexOf(selected) : -1;
					const next = (currentIdx + 1) % stack.length;
					selected = stack[next];
				}
			}

			selectGfx.clear();
			if (selected)
				drawSelection(selectGfx, selected.col, selected.row, selected.config.category);
			refreshHudPanel(selected);
			cursor.set(resolveCursor());
		});

		// --- Right-click deselect ---
		this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
			if (pointer.rightButtonReleased()) {
				if (selected && plannedPaths.has(selected)) {
					eventLog.record({
						type: "path_cancelled",
						entityId: selected.id,
					});
				}
				if (selected) plannedPaths.delete(selected);
				selected = null;
				selectGfx.clear();
				moveLineGfx.clear();
				clearMovePathTexts(moveTexts);
				hoverGfx.clear();
				hoverOverlayGfx.clear();
				refreshHudPanel(null);
				redrawPlannedPaths();
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
					Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.5, 5),
				);
				const { col, row } = screenToHex(pointer.x, pointer.y);
				hoveredCol = col;
				hoveredRow = row;
				updateHover(col, row);
			},
		);
	}
}
