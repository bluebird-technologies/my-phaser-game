/**
 * entities.ts — Entity configuration and runtime state.
 *
 * Two layers:
 *   1. EntityConfig  — static blueprint per entity type (designer-facing)
 *   2. Entity        — runtime instance with mutable game state
 *
 * Actions are defined generically. Each unit type lists the actions it
 * supports with per-unit (staminaCost, chargesPerTurn) overrides.
 * See actions.ts for the action registry and execution logic.
 */

import { MAX_MOVE } from "./pathfinding";
import { teams } from "./theme";
import type { ActionId, UnitActionConfig } from "./actions";

// ═══════════════════════════════════════════════════
// CONFIG — static blueprints (edit these)
// ═══════════════════════════════════════════════════

export type EntityCategory = "building" | "unit";
export type EntityType = "village" | "warrior" | "villager" | "farm";

export interface EntityConfig {
	type: EntityType;
	category: EntityCategory;
	label: string; // display name
	maxHealth: number;
	maxStamina: number; // 0 for buildings
	visibility: number; // how many tiles around it can be seen
	attackPower: number; // damage dealt per attack
	defense: number; // damage reduction when attacked
	actions?: Partial<Record<ActionId, UnitActionConfig>>;
}

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
	village: {
		type: "village",
		category: "building",
		// "Village Center" is the building on the center tile; the whole
		// surrounding district is called a "Village" / "Town" / "City"
		// depending on tier (see SETTLEMENT_TIERS in economy.ts).
		label: "Village Center",
		maxHealth: 10,
		maxStamina: 0,
		visibility: 2,
		attackPower: 0,
		defense: 2,
		actions: {
			trainWarrior: { staminaCost: 0, chargesPerTurn: 1 },
			buildFarm: { staminaCost: 0, chargesPerTurn: 1 },
		},
	},
	warrior: {
		type: "warrior",
		category: "unit",
		label: "Warrior",
		maxHealth: 10,
		maxStamina: 4,
		visibility: 2,
		attackPower: 4,
		defense: 1,
		actions: {
			attack: { staminaCost: 1, chargesPerTurn: 1 },
		},
	},
	villager: {
		type: "villager",
		category: "unit",
		label: "Villager",
		maxHealth: 8,
		maxStamina: MAX_MOVE,
		visibility: 2,
		attackPower: 0,
		defense: 0,
		actions: {
			formVillage: { staminaCost: 3, chargesPerTurn: 1 },
		},
	},
	farm: {
		type: "farm",
		category: "building",
		label: "Farm",
		maxHealth: 5,
		maxStamina: 0,
		visibility: 0,
		attackPower: 0,
		defense: 0,
	},
};

// ═══════════════════════════════════════════════════
// STATE — runtime instance (game logic mutates these)
// ═══════════════════════════════════════════════════

export interface Entity {
	readonly id: string;
	readonly config: EntityConfig;
	col: number;
	row: number;
	team: number;
	health: number;
	stamina: number;
	charges: Record<ActionId, number>;
}

let nextEntityId = 0;
export function generateEntityId(): string {
	return `e${nextEntityId++}`;
}
export function getNextEntityId(): number {
	return nextEntityId;
}
export function setNextEntityId(n: number): void {
	nextEntityId = n;
}

// ═══════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════

export const TEAM_BLUE = teams.blue;
export const TEAM_RED = teams.red;

// ═══════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════

function buildCharges(config: EntityConfig): Record<ActionId, number> {
	const result: Record<string, number> = {};
	if (config.actions) {
		for (const [id, cfg] of Object.entries(config.actions)) {
			if (cfg) result[id] = cfg.chargesPerTurn;
		}
	}
	return result as Record<ActionId, number>;
}

export function createEntity(col: number, row: number, team: number, type: EntityType): Entity {
	const config = ENTITY_CONFIGS[type];
	return {
		id: generateEntityId(),
		config,
		col,
		row,
		team,
		health: config.maxHealth,
		stamina: config.maxStamina,
		charges: buildCharges(config),
	};
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

export function isUnit(e: Entity): boolean {
	return e.config.category === "unit";
}

export function isBuilding(e: Entity): boolean {
	return e.config.category === "building";
}

export function isEnemy(a: Entity, b: Entity): boolean {
	return a.team !== b.team;
}

export function resetTurn(e: Entity): void {
	e.stamina = e.config.maxStamina;
	e.charges = buildCharges(e.config);
}
