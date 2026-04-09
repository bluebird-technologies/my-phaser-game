/**
 * combat.ts — Combat logic, adjacency checks, move-and-attack planning.
 *
 * Pure logic — no Phaser dependency, no rendering.
 */

import { BiomeType, getNeighbors } from "./hex";
import { Entity, isUnit, isEnemy } from "./entities";
import { findPath, PathResult } from "./pathfinding";

// --- Constants ---
export const ATTACK_STAMINA_COST = 1;

// --- Adjacency ---
export function isAdjacent(entity: Entity, col: number, row: number): boolean {
	return getNeighbors(entity.col, entity.row).some((n) => n.col === col && n.row === row);
}

// --- Can attack an adjacent enemy? ---
export function canAttackAdjacent(attacker: Entity, target: Entity): boolean {
	return (
		attacker.attacks >= 1 &&
		attacker.stamina >= ATTACK_STAMINA_COST &&
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
): MoveAttackPlan | null {
	if (attacker.attacks < 1 || !isEnemy(attacker, target) || !isUnit(attacker)) return null;

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
		);
		if (!result) continue;
		if (Math.floor(attacker.stamina - result.totalCost - ATTACK_STAMINA_COST) < 0) continue;
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
	attacker.attacks -= 1;
	attacker.stamina -= ATTACK_STAMINA_COST;
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
