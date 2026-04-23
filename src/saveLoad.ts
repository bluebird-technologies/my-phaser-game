import type { BiomeType } from "./hex";
import type { Entity, EntityType } from "./entities";
import { ENTITY_CONFIGS, getNextEntityId, setNextEntityId } from "./entities";
import type { SettlementState, ProductionOrder, RealmState, SpecialResourceId } from "./economy";
import type { ActionId } from "./actions";
import type { GameEvent } from "./eventLog";
import type { River } from "./mapgen";

// ═══════════════════════════════════════════════════
// SERIALIZED TYPES
// ═══════════════════════════════════════════════════

interface SerializedEntity {
	id: string;
	type: EntityType;
	col: number;
	row: number;
	team: number;
	health: number;
	stamina: number;
	charges: Record<string, number>;
}

interface SerializedSettlement {
	villageId: string;
	population: number;
	growthBucket: number;
	citizenTiles: Record<string, number>;
	manuallyClaimedTiles: string[];
	activePolicies: string[];
	currentProduction: ProductionOrder | null;
	resourceCache: number;
}

interface SerializedRealm {
	team: number;
	knowledge: number;
	unlockedTechs: string[];
	unitsLost: number;
	activePolicies: string[];
}

export interface SaveData {
	version: number;
	timestamp: number;
	name: string;
	turnNumber: number;
	activeTeam: number;
	nextEntityId: number;

	biomeMap: BiomeType[][];
	levelMap: number[][];
	rivers: River[];
	riverTiles: string[];
	riverFlow: Record<string, string[]>;
	forestTiles: string[];
	resourceMap: Record<string, SpecialResourceId>;

	entities: SerializedEntity[];
	plannedPaths: Record<string, Array<{ col: number; row: number }>>;

	settlements: SerializedSettlement[];
	realms: SerializedRealm[];

	exploredByTeam: Record<string, string[]>;

	eventLog: GameEvent[];
}

// ═══════════════════════════════════════════════════
// SERIALIZE
// ═══════════════════════════════════════════════════

export interface GameStateSnapshot {
	turnNumber: number;
	activeTeam: number;
	biomeMap: BiomeType[][];
	levelMap: number[][];
	rivers: River[];
	riverTiles: Set<string>;
	riverFlow: Map<string, Set<string>>;
	forestTiles: Set<string>;
	resourceMap: Map<string, SpecialResourceId>;
	entities: Entity[];
	plannedPaths: Map<Entity, Array<{ col: number; row: number }>>;
	settlements: Map<Entity, SettlementState>;
	realmsByTeam: Map<number, RealmState>;
	exploredByTeam: Map<number, Set<string>>;
	eventLog: GameEvent[];
}

export function serialize(state: GameStateSnapshot, name: string): SaveData {
	const entityById = new Map<Entity, string>();
	for (const e of state.entities) entityById.set(e, e.id);

	const entities: SerializedEntity[] = state.entities.map((e) => ({
		id: e.id,
		type: e.config.type,
		col: e.col,
		row: e.row,
		team: e.team,
		health: e.health,
		stamina: e.stamina,
		charges: { ...e.charges },
	}));

	const plannedPaths: Record<string, Array<{ col: number; row: number }>> = {};
	for (const [ent, path] of state.plannedPaths) {
		plannedPaths[ent.id] = path;
	}

	const settlements: SerializedSettlement[] = [];
	for (const [village, s] of state.settlements) {
		const citizenTiles: Record<string, number> = {};
		for (const [key, count] of s.citizenTiles) citizenTiles[key] = count;
		settlements.push({
			villageId: village.id,
			population: s.population,
			growthBucket: s.growthBucket,
			citizenTiles,
			manuallyClaimedTiles: [...s.manuallyClaimedTiles],
			activePolicies: [...s.activePolicies],
			currentProduction: s.currentProduction ? { ...s.currentProduction } : null,
			resourceCache: s.resourceCache,
		});
	}

	const realms: SerializedRealm[] = [];
	for (const [team, r] of state.realmsByTeam) {
		realms.push({
			team,
			knowledge: r.knowledge,
			unlockedTechs: [...r.unlockedTechs],
			unitsLost: r.unitsLost,
			activePolicies: [...r.activePolicies],
		});
	}

	const riverFlow: Record<string, string[]> = {};
	for (const [key, targets] of state.riverFlow) {
		riverFlow[key] = [...targets];
	}

	const exploredByTeam: Record<string, string[]> = {};
	for (const [team, tiles] of state.exploredByTeam) {
		exploredByTeam[String(team)] = [...tiles];
	}

	return {
		version: 1,
		timestamp: Date.now(),
		name,
		turnNumber: state.turnNumber,
		activeTeam: state.activeTeam,
		nextEntityId: getNextEntityId(),
		biomeMap: state.biomeMap,
		levelMap: state.levelMap,
		rivers: state.rivers,
		riverTiles: [...state.riverTiles],
		riverFlow,
		forestTiles: [...state.forestTiles],
		resourceMap: Object.fromEntries(state.resourceMap),
		entities,
		plannedPaths,
		settlements,
		realms,
		exploredByTeam,
		eventLog: state.eventLog,
	};
}

