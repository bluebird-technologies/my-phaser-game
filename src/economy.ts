/**
 * economy.ts — Economy, population, happiness, knowledge, policies, and tiers.
 *
 * Data-only: interfaces, configs, constants, and formulas.
 * No Phaser dependency. No runtime state mutation.
 *
 * Designers: edit the constants and tables here to tune the economy.
 */

import { BiomeType, getNeighbors, inBounds } from "./hex";
import type { Entity } from "./entities";
import { EntityType } from "./entities";

// ═══════════════════════════════════════════════════
// TILE YIELDS — base output per biome per turn
// ═══════════════════════════════════════════════════

export interface TileYield {
	resources: number;
	growth: number;
	happiness: number;
	knowledge: number;
}

export const BIOME_YIELDS: Record<BiomeType, TileYield> = {
	desert: { resources: 0, growth: 0, happiness: 0, knowledge: 0 },
	lake: { resources: 0, growth: 1, happiness: 0, knowledge: 0 },
	grassland: { resources: 1, growth: 1, happiness: 0, knowledge: 0 },
	mountain: { resources: 1, growth: 0, happiness: 0, knowledge: 0 },
};

/** Bonus applied when a tile has a river (stacks with biome) */
export const RIVER_BONUS: TileYield = { resources: 0, growth: 1, happiness: 0, knowledge: 0 };

/** Bonus applied when a tile has forest (stacks with biome) */
export const FOREST_BONUS: TileYield = { resources: 1, growth: 0, happiness: 0, knowledge: 0 };

/** Bonus applied when a tile has a farm building */
export const FARM_BONUS: TileYield = { resources: 0, growth: 1, happiness: 0, knowledge: 0 };

/**
 * Flat yield bonus applied to the village's own tile. Represents the value
 * of the settlement infrastructure itself — like a free special resource
 * that only the village benefits from.
 */
export const VILLAGE_BONUS: TileYield = { resources: 1, growth: 1, happiness: 1, knowledge: 1 };

// ═══════════════════════════════════════════════════
// SPECIAL RESOURCES — randomly placed on tiles
// ═══════════════════════════════════════════════════

export type SpecialResourceId =
	| "gold"
	| "copper"
	| "iron"
	| "coal"
	| "gems"
	| "cattle"
	| "deer"
	| "wheat"
	| "fish"
	| "horses"
	| "marble"
	| "spices"
	| "silk"
	| "dyes"
	| "honey";

export interface SpecialResourceConfig {
	id: SpecialResourceId;
	label: string;
	icon: string; // single emoji/character for map rendering
	yield: TileYield;
	biomes: BiomeType[]; // which biomes this can appear on
	requiresForest?: boolean;
	requiresRiver?: boolean;
	rarity: number; // 0-1, lower = rarer
}

