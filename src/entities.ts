/**
 * entities.ts — Entity configuration and runtime state.
 *
 * Two layers:
 *   1. EntityConfig  — static blueprint per entity type (designer-facing)
 *   2. Entity        — runtime instance with mutable game state
 *
 * To add a new entity type or change base stats, edit ENTITY_CONFIGS.
 * Everything else derives from it.
 */

import { MAX_MOVE } from "./pathfinding";
import { teams } from "./theme";

// ═══════════════════════════════════════════════════
// CONFIG — static blueprints (edit these)
// ═══════════════════════════════════════════════════

export type EntityCategory = "building" | "unit";
export type EntityType = "village" | "worker" | "warrior";

export interface EntityConfig {
	type: EntityType;
	category: EntityCategory;
	label: string; // display name
	maxHealth: number;
	maxStamina: number; // 0 for buildings
	maxAttacks: number; // 0 for buildings
	visibility: number; // how many tiles around it can be seen
}

export const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
	village: {
		type: "village",
		category: "building",
		label: "Village",
		maxHealth: 10,
		maxStamina: 0,
		maxAttacks: 0,
		visibility: 2,
	},
	worker: {
		type: "worker",
		category: "unit",
		label: "Worker",
		maxHealth: 10,
		maxStamina: MAX_MOVE,
		maxAttacks: 1,
		visibility: 1,
	},
	warrior: {
		type: "warrior",
		category: "unit",
		label: "Warrior",
		maxHealth: 10,
		maxStamina: MAX_MOVE,
		maxAttacks: 2,
		visibility: 1,
	},
};

// ═══════════════════════════════════════════════════
// STATE — runtime instance (game logic mutates these)
// ═══════════════════════════════════════════════════

export interface Entity {
	readonly config: EntityConfig;
	col: number;
	row: number;
	team: number;
	health: number;
	stamina: number;
	attacks: number;
}

// ═══════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════

export const TEAM_BLUE = teams.blue;
export const TEAM_RED = teams.red;

// ═══════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════

export function createEntity(col: number, row: number, team: number, type: EntityType): Entity {
	const config = ENTITY_CONFIGS[type];
	return {
		config,
		col,
		row,
		team,
		health: config.maxHealth,
		stamina: config.maxStamina,
		attacks: config.maxAttacks,
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
	e.attacks = e.config.maxAttacks;
}
