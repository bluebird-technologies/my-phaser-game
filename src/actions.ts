/**
 * actions.ts — Generic unit action system.
 *
 * Every unit action is defined by two stats:
 *   - staminaCost   : how much stamina each use costs
 *   - chargesPerTurn: how many times it can be used per turn
 *
 * Action logic lives in an ActionDefinition (pure functions that mutate
 * entity state + entityAt map — same pattern as combat.ts).
 *
 * Movement is NOT modeled here — it stays special-cased in the pathfinder
 * because its stamina cost varies per tile.
 */

import type { Entity, EntityType } from "./entities";
import { type BiomeType } from "./hex";
import { isUnit, isEnemy, isBuilding, ENTITY_CONFIGS, createEntity } from "./entities";
import { isAdjacent, computeDamage } from "./combat";
import { UNIT_POP_COST, UNIT_RESOURCE_COST, type SettlementState } from "./economy";

// ═══════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════

export type ActionId = "attack" | "formVillage" | "skipTurn" | "trainWarrior" | "buildFarm";

/** Per-unit override for an action: how much it costs and how often it can run. */
export interface UnitActionConfig {
	staminaCost: number;
	chargesPerTurn: number;
}

/** World state passed to action predicates and execution. */
export interface ActionContext {
	entityAt: Map<string, Entity>;
	biomeMap: BiomeType[][];
	getSettlement?: (village: Entity) => SettlementState | null;
	getResourcesPerTurn?: (village: Entity) => number;
}

export interface ActionResult {
	/** True if the acting entity should be removed from entities[]. */
	consumed: boolean;
	/** New entities created by this action (pushed into entities[] by caller). */
	newEntities?: Entity[];
	/** Other entities removed by this action. */
	removedEntities?: Entity[];
}

