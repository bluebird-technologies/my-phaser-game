/**
 * PhaserShowcase.ts — Visual catalog of all in-game tiles, entities, and resources.
 *
 * Layout: row-based. Each row has:
 *   - Section header (top)
 *   - Main item label (left)
 *   - Main visual + variants (center)
 *   - Real game UI panel (right)
 *
 * UI panels are real Solid components, mounted via Phaser DOM elements
 * so they pan and zoom with the camera.
 */

import Phaser from "phaser";
import { drawTerrain, drawForest, drawResources, drawEntityIcon } from "../sprites";
import { HEX_WIDTH, BiomeType } from "../hex";
import {
	SpecialResourceId,
	SPECIAL_RESOURCES,
	SpecialResourceConfig,
	BIOME_YIELDS,
	RIVER_BONUS,
	FOREST_BONUS,
} from "../economy";
import { createEntity, TEAM_BLUE, TEAM_RED, ENTITY_CONFIGS, EntityType, Entity } from "../entities";
import { ui } from "../theme";
import { TileInfo } from "../ui/ResourceCard";

interface CellConfig {
	label?: string;
	biome: BiomeType;
	level?: number;
	forest?: boolean;
	river?: boolean;
	resource?: SpecialResourceId;
	entity?: { type: EntityType; team: number };
}

/** Renderers provided externally that produce a DOM element for a Solid component. */
export interface UIRenderers {
	renderActionsPanel: (
		entity: Entity | null,
		target: Entity | null,
		tile: TileInfo | null,
	) => HTMLElement;
}

const CELL_W = 100;
const ROW_HEIGHT = 200;
const MAX_VARIANTS = 5;
const MARGIN_X = 30;
const MAIN_LABEL_W = 160;
const VARIANTS_X = MARGIN_X + MAIN_LABEL_W;
const PANEL_X = VARIANTS_X + MAX_VARIANTS * CELL_W + 30;

export class ShowcaseScene extends Phaser.Scene {
	private isDragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private camStartX = 0;
	private camStartY = 0;
	private renderers!: UIRenderers;

	constructor() {
		super("ShowcaseScene");
	}

	init(data: { renderers: UIRenderers }) {
		this.renderers = data.renderers;
	}

	// ─── Drawing primitives ───

	private drawCell(cx: number, cy: number, config: CellConfig) {
		const gfx = this.add.graphics({ x: cx, y: cy - 8 });

		const biomeMap: BiomeType[][] = [[config.biome]];
		const levelMap: number[][] = [[config.level ?? 2]];
		drawTerrain(gfx, biomeMap, levelMap, 1, 1);

		if (config.forest) {
			drawForest(gfx, new Set(["0,0"]), 1, 1);
		}

		if (config.river) {
			gfx.lineStyle(3, ui.river, 0.9);
			gfx.beginPath();
			gfx.moveTo(-HEX_WIDTH * 0.5, -4);
			gfx.lineTo(-HEX_WIDTH * 0.2, 2);
			gfx.lineTo(HEX_WIDTH * 0.2, -2);
			gfx.lineTo(HEX_WIDTH * 0.5, 4);
			gfx.strokePath();
		}

		if (config.resource) {
			drawResources(gfx, new Map([["0,0", config.resource]]));
		}

		if (config.entity) {
			drawEntityIcon(gfx, 0, 0, config.entity.team, config.entity.type);
		}

		if (config.label) {
			this.add
				.text(cx, cy + 36, config.label, {
					fontSize: "10px",
					color: "#888",
					align: "center",
				})
				.setOrigin(0.5, 0);
		}
	}