export const SPECIAL_RESOURCES: Record<SpecialResourceId, SpecialResourceConfig> = {
	// --- Mineral resources (desert, mountain) ---
	gold: {
		id: "gold",
		label: "Gold",
		icon: "◆",
		yield: { resources: 3, growth: 0, happiness: 0, knowledge: 0 },
		biomes: ["mountain", "desert"],
		rarity: 0.028,
	},
	copper: {
		id: "copper",
		label: "Copper",
		icon: "⬡",
		yield: { resources: 2, growth: 0, happiness: 0, knowledge: 0 },
		biomes: ["mountain", "desert"],
		rarity: 0.042,
	},
	iron: {
		id: "iron",
		label: "Iron",
		icon: "⛏",
		yield: { resources: 2, growth: 0, happiness: 0, knowledge: 0 },
		biomes: ["mountain"],
		rarity: 0.056,
	},
	coal: {
		id: "coal",
		label: "Coal",
		icon: "▪",
		yield: { resources: 2, growth: 0, happiness: -1, knowledge: 0 },
		biomes: ["mountain", "desert"],
		rarity: 0.042,
	},
	gems: {
		id: "gems",
		label: "Gems",
		icon: "◇",
		yield: { resources: 1, growth: 0, happiness: 1, knowledge: 1 },
		biomes: ["mountain"],
		rarity: 0.021,
	},
	marble: {
		id: "marble",
		label: "Marble",
		icon: "▧",
		yield: { resources: 1, growth: 0, happiness: 1, knowledge: 1 },
		biomes: ["mountain", "desert"],
		rarity: 0.035,
	},

	// --- Animal resources (grassland, forest) ---
	cattle: {
		id: "cattle",
		label: "Cattle",
		icon: "🐄",
		yield: { resources: 1, growth: 1, happiness: 0, knowledge: 0 },
		biomes: ["grassland"],
		rarity: 0.056,
	},
	deer: {
		id: "deer",
		label: "Deer",
		icon: "🦌",
		yield: { resources: 1, growth: 1, happiness: 1, knowledge: 0 },
		biomes: ["grassland"],
		requiresForest: true,
		rarity: 0.049,
	},
	horses: {
		id: "horses",
		label: "Horses",
		icon: "🐎",
		yield: { resources: 1, growth: 0, happiness: 1, knowledge: 0 },
		biomes: ["grassland"],
		rarity: 0.035,
	},

	// --- Agricultural resources (grassland, river) ---
	wheat: {
		id: "wheat",
		label: "Wheat",
		icon: "⌾",
		yield: { resources: 1, growth: 2, happiness: 0, knowledge: 0 },
		biomes: ["grassland"],
		rarity: 0.07,
	},
	fish: {
		id: "fish",
		label: "Fish",
		icon: "🐟",
		yield: { resources: 1, growth: 2, happiness: 0, knowledge: 0 },
		biomes: ["lake"],
		rarity: 0.105,
	},

	// --- Luxury resources (rare, happiness-focused) ---
	spices: {
		id: "spices",
		label: "Spices",
		icon: "❋",
		yield: { resources: 1, growth: 0, happiness: 2, knowledge: 0 },
		biomes: ["desert", "grassland"],
		rarity: 0.028,
	},
	silk: {
		id: "silk",
		label: "Silk",
		icon: "⚘",
		yield: { resources: 1, growth: 0, happiness: 1, knowledge: 1 },
		biomes: ["grassland"],
		requiresForest: true,
		rarity: 0.021,
	},
	dyes: {
		id: "dyes",
		label: "Dyes",
		icon: "✿",
		yield: { resources: 0, growth: 0, happiness: 3, knowledge: 0 },
		biomes: ["grassland"],
		requiresRiver: true,
		rarity: 0.028,
	},
	honey: {
		id: "honey",
		label: "Honey",
		icon: "🍯",
		yield: { resources: 0, growth: 1, happiness: 2, knowledge: 0 },
		biomes: ["grassland"],
		requiresForest: true,
		rarity: 0.035,
	},
};

// ═══════════════════════════════════════════════════
// MAINTENANCE — per-unit resource cost per turn
// ═══════════════════════════════════════════════════

export const MAINTENANCE: Record<EntityType, number> = {
	village: 0,
	warrior: 2,
	villager: 1,
	farm: 0,
};

// ═══════════════════════════════════════════════════
// POPULATION — roles and unit training costs
// ═══════════════════════════════════════════════════

export type PopulationRole = "townCenter" | "gathering" | "defending";

export const UNIT_POP_COST: Record<EntityType, number> = {
	village: 0,
	warrior: 1,
	villager: 1,
	farm: 0,
};

export const UNIT_RESOURCE_COST: Record<EntityType, number> = {
	village: 0,
	warrior: 20,
	villager: 5,
	farm: 20,
};

export interface ProductionOrder {
	unitType: EntityType;
	resourceProgress: number;
	resourceCost: number;
	popCost: number;
	targetTile?: { col: number; row: number };
}

export const STARTING_POPULATION = 1;

// ═══════════════════════════════════════════════════
// POPULATION GROWTH
// ═══════════════════════════════════════════════════

/**
 * Growth required in the bucket to reach the next population level.
 * 1→2 needs 4, 2→3 needs 5, 3→4 needs 6, N→N+1 needs N+3.
 */
export function growthThreshold(currentPopulation: number): number {
	return 18 + 2 * currentPopulation;
}

// ═══════════════════════════════════════════════════
// TERRITORY & BORDERS
// ═══════════════════════════════════════════════════