export interface ActionDefinition {
	id: ActionId;
	label: string;
	description?: string;
	icon?: string;
	/** If true, the action needs a target entity and is NOT shown in the targetless ActionBar. */
	requiresTarget: boolean;
	/** If true, clicking this action enters tile-placement mode instead of executing immediately. */
	requiresPlacement?: boolean;
	/** Optional resource/pop costs displayed in the ActionBar UI. */
	popCost?: number;
	resourceCost?: number;
	/** When set, the ActionBar shows production progress for this unit type. */
	producesUnit?: EntityType;
	canExecute: (entity: Entity, ctx: ActionContext, target?: Entity) => boolean;
	whyDisabled?: (entity: Entity, ctx: ActionContext, target?: Entity) => string | null;
	execute: (entity: Entity, ctx: ActionContext, target?: Entity) => ActionResult;
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

export function getUnitActionConfig(type: EntityType, id: ActionId): UnitActionConfig | null {
	const actions = ENTITY_CONFIGS[type].actions;
	return actions?.[id] ?? null;
}

export function remainingCharges(entity: Entity, id: ActionId): number {
	return entity.charges[id] ?? 0;
}

/** Resets an entity's charges to the max defined in its config. */
export function resetCharges(entity: Entity): void {
	const actions = entity.config.actions;
	const next: Record<string, number> = {};
	if (actions) {
		for (const [id, cfg] of Object.entries(actions)) {
			if (cfg) next[id] = cfg.chargesPerTurn;
		}
	}
	entity.charges = next as Record<ActionId, number>;
}

export function getAvailableActions(entity: Entity): ActionDefinition[] {
	const actions = entity.config.actions;
	if (!actions) return [];
	return (Object.keys(actions) as ActionId[]).map((id) => ACTIONS[id]).filter(Boolean);
}

// ═══════════════════════════════════════════════════
// ACTION REGISTRY
// ═══════════════════════════════════════════════════

export const ACTIONS: Record<ActionId, ActionDefinition> = {
	attack: {
		id: "attack",
		label: "Attack",
		icon: "⚔",
		requiresTarget: true,
		canExecute(attacker, _ctx, target) {
			if (!target) return false;
			if (!isUnit(attacker)) return false;
			if (!isEnemy(attacker, target)) return false;
			if (remainingCharges(attacker, "attack") < 1) return false;
			const cfg = getUnitActionConfig(attacker.config.type, "attack");
			if (!cfg) return false;
			if (attacker.stamina < cfg.staminaCost) return false;
			return isAdjacent(attacker, target.col, target.row);
		},
		whyDisabled(attacker, _ctx, target) {
			if (!target) return "No target";
			const cfg = getUnitActionConfig(attacker.config.type, "attack");
			if (!cfg) return "Cannot attack";
			if (remainingCharges(attacker, "attack") < 1) return "No attack charges left";
			if (attacker.stamina < cfg.staminaCost) return `Requires ${cfg.staminaCost} stamina`;
			return null;
		},
		execute(attacker, _ctx, target) {
			const cfg = getUnitActionConfig(attacker.config.type, "attack")!;
			attacker.charges.attack -= 1;
			attacker.stamina -= cfg.staminaCost;
			target!.health -= computeDamage(attacker, target!);
			return { consumed: false };
		},
	},

	formVillage: {
		id: "formVillage",
		label: "Form Village",
		description: "Settle here. Village tile yields +1 to all metrics.",
		icon: "⌂",
		requiresTarget: false,
		canExecute(e) {
			const cfg = getUnitActionConfig(e.config.type, "formVillage");
			if (!cfg) return false;
			if (remainingCharges(e, "formVillage") < 1) return false;
			if (e.stamina < cfg.staminaCost) return false;
			return true;
		},
		whyDisabled(e) {
			const cfg = getUnitActionConfig(e.config.type, "formVillage");
			if (!cfg) return "Not available";
			if (remainingCharges(e, "formVillage") < 1) return "Already used this turn";
			if (e.stamina < cfg.staminaCost) return `Requires ${cfg.staminaCost} stamina`;
			return null;
		},
		execute(e) {
			const cfg = getUnitActionConfig(e.config.type, "formVillage")!;
			e.stamina -= cfg.staminaCost;
			e.charges.formVillage -= 1;
			const village = createEntity(e.col, e.row, e.team, "village");
			return { consumed: true, newEntities: [village] };
		},
	},

	skipTurn: {
		id: "skipTurn",
		label: "Skip Turn",
		icon: "⏭",
		requiresTarget: false,
		canExecute(e) {
			return isUnit(e) && e.stamina > 0;
		},
		whyDisabled(e) {
			if (e.stamina <= 0) return "No stamina left";
			return null;
		},
		execute(e) {
			e.stamina = 0;
			return { consumed: false };
		},
	},

	trainWarrior: {
		id: "trainWarrior",
		label: "Train Warrior",
		description: "Reserves 1 pop. Accumulates resources each turn until trained.",
		icon: "⚔",
		requiresTarget: false,
		popCost: UNIT_POP_COST.warrior,
		resourceCost: UNIT_RESOURCE_COST.warrior,
		producesUnit: "warrior",
		canExecute(e, ctx) {
			if (!isBuilding(e)) return false;
			if (remainingCharges(e, "trainWarrior") < 1) return false;
			const settlement = ctx.getSettlement?.(e);
			if (!settlement) return false;
			if (settlement.currentProduction) return false;
			if (settlement.population < UNIT_POP_COST.warrior + 1) return false;
			return true;
		},
		whyDisabled(e, ctx) {
			if (!isBuilding(e)) return "Not a building";
			if (remainingCharges(e, "trainWarrior") < 1) return "Already ordered this turn";
			const settlement = ctx.getSettlement?.(e);
			if (!settlement) return "No settlement";
			if (settlement.currentProduction) return "Production in progress";
			if (settlement.population < UNIT_POP_COST.warrior + 1)
				return `Need ${UNIT_POP_COST.warrior + 1} pop`;
			return null;
		},
		execute(e, ctx) {
			e.charges.trainWarrior -= 1;
			const settlement = ctx.getSettlement?.(e);
			if (settlement) {
				settlement.population -= UNIT_POP_COST.warrior;
				const fromCache = Math.min(settlement.resourceCache, UNIT_RESOURCE_COST.warrior);
				settlement.resourceCache -= fromCache;
				settlement.currentProduction = {
					unitType: "warrior",
					resourceProgress: fromCache,
					resourceCost: UNIT_RESOURCE_COST.warrior,
					popCost: UNIT_POP_COST.warrior,
				};
			}
			return { consumed: false };
		},
	},

	buildFarm: {
		id: "buildFarm",
		label: "Build Farm",
		description: "Place on grassland. +1 growth on that tile.",
		icon: "⌾",
		requiresTarget: false,
		requiresPlacement: true,
		resourceCost: UNIT_RESOURCE_COST.farm,
		producesUnit: "farm",
		canExecute(e, ctx) {
			if (!isBuilding(e)) return false;
			if (remainingCharges(e, "buildFarm") < 1) return false;
			const settlement = ctx.getSettlement?.(e);
			if (!settlement) return false;
			if (settlement.currentProduction) return false;
			return true;
		},
		whyDisabled(e, ctx) {
			if (!isBuilding(e)) return "Not a building";
			if (remainingCharges(e, "buildFarm") < 1) return "Already ordered this turn";
			const settlement = ctx.getSettlement?.(e);
			if (!settlement) return "No settlement";
			if (settlement.currentProduction) return "Production in progress";
			return null;
		},
		execute(e) {
			e.charges.buildFarm -= 1;
			return { consumed: false };
		},
	},
};
