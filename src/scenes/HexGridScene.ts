import Phaser from "phaser";
import { createNoise2D } from "simplex-noise";

// --- Hex layout constants (pointy-top, odd-r offset) ---
const HEX_SIZE = 20;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

const COLS = 64;
const ROWS = 48; // ~3072 tiles, 16:9 aspect ratio

// --- Biome definitions ---
const BIOME_COLORS = {
    mountain:  0x8d99ae,
    grassland: 0x588157,
    lake:      0x219ebc,
    desert:    0xe9c46a,
} as const;

type BiomeType = keyof typeof BIOME_COLORS;

// --- Hex neighbor math (odd-r offset) ---
// Directions: 0=NE, 1=E, 2=SE, 3=SW, 4=W, 5=NW
const NEIGHBORS_EVEN = [[0,-1],[1,0],[0,1],[-1,1],[-1,0],[-1,-1]];
const NEIGHBORS_ODD  = [[1,-1],[1,0],[1,1],[0,1],[-1,0],[0,-1]];

function getNeighborOffsets(row: number) {
    return row % 2 === 0 ? NEIGHBORS_EVEN : NEIGHBORS_ODD;
}

function inBounds(col: number, row: number) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

function getNeighbors(col: number, row: number) {
    const offsets = getNeighborOffsets(row);
    const result: Array<{ col: number; row: number; dir: number }> = [];
    for (let dir = 0; dir < 6; dir++) {
        const nc = col + offsets[dir][0];
        const nr = row + offsets[dir][1];
        if (inBounds(nc, nr)) result.push({ col: nc, row: nr, dir });
    }
    return result;
}

function directionTo(fromCol: number, fromRow: number, toCol: number, toRow: number): number {
    const offsets = getNeighborOffsets(fromRow);
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    for (let dir = 0; dir < 6; dir++) {
        if (offsets[dir][0] === dc && offsets[dir][1] === dr) return dir;
    }
    return -1;
}

// --- Noise helpers ---
function fbm(
    noise: (x: number, y: number) => number,
    x: number, y: number,
    octaves: number, lacunarity: number, gain: number,
): number {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise(x * frequency, y * frequency);
        max += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }
    return value / max;
}

// --- Hex geometry ---
function getHexCenter(col: number, row: number) {
    return {
        x: col * HEX_WIDTH + (row % 2 === 1 ? HEX_WIDTH / 2 : 0),
        y: row * HEX_HEIGHT * 0.75,
    };
}

function getHexPoints(cx: number, cy: number): Phaser.Geom.Point[] {
    const points: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        points.push(new Phaser.Geom.Point(
            cx + HEX_SIZE * Math.cos(angle),
            cy + HEX_SIZE * Math.sin(angle),
        ));
    }
    return points;
}

// Midpoint of the edge facing a given neighbor direction
function edgeMidpoint(cx: number, cy: number, dir: number) {
    const v1 = (dir + 5) % 6;
    const v2 = dir;
    const a1 = (Math.PI / 180) * (60 * v1 - 30);
    const a2 = (Math.PI / 180) * (60 * v2 - 30);
    return {
        x: cx + HEX_SIZE * (Math.cos(a1) + Math.cos(a2)) / 2,
        y: cy + HEX_SIZE * (Math.sin(a1) + Math.sin(a2)) / 2,
    };
}

// --- Biome & elevation classification ---
function classifyBiome(elevation: number, moisture: number): BiomeType {
    if (elevation > 0.45) return "mountain";
    if (elevation < -0.25) return "lake";
    if (moisture < -0.1) return "desert";
    return "grassland";
}

// Derive discrete elevation level from the continuous noise value
//   lake = 0, grassland/desert = 1-3, mountain = 4
function elevationLevel(biome: BiomeType, elevation: number): number {
    if (biome === "lake") return 0;
    if (biome === "mountain") return 4;
    // Map the grassland/desert range (-0.25 .. 0.45) into levels 1-3
    const t = (elevation + 0.25) / 0.7; // normalize to 0..1
    return 1 + Math.min(2, Math.floor(t * 3));  // 1, 2, or 3
}

// Brightness multiplier per elevation level — higher = lighter
const LEVEL_BRIGHTNESS: Record<number, number> = {
    0: 1.0,   // lake — unchanged
    1: 0.82,
    2: 0.95,
    3: 1.10,
    4: 1.0,   // mountain — unchanged
};

function adjustBrightness(color: number, factor: number): number {
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const r = clamp(Math.floor(((color >> 16) & 0xff) * factor));
    const g = clamp(Math.floor(((color >> 8) & 0xff) * factor));
    const b = clamp(Math.floor((color & 0xff) * factor));
    return (r << 16) | (g << 8) | b;
}