/**
 * Auto-radius based on settlement population (free, no upkeep).
 * For now, fixed at 1 (the village + its 6 adjacent tiles).
 * Will scale with population in a future iteration. The `population`
 * parameter is kept for forward-compatibility — call sites pass it.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autoBorderRadius(population: number): number {
	return 1;
}

export const MANUAL_CLAIM_COST = 5; // resources to claim one tile
export const TERRITORY_UPKEEP = 1; // resources/turn per manually claimed tile

// ═══════════════════════════════════════════════════
// HAPPINESS — tuning constants
// ═══════════════════════════════════════════════════
//
// Happiness is a STATUS, not a channeled resource. A settlement's current
// happiness is the sum of the happiness produced by the tiles its citizens
// work (special resources, the village-tile bonus, etc.) minus status
// penalties for war, expansion, and over-claimed territory. With no citizens
// on any happiness-producing tile, the base is 0 — exactly as the design
// calls for.

export const HAPPINESS = {
	base: 0,
	expansionPenalty: -3, // per pop above threshold
	expansionThreshold: 3, // pop level where penalty starts
	territoryPenalty: -1, // per manually claimed tile
	militaryBurden: -2, // per warrior, realm-wide split across settlements
	warWeariness: -5, // per unit lost (persistent)
} as const;

export const HAPPINESS_THRESHOLDS = {
	goldenAge: 20,
	content: 0,
	discontent: -1,
	unrest: -20,
} as const;

export const HAPPINESS_EFFECTS = {
	goldenAge: {
		yieldMultiplier: 1.5,
		knowledgeBonus: 1,
		growthRateBonus: 0.5,
	},
	content: {
		yieldMultiplier: 1.0,
		knowledgeBonus: 0,
		growthRateBonus: 0,
	},
	discontent: {
		yieldMultiplier: 0.75,
		growthRateMultiplier: 0.5,
	},
	unrest: {
		yieldMultiplier: 0.5,
		growthStops: true,
		cannotClaim: true,
		bordersRevert: true,
	},
} as const;

// ═══════════════════════════════════════════════════
// KNOWLEDGE — realm-level accumulation
// ═══════════════════════════════════════════════════

export const KNOWLEDGE = {
	basePerSettlement: 1,
	perPopulationDivisor: 3, // +1 per N pop
} as const;

// ═══════════════════════════════════════════════════
// UNLOCKS — spend knowledge to purchase
// ═══════════════════════════════════════════════════

export type UnlockId =
	| "bronzeWorking"
	| "irrigation"
	| "masonry"
	| "currency"
	| "philosophy"
	| "ironWorking"
	| "engineering";

export interface UnlockConfig {
	id: UnlockId;
	label: string;
	cost: number;
	description: string;
}

export const UNLOCKS: Record<UnlockId, UnlockConfig> = {
	bronzeWorking: {
		id: "bronzeWorking",
		label: "Bronze Working",
		cost: 15,
		description: "Warriors: +1 attack power",
	},
	irrigation: {
		id: "irrigation",
		label: "Irrigation",
		cost: 12,
		description: "Desert+river tiles: +1 yield",
	},
	masonry: {
		id: "masonry",
		label: "Masonry",
		cost: 20,
		description: "Settlements: +5 max health",
	},
	currency: {
		id: "currency",
		label: "Currency",
		cost: 18,
		description: "Unit maintenance: -1 (min 0)",
	},
	philosophy: {
		id: "philosophy",
		label: "Philosophy",
		cost: 15,
		description: "+5 base happiness per settlement",
	},
	ironWorking: {
		id: "ironWorking",
		label: "Iron Working",
		cost: 30,
		description: "Warriors: +2 attack power (stacks)",
	},
	engineering: {
		id: "engineering",
		label: "Engineering",
		cost: 35,
		description: "Unlock Outpost building",
	},
};

// ═══════════════════════════════════════════════════
// POLICIES — adoptable modifiers with trade-offs
// ═══════════════════════════════════════════════════

export type PolicyScope = "settlement" | "realm";

export interface PolicyConfig {
	id: string;
	label: string;
	scope: PolicyScope;
	description: string;
	benefit: string;
	cost: string;
}

export const POLICY_SWITCH_COST = {
	resources: 10,
	happinessPenalty: -5,
	penaltyDurationTurns: 3,
} as const;

export const POLICY_REMOVE_COST = 5; // resources

export const SETTLEMENT_POLICIES: PolicyConfig[] = [
	{
		id: "harvestFestival",
		label: "Harvest Festival",
		scope: "settlement",
		description: "Boost farm output at the cost of learning",
		benefit: "+50% farm yields",
		cost: "-1 knowledge/turn from this settlement",
	},
	{
		id: "fortification",
		label: "Fortification",
		scope: "settlement",
		description: "Strengthen defenses at the cost of production",
		benefit: "+2 settlement defense, defenders cost no maintenance",
		cost: "-1 resource yield per tile",
	},
	{
		id: "openMarket",
		label: "Open Market",
		scope: "settlement",
		description: "Increase trade at the cost of contentment",
		benefit: "+1 resource per border tile",
		cost: "-2 happiness",
	},
	{
		id: "scholarship",
		label: "Scholarship",
		scope: "settlement",
		description: "Invest in learning at the cost of production",
		benefit: "+2 knowledge/turn",
		cost: "-25% resource yields",
	},
];

export const REALM_POLICIES: PolicyConfig[] = [
	{
		id: "militarism",
		label: "Militarism",
		scope: "realm",
		description: "Empower warriors at the cost of morale",
		benefit: "+2 warrior attack power",
		cost: "-3 happiness per settlement",
	},
	{
		id: "expansionism",
		label: "Expansionism",
		scope: "realm",
		description: "Cheaper expansion at the cost of stability",
		benefit: "Territory claim cost halved",
		cost: "-1 happiness per settlement, +1 warrior maintenance",
	},
	{
		id: "culturalFocus",
		label: "Cultural Focus",
		scope: "realm",
		description: "Prioritize knowledge at the cost of production",
		benefit: "+3 knowledge/turn, unlock cost -20%",
		cost: "-25% resource yields realm-wide",
	},
	{
		id: "tradeLeague",
		label: "Trade League",
		scope: "realm",
		description: "Boost economy at the cost of defense",
		benefit: "+2 resources per settlement",
		cost: "-1 defense all settlements",
	},
];

// ═══════════════════════════════════════════════════
// SETTLEMENT TIERS
// ═══════════════════════════════════════════════════

export interface SettlementTier {
	name: string;
	leaderTitle: string;
	minPopulation: number;
	policySlots: number;
	canTrain: EntityType[];
}

export const SETTLEMENT_TIERS: SettlementTier[] = [
	{
		name: "Village",
		leaderTitle: "Elder",
		minPopulation: 1,
		policySlots: 1,
		canTrain: ["warrior"],
	},
	{
		name: "Town",
		leaderTitle: "Mayor",
		minPopulation: 5,
		policySlots: 2,
		canTrain: ["warrior"],
	},
	{
		name: "City",
		leaderTitle: "Governor",
		minPopulation: 10,
		policySlots: 3,
		canTrain: ["warrior"],
	},
];

export function getSettlementTier(population: number): SettlementTier {
	for (let i = SETTLEMENT_TIERS.length - 1; i >= 0; i--) {
		if (population >= SETTLEMENT_TIERS[i].minPopulation) {
			return SETTLEMENT_TIERS[i];
		}
	}
	return SETTLEMENT_TIERS[0];
}

// ═══════════════════════════════════════════════════
// REALM TIERS
// ═══════════════════════════════════════════════════

export interface RealmTier {
	name: string;
	leaderTitle: string;
	minSettlements: number;
	policySlots: number;
}

export const REALM_TIERS: RealmTier[] = [
	{ name: "Chiefdom", leaderTitle: "Chief", minSettlements: 1, policySlots: 1 },
	{ name: "Province", leaderTitle: "Lord", minSettlements: 2, policySlots: 2 },
	{ name: "Kingdom", leaderTitle: "King", minSettlements: 4, policySlots: 3 },
	{ name: "Empire", leaderTitle: "Emperor", minSettlements: 7, policySlots: 4 },
];

export function getRealmTier(settlementCount: number): RealmTier {
	for (let i = REALM_TIERS.length - 1; i >= 0; i--) {
		if (settlementCount >= REALM_TIERS[i].minSettlements) {
			return REALM_TIERS[i];
		}
	}
	return REALM_TIERS[0];
}

// ═══════════════════════════════════════════════════
// SETTLEMENT STATE — mutable, per village
// ═══════════════════════════════════════════════════

/** Max citizens on the village tile scales with population: 1 for 1-3, 2 for 4-6, etc. */
export function villageTileCapacity(population: number): number {
	return Math.max(1, Math.ceil(population / 3));
}
/** Max citizens that can be placed on any other border tile. */
export const BORDER_TILE_CAPACITY = 1;

