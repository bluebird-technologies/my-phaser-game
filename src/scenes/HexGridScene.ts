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
    mountain:  0x3d3d4a,
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

// Lakes are placed by moisture (not elevation), so they can appear at any altitude.
// Mountains are placed by elevation. Desert/grassland split on moisture.
function classifyBiome(elevation: number, moisture: number): BiomeType {
    if (elevation > 0.45) return "mountain";
    if (moisture > 0.3) return "lake";
    if (moisture < -0.1) return "desert";
    return "grassland";
}


// Discrete elevation level from continuous (already-depressed) value.
function elevationLevel(elevation: number): number {
    if (elevation > 0.45) return 4;  // mountain
    if (elevation > 0.15) return 3;
    if (elevation > -0.10) return 2;
    if (elevation > -0.35) return 1;
    return 0;
}

// Brightness multiplier per elevation level — higher = lighter
const LEVEL_BRIGHTNESS: Record<number, number> = {
    0: 0.75,
    1: 0.85,
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

// Every river path is stored flowing downhill: path[0] is highest, path[last] is lowest.
// `lakeEnd` indicates which end touches a lake:
//   "end"   → inflow:  source ... → lake  (last tile is lake-adjacent)
//   "start" → outflow: lake → ... source   (first tile is lake-adjacent)
interface River {
    path: Array<{ col: number; row: number }>;
    lakeEnd: "start" | "end";
}

function generateRivers(biomeMap: BiomeType[][], elevMap: number[][]): River[] {
    const rivers: River[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;

    function isTraversable(col: number, row: number) {
        const b = biomeMap[row][col];
        return b === "grassland" || b === "desert";
    }

    // Find all land tiles adjacent to a lake, grouped by lake cluster.
    // Each lake cluster is identified by its flattened elevation (unique per cluster).
    interface Shore { col: number; row: number; lakeElev: number }
    const inflowByLake = new Map<number, Shore[]>();
    const outflowByLake = new Map<number, Shore[]>();

    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (!isTraversable(col, row)) continue;
            for (const n of getNeighbors(col, row)) {
                if (biomeMap[n.row][n.col] === "lake") {
                    const lakeElev = elevMap[n.row][n.col];
                    const lakeKey = Math.round(lakeElev * 10000);
                    const shore: Shore = { col, row, lakeElev };
                    if (elevMap[row][col] > lakeElev) {
                        if (!inflowByLake.has(lakeKey)) inflowByLake.set(lakeKey, []);
                        inflowByLake.get(lakeKey)!.push(shore);
                    } else {
                        if (!outflowByLake.has(lakeKey)) outflowByLake.set(lakeKey, []);
                        outflowByLake.get(lakeKey)!.push(shore);
                    }
                    break;
                }
            }
        }
    }

    const shuffle = <T>(arr: T[]) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    };

    // Collect all lake keys
    const allLakeKeys = new Set([...inflowByLake.keys(), ...outflowByLake.keys()]);

    // Shuffle shores within each lake, then build priority lists:
    // guaranteed shores (first pick per lake) go first, extras go after.
    const guaranteedShores: Array<Shore & { type: "in" | "out" }> = [];
    const extraInflows: Shore[] = [];
    const extraOutflows: Shore[] = [];

    for (const lakeKey of allLakeKeys) {
        const inflows = inflowByLake.get(lakeKey) ?? [];
        const outflows = outflowByLake.get(lakeKey) ?? [];
        shuffle(inflows);
        shuffle(outflows);

        // Guarantee at least one river per lake — prefer inflow, fall back to outflow
        if (inflows.length > 0) {
            guaranteedShores.push({ ...inflows[0], type: "in" });
            extraInflows.push(...inflows.slice(1));
        } else if (outflows.length > 0) {
            guaranteedShores.push({ ...outflows[0], type: "out" });
            extraOutflows.push(...outflows.slice(1));
        }

        // Remaining outflows (skip first if already used as guaranteed)
        if (inflows.length > 0) {
            extraOutflows.push(...outflows);
        } else {
            extraOutflows.push(...outflows.slice(1));
        }
    }

    shuffle(guaranteedShores);
    shuffle(extraInflows);
    shuffle(extraOutflows);

    // --- Trace a path downhill from a starting tile ---
    function traceDownhill(start: { col: number; row: number }, maxLen: number): Array<{ col: number; row: number }> {
        const path = [{ col: start.col, row: start.row }];
        used.add(key(start.col, start.row));
        let cur = start;

        for (let step = 0; step < maxLen; step++) {
            const candidates = getNeighbors(cur.col, cur.row).filter(n => {
                if (used.has(key(n.col, n.row))) return false;
                if (!isTraversable(n.col, n.row)) return false;
                // Must flow downhill or flat (allow tiny uphill for noise jitter)
                return elevMap[n.row][n.col] <= elevMap[cur.row][cur.col] + 0.02;
            });

            if (candidates.length === 0) break;

            // Prefer lower elevation with some randomness
            candidates.sort((a, b) => elevMap[a.row][a.col] - elevMap[b.row][b.col]);
            const pick = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];

            path.push({ col: pick.col, row: pick.row });
            used.add(key(pick.col, pick.row));
            cur = pick;
        }

        return path;
    }

    // --- Trace a path uphill from a starting tile ---
    function traceUphill(start: { col: number; row: number }, maxLen: number): Array<{ col: number; row: number }> {
        const path = [{ col: start.col, row: start.row }];
        used.add(key(start.col, start.row));
        let cur = start;

        for (let step = 0; step < maxLen; step++) {
            const candidates = getNeighbors(cur.col, cur.row).filter(n => {
                if (used.has(key(n.col, n.row))) return false;
                if (!isTraversable(n.col, n.row)) return false;
                return elevMap[n.row][n.col] >= elevMap[cur.row][cur.col] - 0.02;
            });

            if (candidates.length === 0) break;

            candidates.sort((a, b) => elevMap[b.row][b.col] - elevMap[a.row][a.col]);
            const pick = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];

            path.push({ col: pick.col, row: pick.row });
            used.add(key(pick.col, pick.row));
            cur = pick;
        }

        return path;
    }

    // Helper to generate a single river from a shore tile
    function tryRiver(shore: Shore, type: "in" | "out"): boolean {
        if (used.has(key(shore.col, shore.row))) return false;

        if (type === "in") {
            const maxLen = 8 + Math.floor(Math.random() * 14);
            const path = traceUphill(shore, maxLen);
            if (path.length >= 3) {
                path.reverse();
                rivers.push({ path, lakeEnd: "end" });
                return true;
            }
        } else {
            const maxLen = 10 + Math.floor(Math.random() * 18);
            const path = traceDownhill(shore, maxLen);
            if (path.length >= 3) {
                rivers.push({ path, lakeEnd: "start" });
                return true;
            }
        }
        return false;
    }

    // Phase 1: guarantee at least one river per lake
    for (const shore of guaranteedShores) {
        tryRiver(shore, shore.type);
    }

    // Phase 2: fill in extra inflows and outflows
    const maxExtra = 30;
    let extras = 0;

    for (const shore of extraInflows) {
        if (extras >= maxExtra) break;
        if (tryRiver(shore, "in")) extras++;
    }

    for (const shore of extraOutflows) {
        if (extras >= maxExtra) break;
        if (tryRiver(shore, "out")) extras++;
    }

    return rivers;
}

