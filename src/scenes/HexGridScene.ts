import Phaser from "phaser";
import {
    COLS, ROWS, HEX_WIDTH, HEX_HEIGHT,
    getHexCenter, inBounds,
} from "../hex";
import { generateWorld, drawRivers } from "../mapgen";
import { findPath, MAX_MOVE } from "../pathfinding";
import {
    EntityType, TEAM_BLUE, TEAM_RED,
    drawTerrain, drawHillshade, drawForest,
    drawEntityIcon, drawSelection, drawHoverHighlight, drawMovePath,
} from "../sprites";

interface Entity { col: number; row: number; team: number; type: EntityType }

export class HexGridScene extends Phaser.Scene {
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private camStartX = 0;
    private camStartY = 0;

    constructor() {
        super("HexGridScene");
    }

    create() {
        // --- Generate world ---
        const world = generateWorld();
        const { biomeMap, levelMap, rivers, riverTiles, forestTiles } = world;

        // --- Draw static layers ---
        drawTerrain(this.add.graphics(), biomeMap, levelMap, ROWS, COLS);
        drawHillshade(this.add.graphics(), levelMap, ROWS, COLS);
        drawRivers(this.add.graphics(), rivers, biomeMap);
        drawForest(this.add.graphics(), forestTiles, ROWS, COLS);

        // --- Entities ---
        const entityGfx = this.add.graphics();
        const selectGfx = this.add.graphics();

        const entities: Entity[] = [];
        const entityAt = new Map<string, Entity>();

        // Find valid placement tiles
        const placeable: Array<{ col: number; row: number }> = [];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const b = biomeMap[row][col];
                if ((b === "grassland" || b === "desert") && !riverTiles.has(`${col},${row}`)) {
                    placeable.push({ col, row });
                }
            }
        }
        for (let i = placeable.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [placeable[i], placeable[j]] = [placeable[j], placeable[i]];
        }

        const bluePool = placeable.filter(t => t.row < ROWS / 2);
        const redPool = placeable.filter(t => t.row >= ROWS / 2);

        const placements: Array<{ tile: { col: number; row: number }; team: number; type: EntityType }> = [
            { tile: bluePool[0], team: TEAM_BLUE, type: "village" },
            { tile: bluePool[1], team: TEAM_BLUE, type: "worker" },
            { tile: bluePool[2], team: TEAM_BLUE, type: "warrior" },
            { tile: redPool[0], team: TEAM_RED, type: "village" },
            { tile: redPool[1], team: TEAM_RED, type: "worker" },
            { tile: redPool[2], team: TEAM_RED, type: "warrior" },
        ];

        function redrawEntities() {
            entityGfx.clear();
            for (const e of entities) {
                const { x, y } = getHexCenter(e.col, e.row);
                drawEntityIcon(entityGfx, x, y, e.team, e.type);
            }
        }

        for (const p of placements) {
            if (!p.tile) continue;
            const ent: Entity = { col: p.tile.col, row: p.tile.row, team: p.team, type: p.type };
            entities.push(ent);
            entityAt.set(`${ent.col},${ent.row}`, ent);
        }
        redrawEntities();

        // --- Selection state ---
        let selectedEntity: Entity | null = null;

        // --- Camera ---
        const gridPixelWidth = COLS * HEX_WIDTH + HEX_WIDTH / 2;
        const gridPixelHeight = ROWS * HEX_HEIGHT * 0.75 + HEX_HEIGHT * 0.25;
        this.cameras.main.setBounds(
            -HEX_WIDTH, -HEX_HEIGHT,
            gridPixelWidth + HEX_WIDTH * 2,
            gridPixelHeight + HEX_HEIGHT * 2,
        );
        this.cameras.main.centerOn(gridPixelWidth / 2, gridPixelHeight / 2);

        // --- Input ---
        this.input.setDefaultCursor("pointer");

        const hoverGfx = this.add.graphics();
        const moveLineGfx = this.add.graphics();
        let hoveredCol = -1;
        let hoveredRow = -1;

        // Convert screen coords to hex tile
        const screenToHex = (px: number, py: number) => {
            const wp = this.cameras.main.getWorldPoint(px, py);
            const approxRow = Math.round(wp.y / (HEX_HEIGHT * 0.75));
            const rowOffset = approxRow % 2 === 1 ? HEX_WIDTH / 2 : 0;
            const approxCol = Math.round((wp.x - rowOffset) / HEX_WIDTH);

            let bestCol = -1, bestRow = -1, bestDist = Infinity;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = approxRow + dr, c = approxCol + dc;
                    if (!inBounds(c, r)) continue;
                    const { x, y } = getHexCenter(c, r);
                    const dist = (wp.x - x) ** 2 + (wp.y - y) ** 2;
                    if (dist < bestDist) { bestDist = dist; bestCol = c; bestRow = r; }
                }
            }
            return { col: bestCol, row: bestRow };
        };

        const updateHover = (col: number, row: number) => {
            hoverGfx.clear();
            moveLineGfx.clear();
            if (col < 0) return;

            drawHoverHighlight(hoverGfx, col, row);

            // Move path preview
            if (selectedEntity && (col !== selectedEntity.col || row !== selectedEntity.row)) {
                const result = findPath(
                    selectedEntity.col, selectedEntity.row,
                    col, row,
                    biomeMap, levelMap, riverTiles, forestTiles,
                );
                if (result && result.tiles.length > 1) {
                    drawMovePath(moveLineGfx, result.tiles, result.costs, MAX_MOVE, result.reachable);
                }
            }
        };

        // Pointer move: hover + drag
        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX);
                this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY);
                hoverGfx.clear();
                moveLineGfx.clear();
                hoveredCol = -1;
                return;
            }

            const { col, row } = screenToHex(pointer.x, pointer.y);
            if (col !== hoveredCol || row !== hoveredRow) {
                hoveredCol = col;
                hoveredRow = row;
                updateHover(col, row);
            }
        });

        // Pointer down: start drag
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.dragStartX = pointer.x;
            this.dragStartY = pointer.y;
            this.camStartX = this.cameras.main.scrollX;
            this.camStartY = this.cameras.main.scrollY;
        });

        // Pointer up: end drag or click
        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            const wasDrag = Math.abs(pointer.x - this.dragStartX) > 4
                         || Math.abs(pointer.y - this.dragStartY) > 4;
            this.isDragging = false;
            if (wasDrag) return;

            if (hoveredCol < 0) return;
            const ent = entityAt.get(`${hoveredCol},${hoveredRow}`);

            // Move selected entity
            if (selectedEntity && !ent && (hoveredCol !== selectedEntity.col || hoveredRow !== selectedEntity.row)) {
                const result = findPath(
                    selectedEntity.col, selectedEntity.row,
                    hoveredCol, hoveredRow,
                    biomeMap, levelMap, riverTiles, forestTiles,
                );
                if (result && result.reachable) {
                    entityAt.delete(`${selectedEntity.col},${selectedEntity.row}`);
                    selectedEntity.col = hoveredCol;
                    selectedEntity.row = hoveredRow;
                    entityAt.set(`${hoveredCol},${hoveredRow}`, selectedEntity);
                    redrawEntities();
                    selectedEntity = null;
                    selectGfx.clear();
                    moveLineGfx.clear();
                    return;
                }
            }

            // Toggle selection
            if (ent && (ent.type === "worker" || ent.type === "warrior")) {
                selectedEntity = selectedEntity === ent ? null : ent;
            } else {
                selectedEntity = null;
            }

            selectGfx.clear();
            if (selectedEntity) {
                drawSelection(selectGfx, selectedEntity.col, selectedEntity.row);
            }
        });

        // Scroll to zoom
        this.input.on("wheel", (
            pointer: Phaser.Input.Pointer, _g: Phaser.GameObjects.GameObject[],
            _dx: number, deltaY: number,
        ) => {
            const cam = this.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.5, 3));

            const { col, row } = screenToHex(pointer.x, pointer.y);
            hoveredCol = col;
            hoveredRow = row;
            updateHover(col, row);
        });
    }
}