/**
 * Returns the per-tile citizen capacity. The village's own tile holds more
 * than border tiles to represent town-center density.
 */
export function getSlotCapacity(tileKey: string, villageKey: string, population: number): number {
	return tileKey === villageKey ? villageTileCapacity(population) : BORDER_TILE_CAPACITY;
}

export interface SettlementState {
	population: number;
	growthBucket: number;
	/**
	 * Where each citizen is placed. Key = tile key "col,row", value = citizen count.
	 * The village tile itself represents the "town center" role — citizens there
	 * drive population growth. Citizens on border tiles gather that tile's yields.
	 * The sum of all values should equal `population`.
	 */
	citizenTiles: Map<string, number>;
	manuallyClaimedTiles: Set<string>;
	activePolicies: string[]; // policy IDs
	currentProduction: ProductionOrder | null;
	resourceCache: number;
}

/**
 * Create a new settlement with the starting population placed in the town center
 * (at the village's own tile).
 */
export function createSettlementState(villageCol: number, villageRow: number): SettlementState {
	const townCenterKey = `${villageCol},${villageRow}`;
	return {
		population: STARTING_POPULATION,
		growthBucket: 0,
		citizenTiles: new Map([[townCenterKey, STARTING_POPULATION]]),
		manuallyClaimedTiles: new Set(),
		activePolicies: [],
		currentProduction: null,
		resourceCache: 0,
	};
}