function varyColor(base: number, amount: number): number {
    const r = ((base >> 16) & 0xff) + Math.floor((Math.random() - 0.5) * amount);
    const g = ((base >> 8) & 0xff) + Math.floor((Math.random() - 0.5) * amount);
    const b = (base & 0xff) + Math.floor((Math.random() - 0.5) * amount);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

// --- River generation ---
type RiverPath = Array<{ col: number; row: number }>;

function generateRivers(biomeMap: BiomeType[][], elevMap: number[][]): RiverPath[] {
    const rivers: RiverPath[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;

    // Find grassland/desert tiles adjacent to a lake — potential river mouths
    interface Mouth { col: number; row: number; lakeDir: number }
    const mouths: Mouth[] = [];
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const b = biomeMap[row][col];
            if (b !== "grassland" && b !== "desert") continue;
            for (const n of getNeighbors(col, row)) {
                if (biomeMap[n.row][n.col] === "lake") {
                    mouths.push({ col, row, lakeDir: n.dir });
                    break;
                }
            }
        }
    }

    // Shuffle mouths
    for (let i = mouths.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mouths[i], mouths[j]] = [mouths[j], mouths[i]];
    }

    const maxRivers = Math.min(8, mouths.length);

    for (const mouth of mouths) {
        if (rivers.length >= maxRivers) break;
        if (used.has(key(mouth.col, mouth.row))) continue;

        // Trace upstream from mouth following increasing elevation
        const path: RiverPath = [{ col: mouth.col, row: mouth.row }];
        used.add(key(mouth.col, mouth.row));

        let cur = { col: mouth.col, row: mouth.row };
        const maxLen = 6 + Math.floor(Math.random() * 12);

        for (let step = 0; step < maxLen; step++) {
            const candidates = getNeighbors(cur.col, cur.row).filter(n => {
                if (used.has(key(n.col, n.row))) return false;
                const b = biomeMap[n.row][n.col];
                if (b !== "grassland" && b !== "desert") return false;
                // Allow slight downhill to avoid getting stuck
                return elevMap[n.row][n.col] >= elevMap[cur.row][cur.col] - 0.05;
            });

            if (candidates.length === 0) break;

            // Prefer higher elevation with some randomness
            candidates.sort((a, b) => elevMap[b.row][b.col] - elevMap[a.row][a.col]);
            const pick = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];

            path.push({ col: pick.col, row: pick.row });
            used.add(key(pick.col, pick.row));
            cur = pick;
        }

        if (path.length >= 3) {
            // Reverse: path now goes source → … → mouth
            path.reverse();
            rivers.push(path);
        }
    }

    return rivers;
}

// --- Draw rivers ---
function drawRivers(
    graphics: Phaser.GameObjects.Graphics,
    rivers: RiverPath[],
    biomeMap: BiomeType[][],
) {
    graphics.lineStyle(3, 0x0077b6, 0.9);

    for (const path of rivers) {
        // Find the lake neighbor of the mouth (last tile in path)
        const mouth = path[path.length - 1];
        const lakeNeighbor = getNeighbors(mouth.col, mouth.row)
            .find(n => biomeMap[n.row][n.col] === "lake");
        const lakeDirFromMouth = lakeNeighbor
            ? directionTo(mouth.col, mouth.row, lakeNeighbor.col, lakeNeighbor.row)
            : -1;

        for (let i = 0; i < path.length; i++) {
            const tile = path[i];
            const { x: cx, y: cy } = getHexCenter(tile.col, tile.row);

            // Determine entry and exit points for this tile
            let entryX: number, entryY: number;
            let exitX: number, exitY: number;

            if (i === 0) {
                // Source: start at center
                entryX = cx;
                entryY = cy;
            } else {
                // Entry from previous tile's direction
                const prev = path[i - 1];
                const entryDir = directionTo(tile.col, tile.row, prev.col, prev.row);
                const em = edgeMidpoint(cx, cy, entryDir);
                entryX = em.x;
                entryY = em.y;
            }

            if (i === path.length - 1) {
                // Mouth: exit toward the lake
                if (lakeDirFromMouth >= 0) {
                    const em = edgeMidpoint(cx, cy, lakeDirFromMouth);
                    exitX = em.x;
                    exitY = em.y;
                } else {
                    exitX = cx;
                    exitY = cy;
                }
            } else {
                // Exit toward next tile
                const next = path[i + 1];
                const exitDir = directionTo(tile.col, tile.row, next.col, next.row);
                const em = edgeMidpoint(cx, cy, exitDir);
                exitX = em.x;
                exitY = em.y;
            }

            // Draw: entry → center → exit (gives a natural bend at each hex)
            graphics.beginPath();
            graphics.moveTo(entryX, entryY);
            if (i > 0 && i < path.length - 1) {
                // Middle tiles: bend through center
                graphics.lineTo(cx, cy);
            }
            graphics.lineTo(exitX, exitY);
            graphics.strokePath();
        }
    }
}

