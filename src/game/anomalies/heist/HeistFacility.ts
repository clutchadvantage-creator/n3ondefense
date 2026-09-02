import Phaser from 'phaser';
import type { RectSpec } from '../../types.ts';
import {
  drawBeveledTechPlate,
  drawHazardStripes,
  drawPanelBolts,
  drawVentSlats
} from '../../rendering/LayeredArtPrimitives.ts';
import {
  createEnvironmentDecalPlan,
  createEnvironmentDecalText
} from '../../rendering/EnvironmentDecalLibrary.ts';
import { HEIST_BALANCE } from './HeistConfig.ts';
import {
  generateHeistFacilityLayout,
  HEIST_LAYOUT_GRID,
  heistPathPoints,
  nearestHeistNodeId,
  type HeistFacilityLayout,
  type HeistLayoutPoint,
  type HeistTrapPlacement,
  type HeistVaultDoorSpec
} from './HeistFacilityLayout.ts';
import { HeistWallPointIndex, mergeAxisAlignedHeistWalls } from './HeistWallRuntime.ts';
import {
  HEIST_ZONE_ALPHA,
  HeistZoneVisibility,
  heistVisibilityZoneRect
} from './HeistZoneVisibility.ts';

export interface HeistFacilityRuntime {
  layout: HeistFacilityLayout;
  walls: Phaser.Physics.Arcade.StaticGroup;
  wallRects: RectSpec[];
  vaultDoor: Phaser.Physics.Arcade.Image;
  vaultDoors: Phaser.Physics.Arcade.StaticGroup;
  route: readonly HeistLayoutPoint[];
  extractionPoint: HeistLayoutPoint;
  containerPoints: readonly HeistLayoutPoint[];
  supportPoints: readonly ({ kind: 'health' | 'energy' } & HeistLayoutPoint)[];
  ambushPoints: readonly HeistLayoutPoint[];
  trapPlacements: readonly HeistTrapPlacement[];
  diagnostics: {
    identity: 'heist-maze-facility';
    seed: number;
    staticGraphicsBatches: 1;
    liveAmbientBatches: 1;
    independentAnimationLoops: 1;
    guideMarkerMaximum: number;
    utilityLightCount: number;
    decalCount: number;
    loops: number;
    deadEnds: number;
    sourceWallRects: number;
    runtimeWallRects: number;
    staticPhysicsBodies: number;
    wallIndexBuckets: number;
    wallIndexMaximumCandidates: number;
    staticTextureObjects: number;
    visibilityZones: number;
  };
  setVaultDoorOpen(open: boolean): void;
  setAlertLighting(active: boolean): void;
  setEscapeRoute(active: boolean): void;
  activateEscapeGuide(playerX: number, playerY: number): void;
  isInsideVault(x: number, y: number, padding?: number): boolean;
  distanceSquaredToVault(x: number, y: number): number;
  containsWallPoint(x: number, y: number): boolean;
  prepareNavigationTarget(targetX: number, targetY: number): void;
  navigationTarget(x: number, y: number, targetX: number, targetY: number, out?: HeistLayoutPoint): HeistLayoutPoint;
  isPresentationOpenArea(): boolean;
  update(now: number, playerX: number, playerY: number): void;
  destroy(): void;
}

interface WallVisual {
  rect: RectSpec;
  cap: Phaser.GameObjects.Image;
  facades: Phaser.GameObjects.TileSprite[];
}

