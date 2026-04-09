/**
 * economy.ts — Economy, population, happiness, knowledge, policies, and tiers.
 *
 * Data-only: interfaces, configs, constants, and formulas.
 * No Phaser dependency. No runtime state mutation.
 *
 * Designers: edit the constants and tables here to tune the economy.
 */

import { BiomeType } from "./hex";
import { EntityType } from "./entities";

// ═══════════════════════════════════════════════════
// TILE YIELDS — resources produced per assigned gatherer
// ═══════════════════════════════════════════════════

export interface TileYieldConfig {
	base: number;
	withForest: number;
	withRiver: number;
}

export const TILE_YIELDS: Record<BiomeType, TileYieldConfig> = {
	grassland: { base: 2, withForest: 3, withRiver: 4 },
	desert: { base: 1, withForest: 1, withRiver: 3 },
	mountain: { base: 0, withForest: 0, withRiver: 0 },
	lake: { base: 0, withForest: 0, withRiver: 0 },
};

// ═══════════════════════════════════════════════════
// MAINTENANCE — per-unit resource cost per turn
// ═══════════════════════════════════════════════════

export const MAINTENANCE: Record<EntityType, number> = {
	village: 0,
	worker: 1,
	warrior: 2,
};

// ═══════════════════════════════════════════════════
// POPULATION — roles and unit training costs
// ═══════════════════════════════════════════════════

export type PopulationRole = "townCenter" | "gathering" | "defending";

export const UNIT_POP_COST: Record<EntityType, number> = {
	village: 0,
	worker: 1,
	warrior: 2,
};

export const STARTING_POPULATION = 3;

// ═══════════════════════════════════════════════════
// POPULATION GROWTH
// ═══════════════════════════════════════════════════

export const GROWTH_RATE = {
	base: 1.0,
	perUnlock: 0.2,
} as const;

export function growthThreshold(currentPopulation: number): number {
	return Math.floor(10 * currentPopulation * 0.45);
}

// ═══════════════════════════════════════════════════
// TERRITORY & BORDERS
// ═══════════════════════════════════════════════════

/** Auto-radius based on settlement population (free, no upkeep) */
export function autoBorderRadius(population: number): number {
	if (population >= 5) return 3;
	if (population >= 3) return 2;
	return 1;
}

export const MANUAL_CLAIM_COST = 5; // resources to claim one tile
export const TERRITORY_UPKEEP = 1; // resources/turn per manually claimed tile

// ═══════════════════════════════════════════════════
// HAPPINESS — tuning constants
// ═══════════════════════════════════════════════════

export const HAPPINESS = {
	base: 10,
	perForestTile: 1,
	perRiverTile: 1,
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
		canTrain: ["worker"],
	},
	{
		name: "Town",
		leaderTitle: "Mayor",
		minPopulation: 5,
		policySlots: 2,
		canTrain: ["worker", "warrior"],
	},
	{
		name: "City",
		leaderTitle: "Governor",
		minPopulation: 10,
		policySlots: 3,
		canTrain: ["worker", "warrior"],
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

export interface SettlementState {
	population: number;
	growthBucket: number;
	townCenterPop: number; // pop assigned to growth
	gatheringPop: number; // pop assigned to resource gathering
	defendingPop: number; // pop assigned to defense
	manuallyClaimedTiles: Set<string>;
	activePolicies: string[]; // policy IDs
}

export function createSettlementState(): SettlementState {
	return {
		population: STARTING_POPULATION,
		growthBucket: 0,
		townCenterPop: STARTING_POPULATION,
		gatheringPop: 0,
		defendingPop: 0,
		manuallyClaimedTiles: new Set(),
		activePolicies: [],
	};
}

// ═══════════════════════════════════════════════════
// REALM STATE — mutable, per team
// ═══════════════════════════════════════════════════

export interface RealmState {
	resources: number;
	knowledge: number;
	unlockedTechs: Set<UnlockId>;
	unitsLost: number;
	activePolicies: string[]; // realm policy IDs
}

export function createRealmState(): RealmState {
	return {
		resources: 0,
		knowledge: 0,
		unlockedTechs: new Set(),
		unitsLost: 0,
		activePolicies: [],
	};
}