/** How many citizens are placed at a specific tile. */
export function getCitizensAt(state: SettlementState, col: number, row: number): number {
	return state.citizenTiles.get(`${col},${row}`) ?? 0;
}

/** How many citizens are assigned to the town center (village tile). */
export function getTownCenterPop(state: SettlementState, village: Entity): number {
	return getCitizensAt(state, village.col, village.row);
}

/**
 * Move one citizen to `toKey`. Returns true on success.
 *
 * - Respects the destination tile's slot capacity (village tile holds more than
 *   border tiles). Returns false if the destination is already full.
 * - If `fromKey` is omitted, picks any other tile with a citizen to pull from.
 */
export function moveCitizen(
	state: SettlementState,
	toKey: string,
	villageKey: string,
	fromKey: string | null = null,
): boolean {
	const cap = getSlotCapacity(toKey, villageKey, state.population);
	const currentAtDest = state.citizenTiles.get(toKey) ?? 0;
	if (currentAtDest >= cap) return false; // slot full

	let source = fromKey;
	if (!source) {
		// Pick any tile other than the destination that has a citizen
		for (const [key, count] of state.citizenTiles) {
			if (key !== toKey && count > 0) {
				source = key;
				break;
			}
		}
	}
	if (!source) return false;

	const fromCount = state.citizenTiles.get(source) ?? 0;
	if (fromCount < 1) return false;

	// Decrement source
	if (fromCount === 1) state.citizenTiles.delete(source);
	else state.citizenTiles.set(source, fromCount - 1);

	// Increment destination
	state.citizenTiles.set(toKey, currentAtDest + 1);
	return true;
}

/**
 * The "bounty" of a yield is the sum of all four metrics — a single number
 * that represents the total value of a tile across resources, growth,
 * happiness, and knowledge. Used to compare and rank tiles.
 */
export function tileBounty(y: TileYield): number {
	return y.resources + y.growth + y.happiness + y.knowledge;
}

/**
 * Place a settlement's starting citizens intelligently:
 * - Fill the village tile (town center) up to its capacity first.
 * - Distribute remaining citizens onto border tiles, picking the highest
 *   bounty tiles first, respecting per-slot capacity.
 *
 * Mutates `state.citizenTiles` in place.
 */