interface DoorVisual {
  spec: HeistVaultDoorSpec;
  body: Phaser.Physics.Arcade.Image;
  root: Phaser.GameObjects.Container;
  firstPanel: Phaser.GameObjects.Rectangle;
  secondPanel: Phaser.GameObjects.Rectangle;
  seam: Phaser.GameObjects.Rectangle;
  status: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

const drawWallPanel = (graphics: Phaser.GameObjects.Graphics, rect: RectSpec, index: number): void => {
  const horizontal = rect.w >= rect.h;
  const depth = Math.min(13, Math.max(7, (horizontal ? rect.h : rect.w) * 0.15));
  const accent = index % 5 === 1 ? 0xff4dcb : 0x43edfa;
  // The beveled plate supplies a readable top cap and side face; warning strips
  // and emissive trim stay decorative so open passages remain unmistakable.
  drawBeveledTechPlate(graphics, rect.x, rect.y, rect.w, rect.h, {
    face: 0x091622,
    inset: index % 3 === 0 ? 0x0c2330 : 0x07131e,
    edge: accent,
    side: 0x02060c,
    highlight: 0xb9fbff,
    depth,
    alpha: 0.98
  });
  graphics.lineStyle(1, index % 4 === 0 ? 0xff55cf : 0x4beaff, 0.26)
    .strokeRect(rect.x + 9, rect.y + 9, Math.max(2, rect.w - depth - 18), Math.max(2, rect.h - depth - 18));
  if (rect.w > 42 && rect.h > 42) {
    drawPanelBolts(graphics, rect.x + 3, rect.y + 3, rect.w - depth - 6, rect.h - depth - 6, 0x718c99, 9);
  }
  if (horizontal && rect.w > 210) {
    drawVentSlats(graphics, rect.x + rect.w * 0.64, rect.y + 12, Math.min(88, rect.w * 0.22),
      Math.max(16, rect.h - depth - 24), true, accent);
  } else if (!horizontal && rect.h > 210) {
    drawVentSlats(graphics, rect.x + 12, rect.y + rect.h * 0.64, Math.max(16, rect.w - depth - 24),
      Math.min(88, rect.h * 0.22), false, accent);
  }
};

const HEIST_FLOOR_TEXTURE = 'heist-runtime-floor-plates-v1';
const HEIST_WALL_TEXTURES = {
  horizontalCyan: 'heist-runtime-wall-h-cyan-v1',
  horizontalMagenta: 'heist-runtime-wall-h-magenta-v1',
  verticalCyan: 'heist-runtime-wall-v-cyan-v1',
  verticalMagenta: 'heist-runtime-wall-v-magenta-v1'
} as const;

const HEIST_WALL_FACADE_TEXTURES = {
  horizontalCyan: 'heist-runtime-wall-face-h-cyan-v1',
  horizontalMagenta: 'heist-runtime-wall-face-h-magenta-v1',
  verticalCyan: 'heist-runtime-wall-face-v-cyan-v1',
  verticalMagenta: 'heist-runtime-wall-face-v-magenta-v1'
} as const;
const HEIST_WALL_PROJECTION_X = 14;
const HEIST_WALL_PROJECTION_Y = 58;
const HEIST_WALL_CAP_DEPTH = 30.2;
const HEIST_WALL_FACE_DEPTH = 30.1;
const HEIST_VISIBILITY_DEPTH = 40;

const drawWallFacade = (
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  vertical: boolean,
  magenta: boolean
): void => {
  const accent = magenta ? 0xff4dcb : 0x43edfa;
  graphics.fillStyle(0x02050a, 1).fillRect(0, 0, width, height);
  graphics.fillStyle(0x07131e, 1).fillRect(vertical ? 2 : 0, vertical ? 0 : 3,
    vertical ? Math.max(1, width - 4) : width, vertical ? height : Math.max(1, height - 7));
  graphics.fillStyle(0x0c2230, 0.92).fillRect(vertical ? 3 : 0, vertical ? 0 : 7,
    vertical ? Math.max(1, width - 6) : width, vertical ? height : Math.max(1, height - 16));
  graphics.fillStyle(accent, 0.76).fillRect(vertical ? 2 : 0, vertical ? 0 : 5,
    vertical ? 2 : width, vertical ? height : 3);
  graphics.fillStyle(0xc8fdff, 0.32).fillRect(vertical ? 5 : 0, vertical ? 0 : 9,
    vertical ? 1 : width, vertical ? height : 1);
  if (vertical) {
    for (let y = 18; y < height; y += 38) {
      graphics.fillStyle(y % 76 ? 0x102d3b : accent, y % 76 ? 0.78 : 0.58)
        .fillRect(3, y, Math.max(2, width - 6), 4);
      graphics.fillStyle(0x000207, 0.82).fillRect(5, y + 7, Math.max(1, width - 10), 17);
    }
  } else {
    for (let x = 16; x < width; x += 58) {
      graphics.fillStyle(0x02070d, 0.9).fillRect(x, 14, 38, Math.max(8, height - 23));
      graphics.lineStyle(1, accent, 0.24).strokeRect(x + 3, 17, 32, Math.max(4, height - 29));
      graphics.fillStyle(0x617985, 0.52).fillCircle(x + 6, 20, 1.5).fillCircle(x + 32, 20, 1.5);
    }
    graphics.fillStyle(accent, 0.46).fillRect(0, height - 8, width, 2);
    graphics.fillStyle(0x000207, 0.9).fillRect(0, height - 4, width, 4);
  }
};

const ensureFacilityTextures = (scene: Phaser.Scene): void => {
  if (!scene.textures.exists(HEIST_FLOOR_TEXTURE)) {
    const width = HEIST_LAYOUT_GRID.cellWidth * 2;
    const height = HEIST_LAYOUT_GRID.cellHeight * 2;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x06111c, 1).fillRect(0, 0, width, height);
    for (let column = 0; column < 2; column += 1) {
      for (let row = 0; row < 2; row += 1) {
        const x = column * HEIST_LAYOUT_GRID.cellWidth + 8;
        const y = row * HEIST_LAYOUT_GRID.cellHeight + 8;
        const plateWidth = HEIST_LAYOUT_GRID.cellWidth - 16;
        const plateHeight = HEIST_LAYOUT_GRID.cellHeight - 16;
        const alternate = (column + row * 2) % 4 === 0;
        drawBeveledTechPlate(graphics, x, y, plateWidth, plateHeight, {
          face: alternate ? 0x0a1b29 : 0x071521,
          inset: alternate ? 0x07131e : 0x06101a,
          edge: alternate ? 0x295a70 : 0x173849,
          side: 0x010409,
          highlight: alternate ? 0x6faeb9 : 0x3f6876,
          depth: 6,
          alpha: 0.92
        });
        if ((column + row) % 2 === 0) {
          drawPanelBolts(graphics, x + 4, y + 4, plateWidth - 14, plateHeight - 14, 0x526f7d, 13);
        }
        if (column !== row) {
          drawVentSlats(graphics, x + plateWidth - 94, y + 20, 66, 34, true,
            column % 2 ? 0xff4dcb : 0x43edfa);
        }
      }
    }
    graphics.generateTexture(HEIST_FLOOR_TEXTURE, width, height);
    graphics.destroy();
  }