// --- Draw rivers ---
function drawRivers(
    graphics: Phaser.GameObjects.Graphics,
    rivers: River[],
    biomeMap: BiomeType[][],
) {
    graphics.lineStyle(3, 0x0077b6, 0.9);

    for (const { path, lakeEnd } of rivers) {
        // Find the lake-connected end's lake neighbor for drawing the edge connection
        const lakeTile = lakeEnd === "end" ? path[path.length - 1] : path[0];
        const lakeNeighbor = getNeighbors(lakeTile.col, lakeTile.row)
            .find(n => biomeMap[n.row][n.col] === "lake");
        const lakeDir = lakeNeighbor
            ? directionTo(lakeTile.col, lakeTile.row, lakeNeighbor.col, lakeNeighbor.row)
            : -1;

        for (let i = 0; i < path.length; i++) {
            const tile = path[i];
            const { x: cx, y: cy } = getHexCenter(tile.col, tile.row);

            let entryX: number, entryY: number;
            let exitX: number, exitY: number;

            // --- Entry point ---
            if (i === 0) {
                if (lakeEnd === "start" && lakeDir >= 0) {
                    // Outflow: first tile enters from the lake edge
                    const em = edgeMidpoint(cx, cy, lakeDir);
                    entryX = em.x;
                    entryY = em.y;
                } else {
                    // Inflow source: starts at center
                    entryX = cx;
                    entryY = cy;
                }
            } else {
                const prev = path[i - 1];
                const dir = directionTo(tile.col, tile.row, prev.col, prev.row);
                const em = edgeMidpoint(cx, cy, dir);
                entryX = em.x;
                entryY = em.y;
            }

            // --- Exit point ---
            if (i === path.length - 1) {
                if (lakeEnd === "end" && lakeDir >= 0) {
                    // Inflow: last tile exits into the lake edge
                    const em = edgeMidpoint(cx, cy, lakeDir);
                    exitX = em.x;
                    exitY = em.y;
                } else {
                    // Outflow tail: ends at center
                    exitX = cx;
                    exitY = cy;
                }
            } else {
                const next = path[i + 1];
                const dir = directionTo(tile.col, tile.row, next.col, next.row);
                const em = edgeMidpoint(cx, cy, dir);
                exitX = em.x;
                exitY = em.y;
            }

            // Draw: entry → center → exit
            graphics.beginPath();
            graphics.moveTo(entryX, entryY);
            if (i > 0 && i < path.length - 1) {
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
                const biome = classifyBiome(elevation, moisture);
                elevMap[row][col] = elevation;
                biomeMap[row][col] = biome;
                levelMap[row][col] = elevationLevel(elevation);
            }
        }

        // Flatten connected lake clusters to a single elevation.
        // Flood-fill to find each lake body, then set all tiles to the
        // cluster's minimum elevation so water sits at one level.
        const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (biomeMap[row][col] !== "lake" || visited[row][col]) continue;

                // Flood-fill to collect this lake cluster
                const cluster: Array<{ col: number; row: number }> = [];
                const stack: Array<{ col: number; row: number }> = [{ col, row }];
                visited[row][col] = true;
                let minElev = elevMap[row][col];

                while (stack.length > 0) {
                    const cur = stack.pop()!;
                    cluster.push(cur);
                    if (elevMap[cur.row][cur.col] < minElev) {
                        minElev = elevMap[cur.row][cur.col];
                    }
                    for (const n of getNeighbors(cur.col, cur.row)) {
                        if (!visited[n.row][n.col] && biomeMap[n.row][n.col] === "lake") {
                            visited[n.row][n.col] = true;
                            stack.push(n);
                        }
                    }
                }

                // Apply uniform elevation to the whole lake
                const level = elevationLevel(minElev);
                for (const tile of cluster) {
                    elevMap[tile.row][tile.col] = minElev;
                    levelMap[tile.row][tile.col] = level;
                }
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

        // Collect river tiles for exclusion
        const riverTiles = new Set<string>();
        for (const { path } of rivers) {
            for (const t of path) riverTiles.add(`${t.col},${t.row}`);
        }

        // Draw trees on ~40% of grassland tiles — full-tile canopy coverage
        // so adjacent forested tiles blend into continuous woodland.
        // 4 styles rendered in separate quadrants of the map for comparison.
        const treeGfx = this.add.graphics();

        // Random points scattered across the hex area
        function hexPoints(cx: number, cy: number, count: number) {
            const pts: Array<{ x: number; y: number }> = [];
            for (let i = 0; i < count * 3; i++) { // oversample + reject
                const rx = (Math.random() - 0.5) * HEX_WIDTH;
                const ry = (Math.random() - 0.5) * HEX_HEIGHT * 0.85;
                // Rough hex containment check
                const ax = Math.abs(rx), ay = Math.abs(ry);
                if (ay < HEX_SIZE - ax * HEX_SIZE / (HEX_WIDTH * 0.5)) {
                    pts.push({ x: cx + rx, y: cy + ry });
                    if (pts.length >= count) break;
                }
            }
            return pts;
        }

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                if (biomeMap[row][col] !== "grassland") continue;
                if (riverTiles.has(`${col},${row}`)) continue;
                if (Math.random() > 0.4) continue;

                const { x: cx, y: cy } = getHexCenter(col, row);

                // Pine forest — dense packed triangles
                const pts = hexPoints(cx, cy, 12);
                for (const p of pts) {
                    const h = 6 + Math.random() * 4;
                    const w = 2.5 + Math.random() * 2;
                    const green = Math.random() > 0.4 ? 0x1b4332 : 0x2d6a4f;
                    treeGfx.fillStyle(green, 0.85);
                    treeGfx.fillTriangle(
                        p.x, p.y - h * 0.6,
                        p.x - w, p.y + h * 0.4,
                        p.x + w, p.y + h * 0.4,
                    );
                    treeGfx.fillStyle(0x245e3a, 0.7);
                    treeGfx.fillTriangle(
                        p.x, p.y - h * 0.4,
                        p.x - w * 0.6, p.y + h * 0.2,
                        p.x + w * 0.6, p.y + h * 0.2,
                    );
                }
            }
        }

        // Camera
        const gridPixelWidth = COLS * HEX_WIDTH + HEX_WIDTH / 2;
        const gridPixelHeight = ROWS * HEX_HEIGHT * 0.75 + HEX_HEIGHT * 0.25;
        this.cameras.main.setBounds(
            -HEX_WIDTH, -HEX_HEIGHT,
            gridPixelWidth + HEX_WIDTH * 2,
            gridPixelHeight + HEX_HEIGHT * 2,
        );
        this.cameras.main.centerOn(gridPixelWidth / 2, gridPixelHeight / 2);

        // Pointer cursor
        this.input.setDefaultCursor("pointer");

        // Hex hover highlight
        const hoverGfx = this.add.graphics();
        let hoveredCol = -1;
        let hoveredRow = -1;

        const drawHover = (col: number, row: number) => {
            hoverGfx.clear();
            if (col < 0) return;
            const { x, y } = getHexCenter(col, row);
            const pts = getHexPoints(x, y);
            // Bright outline
            hoverGfx.lineStyle(2, 0xffffff, 0.7);
            hoverGfx.beginPath();
            hoverGfx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 6; i++) hoverGfx.lineTo(pts[i].x, pts[i].y);
            hoverGfx.closePath();
            hoverGfx.strokePath();
            // Subtle fill highlight
            hoverGfx.fillStyle(0xffffff, 0.12);
            hoverGfx.beginPath();
            hoverGfx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 6; i++) hoverGfx.lineTo(pts[i].x, pts[i].y);
            hoverGfx.closePath();
            hoverGfx.fillPath();
        };

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                this.cameras.main.scrollX = this.camStartX - (pointer.x - this.dragStartX);
                this.cameras.main.scrollY = this.camStartY - (pointer.y - this.dragStartY);
                hoverGfx.clear();
                hoveredCol = -1;
                return;
            }
            // Convert screen → world coordinates
            const wx = pointer.x / this.cameras.main.zoom + this.cameras.main.scrollX;
            const wy = pointer.y / this.cameras.main.zoom + this.cameras.main.scrollY;

            // Find closest hex using axial math
            // Approximate row from y, then refine
            const approxRow = Math.round(wy / (HEX_HEIGHT * 0.75));
            const rowOffset = approxRow % 2 === 1 ? HEX_WIDTH / 2 : 0;
            const approxCol = Math.round((wx - rowOffset) / HEX_WIDTH);

            // Check this tile and its neighbors, pick closest center
            let bestCol = -1, bestRow = -1, bestDist = Infinity;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = approxRow + dr;
                    const c = approxCol + dc;
                    if (!inBounds(c, r)) continue;
                    const { x, y } = getHexCenter(c, r);
                    const dist = (wx - x) ** 2 + (wy - y) ** 2;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCol = c;
                        bestRow = r;
                    }
                }
            }

            if (bestCol !== hoveredCol || bestRow !== hoveredRow) {
                hoveredCol = bestCol;
                hoveredRow = bestRow;
                drawHover(hoveredCol, hoveredRow);
            }
        });

        // Drag to pan
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.dragStartX = pointer.x;
            this.dragStartY = pointer.y;
            this.camStartX = this.cameras.main.scrollX;
            this.camStartY = this.cameras.main.scrollY;
        });
        // pointermove handled above (hover + drag combined)
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
