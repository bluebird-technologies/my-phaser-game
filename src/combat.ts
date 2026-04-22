/**
 * combat.ts — Combat logic, adjacency checks, move-and-attack planning.
 *
 * Pure logic — no Phaser dependency, no rendering.
 *
 * Attack uses the generic action system: cost and charges are defined
 * per-unit in EntityConfig.actions.attack. This file intentionally does
 * NOT import from actions.ts to avoid a circular dependency (actions.ts
 * imports isAdjacent and computeDamage from here).
 */

import { BiomeType, getNeighbors } from "./hex";
import { Entity, isUnit, isEnemy } from "./entities";
import { findPath, PathResult } from "./pathfinding";

// --- Adjacency ---
export function isAdjacent(entity: Entity, col: number, row: number): boolean {
	return getNeighbors(entity.col, entity.row).some((n) => n.col === col && n.row === row);
}

// --- Attack cost / charge helpers (inline to avoid circular import) ---
function attackStaminaCost(entity: Entity): number {
	return entity.config.actions?.attack?.staminaCost ?? Infinity;
}

function attackChargesLeft(entity: Entity): number {
	return entity.charges.attack ?? 0;
}

// --- Can attack an adjacent enemy? ---
export function canAttackAdjacent(attacker: Entity, target: Entity): boolean {
	return (
		attackChargesLeft(attacker) >= 1 &&
		attacker.stamina >= attackStaminaCost(attacker) &&
		isEnemy(attacker, target) &&
		isUnit(attacker) &&
		isAdjacent(attacker, target.col, target.row)
	);
}

// --- Move-and-attack planning ---
export interface MoveAttackPlan {
	path: PathResult;
	neighbor: { col: number; row: number };
}

/**
 * Find the cheapest path to a tile adjacent to `target` such that the
 * attacker has enough stamina left for both the move and the attack.
 */
export function findMoveAndAttackPath(
	attacker: Entity,
	target: Entity,
	biomeMap: BiomeType[][],
	levelMap: number[][],
	riverTiles: Set<string>,
	forestTiles: Set<string>,
	entityAt: Map<string, Entity>,
	riverFlow?: Map<string, Set<string>>,
): MoveAttackPlan | null {
	if (attackChargesLeft(attacker) < 1 || !isEnemy(attacker, target) || !isUnit(attacker)) {
		return null;
	}
	const atkCost = attackStaminaCost(attacker);

	const adjTiles = getNeighbors(target.col, target.row).filter((n) => {
		if (n.col === attacker.col && n.row === attacker.row) return false;
		const b = biomeMap[n.row][n.col];
		if (b === "mountain" || b === "lake") return false;
		if (entityAt.has(`${n.col},${n.row}`)) return false;
		return true;
	});

	let bestPath: PathResult | null = null;
	let bestNeighbor: { col: number; row: number } | null = null;

	for (const adj of adjTiles) {
		const result = findPath(
			attacker.col,
			attacker.row,
			adj.col,
			adj.row,
			biomeMap,
			levelMap,
			riverTiles,
			forestTiles,
			riverFlow,
		);
		if (!result) continue;
		if (Math.floor(attacker.stamina - result.totalCost - atkCost) < 0) continue;
		if (!bestPath || result.totalCost < bestPath.totalCost) {
			bestPath = result;
			bestNeighbor = adj;
		}
	}

	return bestPath && bestNeighbor ? { path: bestPath, neighbor: bestNeighbor } : null;
}

// --- Damage formula ---
export function computeDamage(attacker: Entity, target: Entity, techBonus = 0): number {
	return Math.max(1, attacker.config.attackPower - target.config.defense + techBonus);
}

// --- Execute attack (mutates entities) ---
export function executeAttack(attacker: Entity, target: Entity, techBonus = 0): boolean {
	attacker.charges.attack -= 1;
	attacker.stamina -= attackStaminaCost(attacker);
	target.health -= computeDamage(attacker, target, techBonus);
	return target.health <= 0;
}

// --- Execute move (mutates entity) ---
export function executeMove(
	entity: Entity,
	toCol: number,
	toRow: number,
	moveCost: number,
	entityAt: Map<string, Entity>,
) {
	entityAt.delete(`${entity.col},${entity.row}`);
	entity.col = toCol;
	entity.row = toRow;
	entity.stamina -= moveCost;
	entityAt.set(`${toCol},${toRow}`, entity);
}