export function seedSettlementCitizens(
	village: Entity,
	state: SettlementState,
	biomeMap: BiomeType[][],
	forestTiles: Set<string>,
	riverTiles: Set<string>,
	resourceMap: Map<string, SpecialResourceId>,
): void {
	const villageKey = `${village.col},${village.row}`;
	state.citizenTiles.clear();
	let remaining = state.population;

	// Town center first
	const townCenterPlace = Math.min(remaining, villageTileCapacity(state.population));
	if (townCenterPlace > 0) {
		state.citizenTiles.set(villageKey, townCenterPlace);
		remaining -= townCenterPlace;
	}
	if (remaining <= 0) return;

	// Score each non-village border tile by its bounty (sum of all metrics)
	const border = getBorderTiles(village.col, village.row, state.population, biomeMap);
	const candidates = Array.from(border).filter((k) => k !== villageKey);
	const bountyOf = (key: string): number => {
		const [col, row] = key.split(",").map(Number);
		let b = tileBounty(BIOME_YIELDS[biomeMap[row][col]]);
		if (forestTiles.has(key)) b += tileBounty(FOREST_BONUS);
		if (riverTiles.has(key)) b += tileBounty(RIVER_BONUS);
		const resId = resourceMap.get(key);
		if (resId) b += tileBounty(SPECIAL_RESOURCES[resId].yield);
		return b;
	};
	candidates.sort((a, b) => bountyOf(b) - bountyOf(a));

	for (const key of candidates) {
		if (remaining <= 0) break;
		const place = Math.min(remaining, BORDER_TILE_CAPACITY);
		state.citizenTiles.set(key, place);
		remaining -= place;
	}
}

// ═══════════════════════════════════════════════════
// REALM STATE — mutable, per team
// ═══════════════════════════════════════════════════

/**
 * Realm-level mutable state. Only knowledge lives here — it's the one metric
 * shared across all settlements in the realm (it feeds the tech tree).
 * Resources are per-settlement (channeled into local recruitment / building),
 * growth is per-settlement, and happiness is a per-settlement snapshot.
 */
export interface RealmState {
	knowledge: number;
	unlockedTechs: Set<UnlockId>;
	unitsLost: number;
	activePolicies: string[]; // realm policy IDs
}

export function createRealmState(): RealmState {
	return {
		knowledge: 0,
		unlockedTechs: new Set(),
		unitsLost: 0,
		activePolicies: [],
	};
}

// ═══════════════════════════════════════════════════
// SETTLEMENT COMPUTATIONS (pure, read-only)
// ═══════════════════════════════════════════════════

/**
 * BFS out to `autoBorderRadius(population)` from the village tile.
 * All biomes are workable — citizens can fish lakes, mine mountains, farm
 * grassland, etc. Returns the set of tile keys ("col,row") within the
 * settlement's borders, INCLUDING the village tile itself.
 *
 * `biomeMap` is kept in the signature for forward-compat (we may want to
 * gate some future biome out of the border set later).
 */
export function getBorderTiles(
	cx: number,
	cy: number,
	population: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	biomeMap: BiomeType[][],
): Set<string> {
	const radius = autoBorderRadius(population);
	const tiles = new Set<string>();
	tiles.add(`${cx},${cy}`);

	let frontier = [{ col: cx, row: cy }];
	for (let d = 0; d < radius; d++) {
		const next: Array<{ col: number; row: number }> = [];
		for (const node of frontier) {
			for (const n of getNeighbors(node.col, node.row)) {
				if (!inBounds(n.col, n.row)) continue;
				const key = `${n.col},${n.row}`;
				if (tiles.has(key)) continue;
				tiles.add(key);
				next.push({ col: n.col, row: n.row });
			}
		}
		frontier = next;
	}
	return tiles;
}

/** Add `from` × `mult` into `into`. */
function addYieldTimes(into: TileYield, from: TileYield, mult: number): void {
	into.resources += from.resources * mult;
	into.growth += from.growth * mult;
	into.happiness += from.happiness * mult;
	into.knowledge += from.knowledge * mult;
}

/**
 * Compute total per-turn tile yields generated by a settlement. Only tiles
 * with citizens placed on them contribute — each citizen gathers the full
 * yield of their tile (biome + forest/river + special resource + village
 * bonus when on the village tile).
 */