  const wallSpecs = [
    [HEIST_WALL_TEXTURES.horizontalCyan, 256, HEIST_LAYOUT_GRID.wallThickness, 0],
    [HEIST_WALL_TEXTURES.horizontalMagenta, 256, HEIST_LAYOUT_GRID.wallThickness, 1],
    [HEIST_WALL_TEXTURES.verticalCyan, HEIST_LAYOUT_GRID.wallThickness, 256, 0],
    [HEIST_WALL_TEXTURES.verticalMagenta, HEIST_LAYOUT_GRID.wallThickness, 256, 1]
  ] as const;
  for (const [key, width, height, variant] of wallSpecs) {
    if (scene.textures.exists(key)) continue;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    drawWallPanel(graphics, { x: 0, y: 0, w: width, h: height }, variant);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  const facadeSpecs = [
    [HEIST_WALL_FACADE_TEXTURES.horizontalCyan, 256, HEIST_WALL_PROJECTION_Y, false, false],
    [HEIST_WALL_FACADE_TEXTURES.horizontalMagenta, 256, HEIST_WALL_PROJECTION_Y, false, true],
    [HEIST_WALL_FACADE_TEXTURES.verticalCyan, HEIST_WALL_PROJECTION_X, 256, true, false],
    [HEIST_WALL_FACADE_TEXTURES.verticalMagenta, HEIST_WALL_PROJECTION_X, 256, true, true]
  ] as const;
  for (const [key, width, height, vertical, magenta] of facadeSpecs) {
    if (scene.textures.exists(key)) continue;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    drawWallFacade(graphics, width, height, vertical, magenta);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
};

const createDoorVisual = (
  scene: Phaser.Scene,
  doors: Phaser.Physics.Arcade.StaticGroup,
  spec: HeistVaultDoorSpec
): DoorVisual => {
  const horizontal = spec.orientation === 'horizontal';
  const body = doors.create(spec.x, spec.y, 'pixel') as Phaser.Physics.Arcade.Image;
  body.setVisible(false).setDisplaySize(horizontal ? spec.width : HEIST_LAYOUT_GRID.wallThickness,
    horizontal ? HEIST_LAYOUT_GRID.wallThickness : spec.width).refreshBody();

  const root = scene.add.container(spec.x - HEIST_WALL_PROJECTION_X * 0.5,
    spec.y - HEIST_WALL_PROJECTION_Y * 0.5).setDepth(29.6);
  const chassisWidth = horizontal ? spec.width + 34 : 104;
  const chassisHeight = (horizontal ? 104 : spec.width + 34) + HEIST_WALL_PROJECTION_Y;
  const shadow = scene.add.rectangle(8, 12, chassisWidth + 18, chassisHeight + 18, 0x000207, 0.72);
  const outer = scene.add.rectangle(0, 0, chassisWidth, chassisHeight, 0x030811, 1)
    .setStrokeStyle(4, 0x4deaff, 0.72);
  const inset = scene.add.rectangle(0, 0, chassisWidth - 20, chassisHeight - 20, 0x0a1e2b, 1)
    .setStrokeStyle(2, 0xff4bc9, 0.58);
  const panelWidth = horizontal ? (spec.width - 20) * 0.5 : 70;
  const panelHeight = horizontal ? 70 + HEIST_WALL_PROJECTION_Y : (spec.width - 20) * 0.5 + 20;
  const firstPanel = scene.add.rectangle(horizontal ? -panelWidth * 0.5 : 0, horizontal ? 0 : -panelHeight * 0.5,
    panelWidth, panelHeight, 0x123546, 1).setStrokeStyle(2, 0x64f5ff, 0.9);
  const secondPanel = scene.add.rectangle(horizontal ? panelWidth * 0.5 : 0, horizontal ? 0 : panelHeight * 0.5,
    panelWidth, panelHeight, 0x152b3e, 1).setStrokeStyle(2, 0xff62d2, 0.88);
  const seam = scene.add.rectangle(0, 0, horizontal ? 7 : 70,
    horizontal ? panelHeight : 7, 0xe8ffff, 0.72)
    .setBlendMode(Phaser.BlendModes.ADD);
  const status = scene.add.circle(horizontal ? -chassisWidth * 0.4 : chassisWidth * 0.38,
    -chassisHeight * 0.4, 7, 0xff4d71, 1)
    .setStrokeStyle(2, 0xffb0be, 0.72);
  const crown = scene.add.rectangle(0, -chassisHeight * 0.5 + 10, chassisWidth - 18, 14, 0x0d2b3a, 1)
    .setStrokeStyle(2, 0x63f2ff, 0.68);
  const leftRail = scene.add.rectangle(-chassisWidth * 0.5 + 11, 0, 13, chassisHeight - 22, 0x102b3a, 1)
    .setStrokeStyle(1, 0xff4dcb, 0.54);
  const rightRail = scene.add.rectangle(chassisWidth * 0.5 - 11, 0, 13, chassisHeight - 22, 0x102b3a, 1)
    .setStrokeStyle(1, 0x43edfa, 0.54);
  const label = scene.add.text(0, -chassisHeight * 0.5 - 24,
    `VAULT // ${spec.side.toUpperCase()} SEALED`, {
      fontFamily: 'Orbitron, sans-serif', fontSize: '14px', color: '#ff72d9',
      backgroundColor: '#020710e8', padding: { x: 8, y: 4 }
    }).setOrigin(0.5);
  root.add([shadow, outer, inset, crown, firstPanel, secondPanel, seam, leftRail, rightRail, status, label]);
  return { spec, body, root, firstPanel, secondPanel, seam, status, label };
};

const appendGuideMarkers = (points: readonly HeistLayoutPoint[]): HeistLayoutPoint[] => {
  const markers: HeistLayoutPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const count = Math.max(1, Math.floor(distance / 178));
    for (let marker = 1; marker <= count; marker += 1) {
      const t = marker / (count + 1);
      markers.push({ x: Phaser.Math.Linear(from.x, to.x, t), y: Phaser.Math.Linear(from.y, to.y, t) });
    }
  }
  return markers.slice(0, 28);
};

export const createHeistFacility = (scene: Phaser.Scene, seed: number): HeistFacilityRuntime => {
  const layout = generateHeistFacilityLayout(seed);
  const runtimeWallRects = mergeAxisAlignedHeistWalls(layout.wallRects);
  const wallPointIndex = new HeistWallPointIndex(runtimeWallRects);
  ensureFacilityTextures(scene);
  const staticVisuals: Phaser.GameObjects.GameObject[] = [];
  staticVisuals.push(scene.add.rectangle(
    layout.world.width * 0.5,
    layout.world.height * 0.5,
    layout.world.width,
    layout.world.height,
    0x01040a,
    1
  ).setDepth(0));
  staticVisuals.push(scene.add.tileSprite(
    HEIST_LAYOUT_GRID.margin,
    HEIST_LAYOUT_GRID.margin,
    HEIST_LAYOUT_GRID.columns * HEIST_LAYOUT_GRID.cellWidth,
    HEIST_LAYOUT_GRID.rows * HEIST_LAYOUT_GRID.cellHeight,
    HEIST_FLOOR_TEXTURE
  ).setOrigin(0).setDepth(0.1));
  const wallVisuals: WallVisual[] = [];
  for (let index = 0; index < runtimeWallRects.length; index += 1) {
    const rect = runtimeWallRects[index];
    const horizontal = rect.w >= rect.h;
    const magenta = index % 5 === 1;
    const texture = horizontal
      ? magenta ? HEIST_WALL_TEXTURES.horizontalMagenta : HEIST_WALL_TEXTURES.horizontalCyan
      : magenta ? HEIST_WALL_TEXTURES.verticalMagenta : HEIST_WALL_TEXTURES.verticalCyan;
    const frontFacadeTexture = magenta
      ? HEIST_WALL_FACADE_TEXTURES.horizontalMagenta : HEIST_WALL_FACADE_TEXTURES.horizontalCyan;
    const sideFacadeTexture = magenta
      ? HEIST_WALL_FACADE_TEXTURES.verticalMagenta : HEIST_WALL_FACADE_TEXTURES.verticalCyan;
    const cap = scene.add.image(rect.x - HEIST_WALL_PROJECTION_X, rect.y - HEIST_WALL_PROJECTION_Y, texture)
      .setOrigin(0).setDisplaySize(rect.w, rect.h).setDepth(HEIST_WALL_CAP_DEPTH);
    const frontFacade = scene.add.tileSprite(rect.x - HEIST_WALL_PROJECTION_X,
      rect.y + rect.h - HEIST_WALL_PROJECTION_Y,
      rect.w + HEIST_WALL_PROJECTION_X, HEIST_WALL_PROJECTION_Y, frontFacadeTexture)
      .setOrigin(0).setDepth(HEIST_WALL_FACE_DEPTH);
    const facades = [frontFacade];
    if (!horizontal) facades.push(scene.add.tileSprite(rect.x + rect.w - HEIST_WALL_PROJECTION_X,
      rect.y - HEIST_WALL_PROJECTION_Y,
      HEIST_WALL_PROJECTION_X, rect.h + HEIST_WALL_PROJECTION_Y, sideFacadeTexture)
      .setOrigin(0).setDepth(HEIST_WALL_FACE_DEPTH + 0.02));
    wallVisuals.push({ rect, cap, facades });
    staticVisuals.push(cap, ...facades);
  }

  const vault = layout.vaultBounds;
  const vaultGraphics = scene.add.graphics().setDepth(1.1);
  vaultGraphics.fillStyle(0x02060c, 0.92).fillRect(vault.x + 20, vault.y + 20, vault.w - 40, vault.h - 40);
  vaultGraphics.fillStyle(0x0a1824, 0.92).fillRect(vault.x + 44, vault.y + 44, vault.w - 88, vault.h - 88);
  vaultGraphics.lineStyle(4, 0xff4fc9, 0.48).strokeRect(vault.x + 58, vault.y + 58, vault.w - 116, vault.h - 116);
  vaultGraphics.lineStyle(2, 0x54efff, 0.52).strokeRect(vault.x + 82, vault.y + 82, vault.w - 164, vault.h - 164);
  drawHazardStripes(vaultGraphics, vault.x + 70, vault.y + 68, vault.w - 140, 12, 0xffc857, 0.58, 13);
  drawHazardStripes(vaultGraphics, vault.x + 70, vault.y + vault.h - 80, vault.w - 140, 12, 0xff4f77, 0.52, 13);
  staticVisuals.push(vaultGraphics);

  const textObjects = layout.nodes.filter((node) => node.kind === 'facility'
    && (node.column + node.row * 2) % 11 === 0).slice(0, 12).map((node, index) => scene.add.text(
      node.x - 128, node.y - 122,
      index % 3 === 0 ? `RESEARCH SECTOR // ${String(index + 1).padStart(2, '0')}`
        : index % 3 === 1 ? `SECURITY GRID // ${String.fromCharCode(65 + index % 6)}`
          : `MAINTENANCE ACCESS // ${String(index + 3).padStart(2, '0')}`,
      { fontFamily: 'Orbitron, sans-serif', fontSize: '13px', color: index % 2 ? '#8b416f' : '#39788d', letterSpacing: 1 }
    ).setDepth(2));
  textObjects.push(scene.add.text(vault.x + vault.w * 0.5, vault.y + 112,
    'CENTRAL VAULT // PROVISIONAL ASSET STORAGE', {
      fontFamily: 'Orbitron, sans-serif', fontSize: '21px', color: '#ff6ed8', letterSpacing: 2,
      backgroundColor: '#030911d8', padding: { x: 14, y: 7 }
    }).setOrigin(0.5).setDepth(2));

  const decalPlan = createEnvironmentDecalPlan('heist', layout.seed, layout.wallRects, 18);
  for (const decal of decalPlan.decals) textObjects.push(createEnvironmentDecalText(scene, {
    ...decal,
    x: decal.x - HEIST_WALL_PROJECTION_X,
    y: decal.y - HEIST_WALL_PROJECTION_Y
  }).setDepth(HEIST_WALL_CAP_DEPTH + 0.2));

  const zoneVisibility = new HeistZoneVisibility(layout);
  const visibilityLayers = layout.nodes.map((node) => {
    const rect = heistVisibilityZoneRect(layout, node);
    return scene.add.rectangle(rect.x + rect.w * 0.5, rect.y + rect.h * 0.5,
      rect.w + 2, rect.h + 2, 0x01040a, HEIST_ZONE_ALPHA.hidden).setDepth(HEIST_VISIBILITY_DEPTH);
  });

  const walls = scene.physics.add.staticGroup();
  for (const rect of runtimeWallRects) {
    const body = walls.create(rect.x + rect.w * 0.5, rect.y + rect.h * 0.5, 'pixel') as Phaser.Physics.Arcade.Image;
    body.setVisible(false).setDisplaySize(rect.w, rect.h).refreshBody();
  }
  const vaultDoors = scene.physics.add.staticGroup();
  const doorVisuals = layout.vaultDoors.map((spec) => createDoorVisual(scene, vaultDoors, spec));
  const vaultDoor = doorVisuals[0].body;

  const ambientGraphics = scene.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
  const utilityLights = layout.nodes
    .filter((node, index) => (index + node.row * 3 + node.column) % 3 !== 1)
    .slice(0, 56)
    .map((node, index) => ({
      x: node.x + (index % 2 ? 92 : -92),
      y: node.y - (index % 3 === 0 ? 124 : 112),
      color: index % 7 === 0 ? 0xff4dcb : index % 5 === 0 ? 0xffc857 : 0x43edfa,
      vertical: index % 4 === 0,
      phase: index * 0.73
    }));
  let lastAmbientDraw = -1;
  let lastPresentationUpdate = -1_000;
  let escapeGuideActive = false;
  let alertLightingActive = false;
  let guideMarkers: HeistLayoutPoint[] = [];
  let cachedTargetNodeId = '';
  const cachedTargetNext = new Map<string, string>();
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const buildNavigationAdjacency = (includeVault: boolean): Map<string, string[]> => {
    const adjacency = new Map(layout.nodes.map((node) => [node.id, [] as string[]]));
    for (const [a, b] of layout.edges) {
      if (!includeVault && (a === layout.vaultNodeId || b === layout.vaultNodeId)) continue;
      adjacency.get(a)?.push(b);
      adjacency.get(b)?.push(a);
    }
    return adjacency;
  };
  const closedDoorAdjacency = buildNavigationAdjacency(false);
  const openDoorAdjacency = buildNavigationAdjacency(true);
  const navigationQueue: string[] = [];
  const navigationVisited = new Set<string>();
  let doorsOpen = false;

  const rebuildNavigationMap = (targetNodeId: string): void => {
    cachedTargetNodeId = targetNodeId;
    cachedTargetNext.clear();
    navigationQueue.length = 0;
    navigationQueue.push(targetNodeId);
    navigationVisited.clear();
    navigationVisited.add(targetNodeId);
    const adjacency = doorsOpen ? openDoorAdjacency : closedDoorAdjacency;
    for (let read = 0; read < navigationQueue.length; read += 1) {
      const current = navigationQueue[read];
      for (const neighbor of adjacency.get(current) ?? []) {
        if (navigationVisited.has(neighbor)) continue;
        navigationVisited.add(neighbor);
        cachedTargetNext.set(neighbor, current);
        navigationQueue.push(neighbor);
      }
    }
  };

  const setDoorsOpen = (open: boolean): void => {
    if (doorsOpen === open) return;
    doorsOpen = open;
    cachedTargetNodeId = '';
    cachedTargetNext.clear();
    for (const visual of doorVisuals) {
      const { body, firstPanel, secondPanel, seam, status, label, spec } = visual;
      scene.tweens.killTweensOf([firstPanel, secondPanel, seam, status]);
      const horizontal = spec.orientation === 'horizontal';
      if (open) {
        body.disableBody(true, false);
        scene.tweens.add({ targets: firstPanel, x: horizontal ? -spec.width * 0.43 : 0,
          y: horizontal ? 0 : -spec.width * 0.43, duration: HEIST_BALANCE.doorOpenDurationMs, ease: 'Cubic.InOut' });
        scene.tweens.add({ targets: secondPanel, x: horizontal ? spec.width * 0.43 : 0,
          y: horizontal ? 0 : spec.width * 0.43, duration: HEIST_BALANCE.doorOpenDurationMs, ease: 'Cubic.InOut' });
        seam.setAlpha(0.08);
        status.setFillStyle(0x72ff9b, 1);
        label.setText(`VAULT // ${spec.side.toUpperCase()} OPEN`).setColor('#72ff9b');
      } else {
        body.enableBody(false, spec.x, spec.y, true, false);
        body.setDisplaySize(horizontal ? spec.width : HEIST_LAYOUT_GRID.wallThickness,
          horizontal ? HEIST_LAYOUT_GRID.wallThickness : spec.width).refreshBody();
        scene.tweens.add({ targets: firstPanel, x: horizontal ? -(spec.width - 20) * 0.25 : 0,
          y: horizontal ? 0 : -(spec.width - 20) * 0.25, duration: 360, ease: 'Cubic.Out' });
        scene.tweens.add({ targets: secondPanel, x: horizontal ? (spec.width - 20) * 0.25 : 0,
          y: horizontal ? 0 : (spec.width - 20) * 0.25, duration: 360, ease: 'Cubic.Out' });
        seam.setAlpha(0.72);
        status.setFillStyle(0xff4d71, 1);
        label.setText(`VAULT // ${spec.side.toUpperCase()} SEALED`).setColor('#ff72d9');
      }
    }
  };

  if (import.meta.env.DEV) console.debug('[HEIST layout]', {
    seed: layout.seed,
    entry: layout.entryNodeId,
    extraction: layout.extractionNodeId,
    sourceWallRects: layout.wallRects.length,
    runtimeWallRects: runtimeWallRects.length,
    wallIndex: wallPointIndex.diagnostics,
    ...layout.diagnostics
  });

  return {
    layout,
    walls,
    wallRects: runtimeWallRects,
    vaultDoor,
    vaultDoors,
    route: layout.route,
    extractionPoint: { ...layout.extractionPoint },
    containerPoints: layout.containerPoints,
    supportPoints: layout.supportPoints,
    ambushPoints: layout.ambushPoints,
    trapPlacements: layout.trapPlacements,
    diagnostics: {
      identity: 'heist-maze-facility', seed: layout.seed,
      staticGraphicsBatches: 1, liveAmbientBatches: 1, independentAnimationLoops: 1,
      guideMarkerMaximum: 28, utilityLightCount: utilityLights.length, decalCount: decalPlan.decals.length,
      loops: layout.diagnostics.loops, deadEnds: layout.diagnostics.deadEnds,
      sourceWallRects: layout.wallRects.length,
      runtimeWallRects: runtimeWallRects.length,
      staticPhysicsBodies: runtimeWallRects.length + layout.vaultDoors.length,
      wallIndexBuckets: wallPointIndex.diagnostics.bucketCount,
      wallIndexMaximumCandidates: wallPointIndex.diagnostics.maximumCandidatesPerBucket,
      staticTextureObjects: staticVisuals.length,
      visibilityZones: visibilityLayers.length
    },
    setVaultDoorOpen: setDoorsOpen,
    setAlertLighting(active: boolean): void {
      if (alertLightingActive === active) return;
      alertLightingActive = active;
      if (active) zoneVisibility.targetAlpha.fill(0);
      else zoneVisibility.invalidate();
    },
    setEscapeRoute(active: boolean): void {
      escapeGuideActive = active;
      if (!active) guideMarkers = [];
    },
    activateEscapeGuide(playerX: number, playerY: number): void {
      const from = nearestHeistNodeId(layout, playerX, playerY);
      guideMarkers = appendGuideMarkers(heistPathPoints(layout, from, layout.extractionNodeId));
      escapeGuideActive = true;
    },
    isInsideVault(x: number, y: number, padding = 0): boolean {
      return x >= vault.x + padding && x <= vault.x + vault.w - padding
        && y >= vault.y + padding && y <= vault.y + vault.h - padding;
    },
    distanceSquaredToVault(x: number, y: number): number {
      const nearestX = Phaser.Math.Clamp(x, vault.x, vault.x + vault.w);
      const nearestY = Phaser.Math.Clamp(y, vault.y, vault.y + vault.h);
      const dx = x - nearestX;
      const dy = y - nearestY;
      return dx * dx + dy * dy;
    },
    containsWallPoint(x: number, y: number): boolean {
      return wallPointIndex.contains(x, y);
    },
    prepareNavigationTarget(targetX: number, targetY: number): void {
      const targetNodeId = nearestHeistNodeId(layout, targetX, targetY);
      if (targetNodeId !== cachedTargetNodeId) rebuildNavigationMap(targetNodeId);
    },
    navigationTarget(x: number, y: number, targetX: number, targetY: number, out?: HeistLayoutPoint): HeistLayoutPoint {
      const from = nearestHeistNodeId(layout, x, y);
      if (!cachedTargetNodeId) rebuildNavigationMap(nearestHeistNodeId(layout, targetX, targetY));
      const target = cachedTargetNodeId;
      const result = out ?? { x: targetX, y: targetY };
      const next = cachedTargetNext.get(from);
      if (!next || from === target) {
        result.x = targetX;
        result.y = targetY;
        return result;
      }
      const node = nodeById.get(next);
      result.x = node?.x ?? targetX;
      result.y = node?.y ?? targetY;
      return result;
    },
    isPresentationOpenArea(): boolean {
      return alertLightingActive || zoneVisibility.isOpenArea();
    },
    update(now: number, playerX: number, playerY: number): void {
      if (now - lastPresentationUpdate >= 32) {
        lastPresentationUpdate = now;
        if (!alertLightingActive) zoneVisibility.revealAt(playerX, playerY, doorsOpen);
        for (let index = 0; index < visibilityLayers.length; index += 1) {
          const layer = visibilityLayers[index];
          const targetAlpha = alertLightingActive ? 0 : zoneVisibility.targetAlpha[index];
          layer.setAlpha(Phaser.Math.Linear(layer.alpha, targetAlpha, alertLightingActive ? 0.32 : 0.24));
        }
        for (let index = 0; index < wallVisuals.length; index += 1) {
          const visual = wallVisuals[index];
          const rect = visual.rect;
          const nearestX = Math.max(rect.x, Math.min(playerX, rect.x + rect.w));
          const nearestY = Math.max(rect.y, Math.min(playerY, rect.y + rect.h));
          const dx = playerX - nearestX;
          const dy = playerY - nearestY;
          const projectedOverlap = playerX >= rect.x - HEIST_WALL_PROJECTION_X - 38
            && playerX <= rect.x + rect.w + 38
            && playerY >= rect.y - HEIST_WALL_PROJECTION_Y - 44
            && playerY <= rect.y + rect.h + 46;
          const foreground = projectedOverlap && dx * dx + dy * dy <= 104 * 104
            && rect.y + rect.h >= playerY - 18;
          const targetCapAlpha = foreground ? 0.34 : 1;
          const targetFaceAlpha = foreground ? 0.18 : 1;
          visual.cap.setAlpha(Phaser.Math.Linear(visual.cap.alpha, targetCapAlpha, 0.3));
          for (let facadeIndex = 0; facadeIndex < visual.facades.length; facadeIndex += 1) {
            const facade = visual.facades[facadeIndex];
            facade.setAlpha(Phaser.Math.Linear(facade.alpha, targetFaceAlpha, 0.3));
          }
        }
      }
      if (now - lastAmbientDraw < 90) return;
      lastAmbientDraw = now;
      ambientGraphics.clear();
      const pulse = alertLightingActive ? 0.88 + Math.sin(now * 0.0014) * 0.12
        : 0.5 + Math.sin(now * 0.0011) * 0.5;
      for (let index = 0; index < utilityLights.length; index += 1) {
        const light = utilityLights[index];
        // Infiltration banks breathe slowly and independently, with a rare
        // short brownout. Alert mode is stable, bright, and combat-readable.
        const brownoutCycle = (now + index * 1_337) % (6_800 + index % 5 * 430);
        const brownout = !alertLightingActive && brownoutCycle < 170;
        const localPulse = alertLightingActive ? 0.9 + Math.sin(now * 0.0015 + light.phase) * 0.1
          : brownout ? 0.08 : 0.32 + Math.sin(now * 0.00072 + light.phase) * 0.22;
        const width = light.vertical ? 3 : 34;
        const height = light.vertical ? 24 : 3;
        ambientGraphics.fillStyle(0x01050a, 0.82)
          .fillRect(light.x - width * 0.5 - 3, light.y - height * 0.5 - 3, width + 6, height + 6);
        ambientGraphics.fillStyle(light.color, (alertLightingActive ? 0.28 : 0.08) + localPulse * (alertLightingActive ? 0.28 : 0.18))
          .fillRect(light.x - width * 0.5, light.y - height * 0.5, width, height);
        if (index % 5 === 0) {
          ambientGraphics.fillStyle(light.color, (alertLightingActive ? 0.07 : 0.025) + pulse * (alertLightingActive ? 0.055 : 0.025))
            .fillCircle(light.x, light.y, 18 + localPulse * 5);
        }
      }
      if (!escapeGuideActive) return;
      const sequence = Math.floor(now / 170);
      for (let index = 0; index < guideMarkers.length; index += 1) {
        const marker = guideMarkers[index];
        const active = (index - sequence + 700) % 6 === 0;
        ambientGraphics.fillStyle(active ? 0xc8ffe5 : 0x46ffad, active ? 0.58 : 0.12)
          .fillRoundedRect(marker.x - (active ? 5 : 3), marker.y - 1.5, active ? 10 : 6, 3, 1);
      }
    },
    destroy(): void {
      scene.tweens.killTweensOf(doorVisuals.flatMap((visual) => [visual.firstPanel, visual.secondPanel, visual.seam, visual.status]));
      for (const visual of staticVisuals) visual.destroy();
      for (const layer of visibilityLayers) layer.destroy();
      ambientGraphics.destroy();
      for (const label of textObjects) label.destroy();
      for (const visual of doorVisuals) visual.root.destroy(true);
      walls.destroy(true);
      vaultDoors.destroy(true);
      guideMarkers = [];
      cachedTargetNext.clear();
      navigationQueue.length = 0;
      navigationVisited.clear();
      wallVisuals.length = 0;
    }
  };
};