// ═══════════════════════════════════════════════════
// DESERIALIZE
// ═══════════════════════════════════════════════════

export interface LoadedGameState {
	turnNumber: number;
	activeTeam: number;
	biomeMap: BiomeType[][];
	levelMap: number[][];
	rivers: River[];
	riverTiles: Set<string>;
	riverFlow: Map<string, Set<string>>;
	forestTiles: Set<string>;
	resourceMap: Map<string, SpecialResourceId>;
	entities: Entity[];
	plannedPaths: Map<Entity, Array<{ col: number; row: number }>>;
	settlements: Map<Entity, SettlementState>;
	realmsByTeam: Map<number, RealmState>;
	exploredByTeam: Map<number, Set<string>>;
	eventLog: GameEvent[];
}

export function deserialize(data: SaveData): LoadedGameState {
	setNextEntityId(data.nextEntityId);

	const entities: Entity[] = data.entities.map((se) => ({
		id: se.id,
		config: ENTITY_CONFIGS[se.type],
		col: se.col,
		row: se.row,
		team: se.team,
		health: se.health,
		stamina: se.stamina,
		charges: se.charges as Record<ActionId, number>,
	}));

	const entityById = new Map<string, Entity>();
	for (const e of entities) entityById.set(e.id, e);

	const plannedPaths = new Map<Entity, Array<{ col: number; row: number }>>();
	for (const [id, path] of Object.entries(data.plannedPaths)) {
		const ent = entityById.get(id);
		if (ent) plannedPaths.set(ent, path);
	}

	const settlements = new Map<Entity, SettlementState>();
	for (const ss of data.settlements) {
		const village = entityById.get(ss.villageId);
		if (!village) continue;
		const citizenTiles = new Map<string, number>();
		for (const [key, count] of Object.entries(ss.citizenTiles)) {
			citizenTiles.set(key, count);
		}
		settlements.set(village, {
			population: ss.population,
			growthBucket: ss.growthBucket,
			citizenTiles,
			manuallyClaimedTiles: new Set(ss.manuallyClaimedTiles),
			activePolicies: [...ss.activePolicies],
			currentProduction: ss.currentProduction ? { ...ss.currentProduction } : null,
			resourceCache: ss.resourceCache,
		});
	}

	const realmsByTeam = new Map<number, RealmState>();
	for (const sr of data.realms) {
		realmsByTeam.set(sr.team, {
			knowledge: sr.knowledge,
			unlockedTechs: new Set(sr.unlockedTechs) as RealmState["unlockedTechs"],
			unitsLost: sr.unitsLost,
			activePolicies: [...sr.activePolicies],
		});
	}

	const riverTiles = new Set(data.riverTiles);
	const riverFlow = new Map<string, Set<string>>();
	for (const [key, targets] of Object.entries(data.riverFlow)) {
		riverFlow.set(key, new Set(targets));
	}
	const forestTiles = new Set(data.forestTiles);
	const resourceMap = new Map<string, SpecialResourceId>(
		Object.entries(data.resourceMap) as Array<[string, SpecialResourceId]>,
	);

	const exploredByTeam = new Map<number, Set<string>>();
	for (const [teamStr, tiles] of Object.entries(data.exploredByTeam)) {
		exploredByTeam.set(Number(teamStr), new Set(tiles));
	}

	return {
		turnNumber: data.turnNumber,
		activeTeam: data.activeTeam,
		biomeMap: data.biomeMap,
		levelMap: data.levelMap,
		rivers: data.rivers,
		riverTiles,
		riverFlow,
		forestTiles,
		resourceMap,
		entities,
		plannedPaths,
		settlements,
		realmsByTeam,
		exploredByTeam,
		eventLog: data.eventLog,
	};
}

// ═══════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════

const STORAGE_PREFIX = "kulturas_save_";

export function saveGame(name: string, state: GameStateSnapshot): void {
	const data = serialize(state, name);
	localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data));
}

export interface SaveEntry {
	name: string;
	timestamp: number;
	turnNumber: number;
}

export function listSaves(): SaveEntry[] {
	const entries: SaveEntry[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(STORAGE_PREFIX)) continue;
		try {
			const raw = localStorage.getItem(key);
			if (!raw) continue;
			const data = JSON.parse(raw) as SaveData;
			entries.push({
				name: data.name,
				timestamp: data.timestamp,
				turnNumber: data.turnNumber,
			});
		} catch {
			// skip corrupt entries
		}
	}
	entries.sort((a, b) => b.timestamp - a.timestamp);
	return entries;
}

export function loadSave(name: string): SaveData | null {
	const raw = localStorage.getItem(STORAGE_PREFIX + name);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SaveData;
	} catch {
		return null;
	}
}

export function deleteSave(name: string): void {
	localStorage.removeItem(STORAGE_PREFIX + name);
}