export function computeSettlementYields(
	village: Entity,
	state: SettlementState,
	biomeMap: BiomeType[][],
	forestTiles: Set<string>,
	riverTiles: Set<string>,
	resourceMap: Map<string, SpecialResourceId>,
	farmTiles?: Set<string>,
): TileYield {
	const total: TileYield = { resources: 0, growth: 0, happiness: 0, knowledge: 0 };
	const villageKey = `${village.col},${village.row}`;

	for (const [key, count] of state.citizenTiles) {
		if (count <= 0) continue;
		const [col, row] = key.split(",").map(Number);
		if (row < 0 || row >= biomeMap.length) continue;
		if (col < 0 || col >= biomeMap[row].length) continue;
		const biome = biomeMap[row][col];
		addYieldTimes(total, BIOME_YIELDS[biome], count);
		if (forestTiles.has(key)) addYieldTimes(total, FOREST_BONUS, count);
		if (riverTiles.has(key)) addYieldTimes(total, RIVER_BONUS, count);
		const resId = resourceMap.get(key);
		if (resId) addYieldTimes(total, SPECIAL_RESOURCES[resId].yield, count);
		if (key === villageKey) addYieldTimes(total, VILLAGE_BONUS, count);
		if (farmTiles?.has(key)) addYieldTimes(total, FARM_BONUS, count);
	}

	return total;
}

/**
 * Per-turn settlement tick. Accumulates growth from pre-computed yields into
 * the growth bucket. When the bucket crosses the threshold, population
 * increases by 1 and the bucket resets (carrying over the surplus).
 *
 * The caller computes yields ONCE and passes the same snapshot to both
 * growth and production ticks, so a population increase mid-turn cannot
 * inflate the resource yield that production sees.
 *
 * Returns true if the population grew this tick.
 */
export function tickSettlementGrowth(
	village: Entity,
	state: SettlementState,
	yields: TileYield,
	biomeMap: BiomeType[][],
	forestTiles: Set<string>,
	riverTiles: Set<string>,
	resourceMap: Map<string, SpecialResourceId>,
): boolean {
	state.growthBucket += yields.growth;

	const threshold = growthThreshold(state.population);
	if (state.growthBucket >= threshold) {
		state.growthBucket -= threshold;
		state.population += 1;
		seedSettlementCitizens(village, state, biomeMap, forestTiles, riverTiles, resourceMap);
		return true;
	}
	return false;
}

/**
 * Per-turn production tick. Adds the pre-computed resource yield to the
 * production bucket. When accumulated resources reach the cost, the order
 * is complete — returns the unit type to spawn.
 */
export function tickSettlementProduction(
	state: SettlementState,
	yields: TileYield,
): ProductionOrder | null {
	if (!state.currentProduction) return null;

	state.currentProduction.resourceProgress += yields.resources;

	if (state.currentProduction.resourceProgress >= state.currentProduction.resourceCost) {
		const order = state.currentProduction;
		state.currentProduction = null;
		return order;
	}

	return null;
}

export function cancelProduction(state: SettlementState): void {
	if (!state.currentProduction) return;
	state.resourceCache += state.currentProduction.resourceProgress;
	state.population += state.currentProduction.popCost;
	state.currentProduction = null;
}

/**
 * Compute the current happiness snapshot for a settlement.
 *
 * Happiness is NOT accumulated over time — it's the sum of the happiness that
 * the citizen-worked tiles currently produce (special resources, the village
 * tile's bonus, etc.), minus status penalties for war, over-expansion, and
 * territory upkeep. With no citizens on any happiness-producing tile and no
 * penalties, this returns 0.
 *
 * `teamWarriorCount` and `totalSettlements` let us split realm-wide penalties
 * across cities evenly.
 */
export function computeSettlementHappiness(
	citizenHappiness: number,
	state: SettlementState,
	teamWarriorCount: number,
	totalSettlements: number,
	realmUnitsLost: number,
): number {
	let h = HAPPINESS.base + citizenHappiness;

	// Expansion penalty: each population point above the threshold stings
	if (state.population > HAPPINESS.expansionThreshold) {
		h += HAPPINESS.expansionPenalty * (state.population - HAPPINESS.expansionThreshold);
	}

	// Manually claimed tile upkeep
	h += HAPPINESS.territoryPenalty * state.manuallyClaimedTiles.size;

	// Military burden + war weariness split across all settlements in the realm
	const split = totalSettlements > 0 ? totalSettlements : 1;
	h += (HAPPINESS.militaryBurden * teamWarriorCount) / split;
	h += (HAPPINESS.warWeariness * realmUnitsLost) / split;

	return Math.round(h);
}

