import type { EntityType } from "./entities";

// ═══════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════

export type GameEvent =
	| GameStarted
	| EntitySpawned
	| EntityMoved
	| AttackExecuted
	| EntityDied
	| ActionExecuted
	| TurnEnded
	| SettlementGrowth
	| ProductionStarted
	| ProductionProgressed
	| UnitProduced
	| CitizenMoved
	| PathPlanned
	| PathCancelled
	| TileExplored;

interface BaseEvent {
	turn: number;
	team: number;
	seq: number;
}

export interface GameStarted extends BaseEvent {
	type: "game_started";
	seed: number;
}

export interface EntitySpawned extends BaseEvent {
	type: "entity_spawned";
	entityId: string;
	entityType: EntityType;
	col: number;
	row: number;
}

export interface EntityMoved extends BaseEvent {
	type: "entity_moved";
	entityId: string;
	fromCol: number;
	fromRow: number;
	toCol: number;
	toRow: number;
	staminaCost: number;
}

export interface AttackExecuted extends BaseEvent {
	type: "attack_executed";
	attackerId: string;
	targetId: string;
	damage: number;
	targetHealthAfter: number;
}

export interface EntityDied extends BaseEvent {
	type: "entity_died";
	entityId: string;
	entityType: EntityType;
	col: number;
	row: number;
	killedBy: string | null;
}

export interface ActionExecuted extends BaseEvent {
	type: "action_executed";
	entityId: string;
	actionId: string;
	consumed: boolean;
	newEntityIds: string[];
}

export interface TurnEnded extends BaseEvent {
	type: "turn_ended";
	nextTeam: number;
	nextTurn: number;
}

export interface SettlementGrowth extends BaseEvent {
	type: "settlement_growth";
	villageId: string;
	oldPop: number;
	newPop: number;
	growthBucket: number;
}

export interface ProductionStarted extends BaseEvent {
	type: "production_started";
	villageId: string;
	unitType: EntityType;
	resourceCost: number;
	popCost: number;
}

export interface ProductionProgressed extends BaseEvent {
	type: "production_progressed";
	villageId: string;
	resourceAdded: number;
	progressAfter: number;
	resourceCost: number;
}

export interface UnitProduced extends BaseEvent {
	type: "unit_produced";
	villageId: string;
	entityId: string;
	entityType: EntityType;
	col: number;
	row: number;
}

export interface CitizenMoved extends BaseEvent {
	type: "citizen_moved";
	villageId: string;
	fromTile: string;
	toTile: string;
}

export interface PathPlanned extends BaseEvent {
	type: "path_planned";
	entityId: string;
	tiles: Array<{ col: number; row: number }>;
}

export interface PathCancelled extends BaseEvent {
	type: "path_cancelled";
	entityId: string;
}

export interface TileExplored extends BaseEvent {
	type: "tile_explored";
	tiles: string[];
}

type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
type GameEventInput = DistributiveOmit<GameEvent, "turn" | "team" | "seq">;

// ═══════════════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════════════

export class EventLog {
	private events: GameEvent[] = [];
	private seq = 0;
	private turn = 0;
	private team = 0;

	setTurnState(turn: number, team: number): void {
		this.turn = turn;
		this.team = team;
	}

	record(event: GameEventInput): GameEvent {
		const full = {
			...event,
			turn: this.turn,
			team: this.team,
			seq: this.seq++,
		} as GameEvent;
		this.events.push(full);
		return full;
	}

	getEvents(): readonly GameEvent[] {
		return this.events;
	}

	toJSON(): string {
		return JSON.stringify(this.events);
	}

	get length(): number {
		return this.events.length;
	}
}