// --- Scene ---
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
        const elevNoise = createNoise2D();
        const moistNoise = createNoise2D();
        const SCALE = 0.07;

        // Build terrain data
        const biomeMap: BiomeType[][] = [];
        const elevMap: number[][] = [];
        const levelMap: number[][] = [];

        for (let row = 0; row < ROWS; row++) {
            biomeMap[row] = [];
            elevMap[row] = [];
            levelMap[row] = [];
            for (let col = 0; col < COLS; col++) {
                const elevation = fbm(elevNoise, col * SCALE, row * SCALE, 5, 2.0, 0.5);
                const moisture = fbm(moistNoise, col * SCALE + 500, row * SCALE + 500, 4, 2.0, 0.5);
                elevMap[row][col] = elevation;
                biomeMap[row][col] = classifyBiome(elevation, moisture);
                levelMap[row][col] = elevationLevel(biomeMap[row][col], elevation);
            }
        }

        // Draw terrain
        const terrainGfx = this.add.graphics();

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const { x, y } = getHexCenter(col, row);
                const biome = biomeMap[row][col];
                const level = levelMap[row][col];
                const baseColor = adjustBrightness(BIOME_COLORS[biome], LEVEL_BRIGHTNESS[level]);
                const color = varyColor(baseColor, 12);
                const points = getHexPoints(x, y);

                terrainGfx.fillStyle(color, 1);
                terrainGfx.beginPath();
                terrainGfx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < 6; i++) terrainGfx.lineTo(points[i].x, points[i].y);
                terrainGfx.closePath();
                terrainGfx.fillPath();

                // Default thin border
                terrainGfx.lineStyle(1, 0x0f0f23, 0.08);
                terrainGfx.beginPath();
                terrainGfx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < 6; i++) terrainGfx.lineTo(points[i].x, points[i].y);
                terrainGfx.closePath();
                terrainGfx.strokePath();
            }
        }

        // Directional hillshade: simulate NW light source on cliff edges.
        // Edges where terrain drops toward SE are shadowed (dark),
        // edges where it drops toward NW are lit (bright).
        // Dot product of each hex direction with light vector (-1,-1):
        //   dir 0 NE → +0.18,  dir 1 E → -0.71,  dir 2 SE → -0.88
        //   dir 3 SW → -0.18,  dir 4 W → +0.71,  dir 5 NW → +0.88
        const SHADE = [0.18, -0.71, -0.88, -0.18, 0.71, 0.88];

        const cliffGfx = this.add.graphics();
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const level = levelMap[row][col];
                const { x: cx, y: cy } = getHexCenter(col, row);
                const points = getHexPoints(cx, cy);

                for (const n of getNeighbors(col, row)) {
                    const nLevel = levelMap[n.row][n.col];
                    if (nLevel >= level) continue;

                    const v1 = (n.dir + 5) % 6;
                    const v2 = n.dir;
                    const diff = level - nLevel;
                    const shade = SHADE[n.dir];

                    // Positive shade → white highlight, negative → dark shadow
                    const color = shade >= 0 ? 0xffffff : 0x000000;
                    const alpha = Math.min(0.85, Math.abs(shade) * 0.35 * diff);
                    const width = diff >= 2 ? 3 : 2;

                    cliffGfx.lineStyle(width, color, alpha);
                    cliffGfx.beginPath();
                    cliffGfx.moveTo(points[v1].x, points[v1].y);
                    cliffGfx.lineTo(points[v2].x, points[v2].y);
                    cliffGfx.strokePath();
                }
            }
        }

        // Generate and draw rivers
        const rivers = generateRivers(biomeMap, elevMap);
        const riverGfx = this.add.graphics();
        drawRivers(riverGfx, rivers, biomeMap);

        // Camera
        const gridPixelWidth = COLS * HEX_WIDTH + HEX_WIDTH / 2;
        const gridPixelHeight = ROWS * HEX_HEIGHT * 0.75 + HEX_HEIGHT * 0.25;
        this.cameras.main.setBounds(
            -HEX_WIDTH, -HEX_HEIGHT,
            gridPixelWidth + HEX_WIDTH * 2,
            gridPixelHeight + HEX_HEIGHT * 2,
        );
        this.cameras.main.centerOn(gridPixelWidth / 2, gridPixelHeight / 2);

        // Drag to pan
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
        this.input.on("pointerup", () => { this.isDragging = false; });

        // Scroll to zoom
        this.input.on("wheel", (
            _p: Phaser.Input.Pointer, _g: Phaser.GameObjects.GameObject[],
            _dx: number, deltaY: number,
        ) => {
            const cam = this.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.5, 3));
        });
    }
}