/**
 * Bundled settlement snapshot used by the UI. Built once per selection.
 *
 * Per-metric semantics:
 *  - `yieldPerTurn.resources` and `.growth` and `.knowledge` are channeled
 *    per-turn flows. Resources feed local recruitment/building, growth fills
 *    the growth bucket, knowledge is added to the realm treasury.
 *  - `happiness` is a snapshot status, NOT a per-turn flow. Do not display
 *    `yieldPerTurn.happiness` — it's a transient intermediate used only to
 *    feed the happiness computation.
 */
export interface SettlementStats {
	tier: SettlementTier;
	population: number;
	townCenterPop: number; // citizens in the village tile (driving growth)
	gatheringPop: number; // citizens on border tiles (gathering yields)
	maxPopulationAtTier: number; // next-tier threshold, or Infinity if max
	populationGrowthPerTurn: number;
	growthBucket: number;
	growthBucketMax: number;

	borderTileCount: number;
	borderRadius: number;

	// Per-turn channeled yields. Only resources / growth / knowledge are
	// meaningful as "per turn" flows; happiness is carried here too but
	// UIs should NOT render it as a rate.
	yieldPerTurn: TileYield;

	// Current happiness (snapshot). Sum of happiness from citizen-worked
	// tiles minus status penalties.
	happiness: number;
	happinessBand: "goldenAge" | "content" | "discontent" | "unrest";

	// Realm-wide knowledge treasury (only knowledge is realm-level).
	realmKnowledge: number;

	// Active production order (null if idle).
	currentProduction: ProductionOrder | null;
}

export function happinessBand(h: number): SettlementStats["happinessBand"] {
	if (h >= HAPPINESS_THRESHOLDS.goldenAge) return "goldenAge";
	if (h <= HAPPINESS_THRESHOLDS.unrest) return "unrest";
	if (h <= HAPPINESS_THRESHOLDS.discontent) return "discontent";
	return "content";
}

/**
 * Build a complete SettlementStats snapshot for the UI.
 * Callers provide realm + world context; all pure reads.
 */
export function buildSettlementStats(
	village: Entity,
	state: SettlementState,
	realm: RealmState,
	biomeMap: BiomeType[][],
	forestTiles: Set<string>,
	riverTiles: Set<string>,
	resourceMap: Map<string, SpecialResourceId>,
	teamWarriorCount: number,
	totalSettlements: number,
	farmTiles?: Set<string>,
): SettlementStats {
	const tier = getSettlementTier(state.population);
	// Next tier threshold, if any
	const tiers = SETTLEMENT_TIERS;
	const currentTierIdx = tiers.indexOf(tier);
	const nextTier = tiers[currentTierIdx + 1];
	const maxPopAtTier = nextTier ? nextTier.minPopulation - 1 : Infinity;

	const yieldPerTurn = computeSettlementYields(
		village,
		state,
		biomeMap,
		forestTiles,
		riverTiles,
		resourceMap,
		farmTiles,
	);

	const happiness = computeSettlementHappiness(
		yieldPerTurn.happiness,
		state,
		teamWarriorCount,
		totalSettlements,
		realm.unitsLost,
	);
	const band = happinessBand(happiness);

	const townCenterPop = getTownCenterPop(state, village);
	const gatheringPop = state.population - townCenterPop;
	// Growth per turn is the `growth` yield from tiles citizens are gathering
	// (including the village tile, which carries VILLAGE_BONUS).
	const popRate = yieldPerTurn.growth;

	const border = getBorderTiles(village.col, village.row, state.population, biomeMap);

	return {
		tier,
		population: state.population,
		townCenterPop,
		gatheringPop,
		maxPopulationAtTier: maxPopAtTier,
		populationGrowthPerTurn: popRate,
		growthBucket: state.growthBucket,
		growthBucketMax: growthThreshold(state.population),
		borderTileCount: border.size,
		borderRadius: autoBorderRadius(state.population),
		yieldPerTurn,
		happiness,
		happinessBand: band,
		realmKnowledge: realm.knowledge,
		currentProduction: state.currentProduction,
	};
}