	private drawSectionHeader(y: number, title: string): number {
		this.add.text(MARGIN_X, y, title, {
			fontSize: "16px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		return y + 28;
	}

	private drawMainLabel(x: number, y: number, name: string, sub?: string) {
		this.add.text(x, y - 10, name, {
			fontSize: "14px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		if (sub) {
			this.add.text(x, y + 8, sub, {
				fontSize: "11px",
				color: "#888",
			});
		}
	}

	private drawVariants(startX: number, cy: number, cells: CellConfig[]) {
		cells.forEach((cell, i) => {
			const cx = startX + CELL_W / 2 + i * CELL_W;
			this.drawCell(cx, cy, cell);
		});
	}

	private addPanel(
		y: number,
		entity: Entity | null,
		target: Entity | null = null,
		tile: TileInfo | null = null,
	) {
		const el = this.renderers.renderActionsPanel(entity, target, tile);
		this.add.dom(PANEL_X, y + ROW_HEIGHT / 2, el).setOrigin(0, 0.5);
	}

	private rowDivider(y: number) {
		const div = this.add.graphics();
		div.lineStyle(1, 0xffffff, 0.05);
		div.beginPath();
		div.moveTo(MARGIN_X, y);
		div.lineTo(MARGIN_X + 1600, y);
		div.strokePath();
	}

	// ─── Row builders ───

	private entityRow(y: number, type: EntityType): number {
		const cfg = ENTITY_CONFIGS[type];
		const cy = y + ROW_HEIGHT / 2;

		this.drawMainLabel(MARGIN_X, cy, cfg.label, cfg.category);

		this.drawVariants(VARIANTS_X, cy, [
			{ biome: "grassland", entity: { type, team: TEAM_BLUE }, label: "Blue" },
			{ biome: "grassland", entity: { type, team: TEAM_RED }, label: "Red" },
			{ biome: "desert", entity: { type, team: TEAM_BLUE }, label: "on Desert" },
			{
				biome: "grassland",
				forest: true,
				entity: { type, team: TEAM_BLUE },
				label: "in Forest",
			},
		]);

		const ent = createEntity(0, 0, TEAM_BLUE, type);
		this.addPanel(y, ent);

		this.rowDivider(y + ROW_HEIGHT);
		return y + ROW_HEIGHT;
	}

	private entityCombatRow(y: number): number {
		const cy = y + ROW_HEIGHT / 2;

		this.drawMainLabel(MARGIN_X, cy, "Combat", "attacker vs target");

		this.drawVariants(VARIANTS_X, cy, [
			{ biome: "grassland", entity: { type: "warrior", team: TEAM_BLUE }, label: "Attacker" },
			{ biome: "grassland", entity: { type: "warrior", team: TEAM_RED }, label: "Target" },
		]);

		const attacker = createEntity(0, 0, TEAM_BLUE, "warrior");
		attacker.health = 7;
		attacker.stamina = 2;
		attacker.attacks = 1;
		const target = createEntity(0, 0, TEAM_RED, "worker");
		target.health = 4;
		this.addPanel(y, attacker, target);

		this.rowDivider(y + ROW_HEIGHT);
		return y + ROW_HEIGHT;
	}

	private biomeRow(y: number, biome: BiomeType): number {
		const cy = y + ROW_HEIGHT / 2;
		const label = biome.charAt(0).toUpperCase() + biome.slice(1);

		this.drawMainLabel(MARGIN_X, cy, label, "biome");

		const variants: CellConfig[] = [
			{ biome, label: "base" },
			{ biome, level: 0, label: "lvl 0" },
			{ biome, level: 4, label: "lvl 4" },
		];
		if (biome === "grassland") {
			variants.push({ biome, forest: true, label: "+ forest" });
			variants.push({ biome, river: true, label: "+ river" });
		} else if (biome === "desert") {
			variants.push({ biome, river: true, label: "+ river" });
		}
		this.drawVariants(VARIANTS_X, cy, variants);

		const tile: TileInfo = {
			biome,
			baseYield: { ...BIOME_YIELDS[biome] },
			featureYield: null,
			featureLabel: null,
			resource: null,
		};
		this.addPanel(y, null, null, tile);

		this.rowDivider(y + ROW_HEIGHT);
		return y + ROW_HEIGHT;
	}

	private biomeFeatureRow(y: number, biome: BiomeType, feature: "forest" | "river"): number {
		const cy = y + ROW_HEIGHT / 2;
		const featureLabel = feature === "forest" ? "Forest" : "River";
		const label = `${biome.charAt(0).toUpperCase() + biome.slice(1)} + ${featureLabel}`;

		this.drawMainLabel(MARGIN_X, cy, label, "feature");

		this.drawVariants(VARIANTS_X, cy, [
			{ biome, [feature]: true, label: featureLabel.toLowerCase() } as CellConfig,
		]);

		const tile: TileInfo = {
			biome,
			baseYield: { ...BIOME_YIELDS[biome] },
			featureYield: feature === "forest" ? { ...FOREST_BONUS } : { ...RIVER_BONUS },
			featureLabel,
			resource: null,
		};
		this.addPanel(y, null, null, tile);

		this.rowDivider(y + ROW_HEIGHT);
		return y + ROW_HEIGHT;
	}

	private resourceRow(y: number, res: SpecialResourceConfig): number {
		const cy = y + ROW_HEIGHT / 2;

		this.drawMainLabel(MARGIN_X, cy, res.label, "resource");

		const variants: CellConfig[] = res.biomes.map((biome) => {
			const cell: CellConfig = { biome, resource: res.id, label: biome };
			if (res.requiresForest) cell.forest = true;
			if (res.requiresRiver) cell.river = true;
			return cell;
		});
		this.drawVariants(VARIANTS_X, cy, variants);

		const primaryBiome = res.biomes[0];
		const tile: TileInfo = {
			biome: primaryBiome,
			baseYield: { ...BIOME_YIELDS[primaryBiome] },
			featureYield: res.requiresForest
				? { ...FOREST_BONUS }
				: res.requiresRiver
					? { ...RIVER_BONUS }
					: null,
			featureLabel: res.requiresForest ? "Forest" : res.requiresRiver ? "River" : null,
			resource: res,
		};
		this.addPanel(y, null, null, tile);

		this.rowDivider(y + ROW_HEIGHT);
		return y + ROW_HEIGHT;
	}

	create() {
		let y = 30;

		// ─── Entities ───
		y = this.drawSectionHeader(y, "ENTITIES");
		for (const type of ["village", "worker", "warrior"] as EntityType[]) {
			y = this.entityRow(y, type);
		}
		y = this.entityCombatRow(y);
		y += 20;

		// ─── Biomes ───
		y = this.drawSectionHeader(y, "BIOMES");
		for (const biome of ["grassland", "desert", "lake", "mountain"] as BiomeType[]) {
			y = this.biomeRow(y, biome);
		}
		y = this.biomeFeatureRow(y, "grassland", "forest");
		y = this.biomeFeatureRow(y, "grassland", "river");
		y = this.biomeFeatureRow(y, "desert", "river");
		y += 20;

		// ─── Special Resources ───
		y = this.drawSectionHeader(y, "SPECIAL RESOURCES");
		for (const res of Object.values(SPECIAL_RESOURCES)) {
			y = this.resourceRow(y, res);
		}

		// ─── Camera bounds + pan/zoom ───
		const contentW = PANEL_X + 280 + MARGIN_X;
		const contentH = y + 60;
		this.cameras.main.setBounds(-100, -100, contentW + 200, contentH + 200);

		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			this.isDragging = true;
			this.dragStartX = pointer.x;
			this.dragStartY = pointer.y;
			this.camStartX = this.cameras.main.scrollX;
			this.camStartY = this.cameras.main.scrollY;
		});

		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (!this.isDragging) return;
			this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX);
			this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY);
		});

		this.input.on("pointerup", () => {
			this.isDragging = false;
		});

		this.input.on(
			"wheel",
			(
				_pointer: Phaser.Input.Pointer,
				_g: Phaser.GameObjects.GameObject[],
				_dx: number,
				deltaY: number,
			) => {
				this.cameras.main.setZoom(
					Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, 0.4, 3),
				);
			},
		);
	}
}
