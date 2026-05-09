import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pickQuestion } from './questions.js';

window.__gameBooted = true;

// ====================================================================
// CONSTANTS
// ====================================================================
const PLAYER_EYE = 1.7;
const PLAYER_RADIUS = 0.28;
const TILE_SIZE = 1.6;
const TILE_THICKNESS = 0.07;
const TILE_GAP = 0.04;
const TILE_NEON_COLOR = 0x70f6ff;
const BRIDGE_COLS = 3;
const BRIDGE_ROWS = 7;
const PLATFORM_SIZE = 9.5;
const MOUSE_SENS = 0.0022;
const STEP_MOVE_MS = 460;
const FRAGILE_BASE_SECONDS = 8;
const FRAGILE_EXTRA_MIN_SECONDS = 1;
const FRAGILE_EXTRA_MAX_SECONDS = 6;
const FALL_DURATION_MS = 2400;
const CITY_TARGET_TOP_Y = 60;
const PLATFORM_Y = 32;

// ====================================================================
// RENDERER / SCENE / CAMERA
// ====================================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);
scene.fog = new THREE.FogExp2(0x0b1424, 0.0026);

const camera = new THREE.PerspectiveCamera(
  74,
  window.innerWidth / window.innerHeight,
  0.1,
  8000,
);

// ====================================================================
// LIGHTS
// ====================================================================
scene.add(new THREE.HemisphereLight(0x39547a, 0x06080d, 0.55));

const moon = new THREE.DirectionalLight(0xb8caea, 0.6);
moon.position.set(220, 480, 180);
scene.add(moon);

const warmBounce = new THREE.HemisphereLight(0xff9b58, 0x000000, 0.18);
warmBounce.position.set(0, -1, 0);
scene.add(warmBounce);

const envScene = new THREE.Scene();
{
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x0b1730, side: THREE.BackSide }),
  );
  envScene.add(top);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 6, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff7a3c,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  band.position.y = -2;
  envScene.add(band);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 1.5, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd28a, side: THREE.BackSide }),
  );
  rim.position.y = -3;
  envScene.add(rim);
}

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(envScene, 0.04).texture;
scene.environment = envTex;
pmrem.dispose();

// ====================================================================
// GAME STATE
// ====================================================================
const STATE = {
  cityRoot: null,
  bridgeGroup: null,
  startPlatform: null,
  targetPlatform: null,
  staticBuilt: false,

  tiles: [],
  tileMeta: [],
  safePath: [],
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  bridgeStart: new THREE.Vector3(),
  bridgeEnd: new THREE.Vector3(),
  bridgeLength: 0,
  forwardDir: new THREE.Vector3(),
  rightDir: new THREE.Vector3(),
  bridgeYaw: 0,
  groundY: 0,

  player: {
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
  },
  pointerLocked: false,
  cameraDragging: false,

  step: 0,
  currentQuestion: null,
  questionLocked: false,
  playerCell: { row: -1, col: Math.floor(BRIDGE_COLS / 2) },
  moving: false,
  moveStart: 0,
  moveFrom: new THREE.Vector3(),
  moveTo: new THREE.Vector3(),
  moveTargetCell: { row: -1, col: Math.floor(BRIDGE_COLS / 2) },
  dangerWarningStrength: 0,

  intro: true,
  active: false,
  falling: false,
  won: false,
  fallVel: new THREE.Vector3(),
  fallStart: 0,

  aviationLights: [],
};

// ====================================================================
// CITY LOAD
// ====================================================================
const loadingBar = document.getElementById('loading-bar');
const loadingEl = document.getElementById('loading');
const loadingText = document.querySelector('.loading-text');

function setLoadingText(msg) {
  if (loadingText) loadingText.textContent = msg;
}

function clearBootWatchdogs() {
  if (window.__loadingWatchdog) {
    clearTimeout(window.__loadingWatchdog);
    window.__loadingWatchdog = null;
  }
  if (window.__bootWatchdog) {
    clearTimeout(window.__bootWatchdog);
    window.__bootWatchdog = null;
  }
}

function fitCity(cityRoot, targetTopY = CITY_TARGET_TOP_Y) {
  const tmpBox = new THREE.Box3().setFromObject(cityRoot);
  const csize = tmpBox.getSize(new THREE.Vector3()).length();
  if (csize > 0) cityRoot.scale.setScalar(900 / csize);

  cityRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(cityRoot);
  const c = box.getCenter(new THREE.Vector3());
  cityRoot.position.x -= c.x;
  cityRoot.position.z -= c.z;
  cityRoot.position.y -= box.max.y - targetTopY;
  cityRoot.updateMatrixWorld(true);
}

function makeFallbackCity() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x070912, roughness: 1.0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -200;
  g.add(ground);

  for (let i = 0; i < 180; i++) {
    const w = 8 + Math.random() * 18;
    const d = 8 + Math.random() * 18;
    const h = 30 + Math.random() * 220;
    const x = (Math.random() - 0.5) * 800;
    const z = (Math.random() - 0.5) * 800;
    if (Math.hypot(x, z) < 35) continue;

    const m = new THREE.MeshStandardMaterial({
      color: 0x1c2030,
      roughness: 0.7,
      metalness: 0.3,
      emissive: 0x4a5a82,
      emissiveIntensity: 0.06,
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, h / 2 - 200, z);
    g.add(b);
  }

  return g;
}

function mountCity(cityRoot) {
  if (STATE.cityRoot) {
    scene.remove(STATE.cityRoot);
    disposeObject(STATE.cityRoot);
  }
  STATE.cityRoot = cityRoot;
  scene.add(cityRoot);
}

function bootScene() {
  try {
    const fallback = makeFallbackCity();
    fitCity(fallback);
    mountCity(fallback);
    initStaticScene();
    showIntro();
    loadingBar.style.width = '100%';
    loadingEl.classList.add('hidden');
    clearBootWatchdogs();
    return true;
  } catch (err) {
    console.error('Initial scene boot failed', err);
    setLoadingText('Не удалось построить сцену. Обнови страницу.');
    return false;
  }
}

function loadRealCityInBackground() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    'la_night_2k.glb',
    (gltf) => {
      if (!STATE.intro) {
        console.info('Real city loaded after intro ended; keeping fallback for this run.');
        disposeObject(gltf.scene);
        return;
      }
      try {
        fitCity(gltf.scene);
        mountCity(gltf.scene);
        console.info('Upgraded to real city.');
      } catch (err) {
        console.error('Real city swap failed; keeping fallback.', err);
      }
    },
    undefined,
    (err) => {
      console.warn('Real city failed to load; staying on fallback.', err);
    },
  );
}

// ====================================================================
// PLATFORM POSITIONS (fixed — no longer derived from city geometry)
// ====================================================================
function pickPlatformPositions() {
  const halfDist = (BRIDGE_ROWS * (TILE_SIZE + TILE_GAP) + PLATFORM_SIZE) / 2;
  return [
    { x: -halfDist, y: PLATFORM_Y, z: 0 },
    { x: halfDist, y: PLATFORM_Y, z: 0 },
  ];
}

// ====================================================================
// ROOF PLATFORM
// ====================================================================
function makeRoofPlatform(isTarget) {
  const g = new THREE.Group();
  const size = PLATFORM_SIZE;

  const towerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7f9fbd,
    roughness: 0.2,
    metalness: 0.0,
    transparent: true,
    opacity: 0.24,
    transmission: 0.35,
    thickness: 1.2,
    ior: 1.35,
    clearcoat: 0.6,
    envMapIntensity: 1.2,
    depthWrite: false,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x191b21,
    roughness: 0.42,
    metalness: 0.9,
  });
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0x94b4ce,
    roughness: 0.18,
    metalness: 0.0,
    transparent: true,
    opacity: 0.28,
    transmission: 0.45,
    thickness: 0.4,
    clearcoat: 0.8,
    envMapIntensity: 1.4,
    depthWrite: false,
  });
  const darkPanelMat = new THREE.MeshPhysicalMaterial({
    color: 0x6f879d,
    roughness: 0.24,
    metalness: 0.0,
    transparent: true,
    opacity: 0.18,
    transmission: 0.35,
    thickness: 0.4,
    clearcoat: 0.65,
    envMapIntensity: 1.1,
    depthWrite: false,
  });

  // A glass shaft keeps the spawn building readable without blocking the city below.
  const slabH = 92.0;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(size, slabH, size),
    towerGlassMat,
  );
  slab.position.y = -slabH / 2 - 0.05;
  slab.renderOrder = 1;
  g.add(slab);

  const cells = 4;
  const cellSize = (size - 0.4) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(cellSize - 0.05, 0.06, cellSize - 0.05),
        (i + j) % 2 === 0 ? panelMat : darkPanelMat,
      );
      tile.position.x = -size / 2 + 0.2 + cellSize / 2 + i * cellSize;
      tile.position.z = -size / 2 + 0.2 + cellSize / 2 + j * cellSize;
      tile.position.y = 0.03;
      g.add(tile);
    }
  }

  const fasciaH = 0.6;
  const fThick = 0.18;
  const fSides = [
    [size, fasciaH, fThick, 0, -0.05, size / 2 - fThick / 2],
    [size, fasciaH, fThick, 0, -0.05, -size / 2 + fThick / 2],
    [fThick, fasciaH, size, size / 2 - fThick / 2, -0.05, 0],
    [fThick, fasciaH, size, -size / 2 + fThick / 2, -0.05, 0],
  ];
  for (const [w, h, d, x, y, z] of fSides) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
    m.position.set(x, y, z);
    g.add(m);
  }

  const ac = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.8, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0x40444c,
      roughness: 0.55,
      metalness: 0.7,
    }),
  );
  ac.position.set(-size / 2 + 1.4, 0.4, -size / 2 + 0.9);
  g.add(ac);

  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.5, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x080a0e }),
  );
  vent.position.set(-size / 2 + 1.4, 0.4, -size / 2 + 1.42);
  g.add(vent);

  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), metalMat);
  hatch.position.set(size / 2 - 1.2, 0.06, size / 2 - 1.6);
  g.add(hatch);

  const aviBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  );
  aviBulb.position.set(size / 2 - 0.6, 0.85, size / 2 - 0.6);
  g.add(aviBulb);

  const aviLight = new THREE.PointLight(0xff3030, 0.5, 6);
  aviLight.position.copy(aviBulb.position);
  g.add(aviLight);
  STATE.aviationLights.push({
    bulb: aviBulb,
    light: aviLight,
    phase: Math.random() * Math.PI * 2,
  });

  if (isTarget) {
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x6da3e6 });
    const stripsConf = [
      [size - 1.6, 0.04, 0.06, 0, 0.06, size / 2 - 0.55],
      [size - 1.6, 0.04, 0.06, 0, 0.06, -size / 2 + 0.55],
      [0.06, 0.04, size - 1.6, size / 2 - 0.55, 0.06, 0],
      [0.06, 0.04, size - 1.6, -size / 2 + 0.55, 0.06, 0],
    ];
    for (const [w, h, d, x, y, z] of stripsConf) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stripMat);
      s.position.set(x, y, z);
      g.add(s);
    }

    const pl = new THREE.PointLight(0x6da3e6, 0.4, 6);
    pl.position.set(0, 1.2, 0);
    g.add(pl);
  }

  return g;
}

// ====================================================================
// GLASS TILE
// ====================================================================
let tileEdgeGlowTexture = null;

function getTileEdgeGlowTexture() {
  if (tileEdgeGlowTexture) return tileEdgeGlowTexture;

  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const inset = 58;
  const rectSize = size - inset * 2;

  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let i = 0; i < 20; i++) {
    const p = i / 17;
    const alpha = 0.042 * (1 - p) ** 1.45;
    ctx.strokeStyle = `rgba(112, 246, 255, ${alpha})`;
    ctx.lineWidth = 108 - p * 92;
    ctx.strokeRect(inset, inset, rectSize, rectSize);
  }

  ctx.strokeStyle = 'rgba(202, 255, 255, 0.54)';
  ctx.lineWidth = 6;
  ctx.strokeRect(inset, inset, rectSize, rectSize);

  ctx.strokeStyle = 'rgba(112, 246, 255, 0.28)';
  ctx.lineWidth = 22;
  ctx.strokeRect(inset, inset, rectSize, rectSize);

  tileEdgeGlowTexture = new THREE.CanvasTexture(c);
  tileEdgeGlowTexture.colorSpace = THREE.SRGBColorSpace;
  tileEdgeGlowTexture.minFilter = THREE.LinearMipmapLinearFilter;
  tileEdgeGlowTexture.magFilter = THREE.LinearFilter;
  tileEdgeGlowTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tileEdgeGlowTexture.needsUpdate = true;
  return tileEdgeGlowTexture;
}

function makeGlassTile(fragile) {
  const g = new THREE.Group();
  const baseColor = 0xc8ddf3;
  const roughness = 0.035;
  const opacity = 0.16;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    metalness: 0.0,
    roughness,
    transparent: true,
    opacity,
    transmission: 0.72,
    thickness: 0.38,
    attenuationColor: 0xdceeff,
    attenuationDistance: 1.8,
    ior: 1.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
    envMapIntensity: 1.8,
    depthWrite: false,
  });

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE),
    glassMat,
  );
  g.add(glass);
  g.userData.glass = glass;
  g.userData.glassMat = glassMat;
  g.userData.fragile = fragile;
  g.userData.baseColor = new THREE.Color(baseColor);
  g.userData.neonMats = [];
  g.userData.neonLights = [];

  const edgeGlowMat = new THREE.MeshBasicMaterial({
    color: TILE_NEON_COLOR,
    map: getTileEdgeGlowTexture(),
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  g.userData.neonMats.push(edgeGlowMat);

  const edgeGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(TILE_SIZE + 0.36, TILE_SIZE + 0.36),
    edgeGlowMat,
  );
  edgeGlow.rotation.x = -Math.PI / 2;
  edgeGlow.position.y = TILE_THICKNESS / 2 + 0.024;
  edgeGlow.renderOrder = 2;
  g.add(edgeGlow);
  g.userData.edgeGlow = edgeGlow;

  const softLight = new THREE.PointLight(TILE_NEON_COLOR, 0.052, 2.8, 2.0);
  softLight.position.set(0, 0.24, 0);
  g.add(softLight);
  g.userData.neonLights.push(softLight);

  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f25,
    roughness: 0.4,
    metalness: 0.92,
  });
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of corners) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8),
      mountMat,
    );
    m.position.set(
      sx * (TILE_SIZE / 2 - 0.1),
      -TILE_THICKNESS / 2 - 0.06,
      sz * (TILE_SIZE / 2 - 0.1),
    );
    g.add(m);
  }

  const cracks = new THREE.Group();
  const ny = TILE_THICKNESS / 2 + 0.0015;
  for (let r = 0; r < 7; r++) {
    const angle0 = (r / 7) * Math.PI * 2 + Math.random() * 0.4;
    const pts = [new THREE.Vector3(0, ny, 0)];
    let x = 0;
    let z = 0;
    let len = 0;
    for (let s = 0; s < 5; s++) {
      const seg = 0.08 + Math.random() * 0.07;
      len += seg;
      const a = angle0 + (Math.random() - 0.5) * 0.7;
      x = Math.cos(a) * len;
      z = Math.sin(a) * len;
      if (Math.abs(x) > TILE_SIZE / 2 - 0.05) {
        x = Math.sign(x) * (TILE_SIZE / 2 - 0.05);
      }
      if (Math.abs(z) > TILE_SIZE / 2 - 0.05) {
        z = Math.sign(z) * (TILE_SIZE / 2 - 0.05);
      }
      pts.push(new THREE.Vector3(x, ny, z));
    }

    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({
        color: 0xeaf2ff,
        transparent: true,
        opacity: 0,
      }),
    );
    cracks.add(line);
  }
  g.add(cracks);
  g.userData.cracks = cracks;

  return g;
}

// ====================================================================
// SAFE PATH
// ====================================================================
function generateSafePath() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const path = [];
    let col = Math.floor(Math.random() * BRIDGE_COLS);
    let turns = 0;
    let sameRun = 1;
    path.push(col);

    for (let row = 1; row < BRIDGE_ROWS; row++) {
      const moves = [-1, 0, 1].filter((move) => {
        const next = col + move;
        if (next < 0 || next >= BRIDGE_COLS) return false;
        if (move === 0 && sameRun >= 2) return false;
        return true;
      });
      const lateralMoves = moves.filter((move) => move !== 0);
      const pool =
        lateralMoves.length && Math.random() < 0.72 ? lateralMoves : moves;
      const move = pool[Math.floor(Math.random() * pool.length)];
      if (move === 0) sameRun += 1;
      else {
        sameRun = 1;
        turns += 1;
      }
      col += move;
      path.push(col);
    }

    const uniqueCols = new Set(path).size;
    if (turns >= 3 && uniqueCols > 1) return path;
  }

  return [1, 0, 1, 2, 1, 0, 1].slice(0, BRIDGE_ROWS);
}

// ====================================================================
// BRIDGE
// ====================================================================
function buildBridge(start, end) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const dirN = dir.clone().normalize();
  const right = new THREE.Vector3()
    .crossVectors(dirN, new THREE.Vector3(0, 1, 0))
    .normalize();
  const yaw = Math.atan2(dirN.x, dirN.z);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.4,
    metalness: 0.9,
    envMapIntensity: 1.0,
  });

  const totalWidth = BRIDGE_COLS * TILE_SIZE + (BRIDGE_COLS - 1) * TILE_GAP;
  const railOffset = totalWidth / 2 + 0.12;
  for (const sign of [-1, 1]) {
    const sideBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.12, length),
      frameMat,
    );
    sideBeam.position
      .copy(start)
      .addScaledVector(dir, 0.5)
      .addScaledVector(right, sign * railOffset);
    sideBeam.position.y -= TILE_THICKNESS / 2 + 0.08;
    sideBeam.rotation.y = yaw;
    group.add(sideBeam);
  }

  for (let i = 0; i <= BRIDGE_ROWS; i++) {
    const p = start.clone().lerp(end, i / BRIDGE_ROWS);
    for (const sign of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 1.3, 0.07),
        frameMat,
      );
      post.position.copy(p).addScaledVector(right, sign * railOffset);
      post.position.y += 0.6;
      group.add(post);
    }
  }

  for (const sign of [-1, 1]) {
    const cable = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, length),
      frameMat,
    );
    cable.position
      .copy(start)
      .addScaledVector(dir, 0.5)
      .addScaledVector(right, sign * railOffset);
    cable.position.y += 1.25;
    cable.rotation.y = yaw;
    group.add(cable);
  }

  const safePath = generateSafePath();
  STATE.safePath = safePath.slice();
  STATE.tiles.length = 0;
  STATE.tileMeta.length = 0;

  const cellLen = length / BRIDGE_ROWS;
  for (let row = 0; row < BRIDGE_ROWS; row++) {
    const forward = (row + 0.5) * cellLen;
    for (let colIdx = 0; colIdx < BRIDGE_COLS; colIdx++) {
      const fragile = colIdx !== safePath[row];
      const lateral =
        (colIdx - (BRIDGE_COLS - 1) / 2) * (TILE_SIZE + TILE_GAP);
      const center = start
        .clone()
        .addScaledVector(dirN, forward)
        .addScaledVector(right, lateral);

      const tile = makeGlassTile(fragile);
      tile.position.copy(center);
      tile.position.y = start.y;
      tile.rotation.y = yaw;
      tile.userData.baseY = tile.position.y;
      group.add(tile);

      STATE.tiles.push(tile);
      STATE.tileMeta.push({
        row,
        col: colIdx,
        fragile,
        crackProgress: 0,
        broken: false,
        triggered: false,
        triggerTime: 0,
        dangerDuration: 0,
      });
    }
  }

  for (let i = 1; i < BRIDGE_ROWS; i++) {
    const p = start.clone().lerp(end, i / BRIDGE_ROWS);
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(totalWidth + 0.4, 0.06, 0.06),
      frameMat,
    );
    brace.position.copy(p);
    brace.position.y -= TILE_THICKNESS / 2 + 0.04;
    brace.rotation.y = yaw;
    group.add(brace);
  }

  group.userData.start = start.clone();
  group.userData.end = end.clone();
  group.userData.dir = dirN.clone();
  group.userData.right = right.clone();
  group.userData.yaw = yaw;
  group.userData.length = length;

  return group;
}

// ====================================================================
// SCENE INIT / RESTART
// ====================================================================
function initStaticScene() {
  if (STATE.staticBuilt) return;

  const [s, t] = pickPlatformPositions();
  const yLevel = (s.y + t.y) / 2;
  STATE.startPos.set(s.x, yLevel, s.z);
  STATE.endPos.set(t.x, yLevel, t.z);

  const dir = new THREE.Vector3()
    .subVectors(STATE.endPos, STATE.startPos)
    .normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  STATE.forwardDir.copy(dir);
  STATE.rightDir
    .crossVectors(dir, new THREE.Vector3(0, 1, 0))
    .normalize();
  STATE.bridgeYaw = yaw;
  STATE.groundY = yLevel;

  const platHalf = PLATFORM_SIZE / 2;
  STATE.bridgeStart.copy(STATE.startPos).addScaledVector(dir, platHalf);
  STATE.bridgeEnd.copy(STATE.endPos).addScaledVector(dir, -platHalf);
  STATE.bridgeLength = STATE.bridgeStart.distanceTo(STATE.bridgeEnd);

  const sp = makeRoofPlatform(false);
  sp.position.copy(STATE.startPos);
  sp.rotation.y = yaw;
  scene.add(sp);
  STATE.startPlatform = sp;

  const tp = makeRoofPlatform(true);
  tp.position.copy(STATE.endPos);
  tp.rotation.y = yaw;
  scene.add(tp);
  STATE.targetPlatform = tp;

  STATE.bridgeGroup = buildBridge(STATE.bridgeStart, STATE.bridgeEnd);
  scene.add(STATE.bridgeGroup);

  spawnAviationLightsOnSkyline();
  STATE.staticBuilt = true;
  resetPlayer();
}

function softRestart() {
  if (STATE.bridgeGroup) {
    scene.remove(STATE.bridgeGroup);
    disposeObject(STATE.bridgeGroup);
  }

  STATE.bridgeGroup = buildBridge(STATE.bridgeStart, STATE.bridgeEnd);
  scene.add(STATE.bridgeGroup);

  STATE.falling = false;
  STATE.won = false;
  STATE.fallVel.set(0, 0, 0);

  resetPlayer();
  gameoverEl.classList.add('hidden');
  enterPlay();
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function resetPlayer() {
  STATE.step = 0;
  STATE.currentQuestion = null;
  STATE.questionLocked = false;
  STATE.moving = false;
  STATE.playerCell.row = -1;
  STATE.playerCell.col = Math.floor(BRIDGE_COLS / 2);
  STATE.moveTargetCell.row = STATE.playerCell.row;
  STATE.moveTargetCell.col = STATE.playerCell.col;
  STATE.player.pos.copy(cellWorldPosition(STATE.playerCell.row, STATE.playerCell.col));
  STATE.player.yaw = Math.atan2(-STATE.forwardDir.x, -STATE.forwardDir.z);
  STATE.player.pitch = -0.05;
  quizEl?.classList.add('hidden');
  setDangerWarning(0);
  updateHudProgress();
}

// ====================================================================
// AVIATION LIGHTS
// ====================================================================
function spawnAviationLightsOnSkyline() {
  const bbox = new THREE.Box3().setFromObject(STATE.cityRoot);
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);

  let placed = 0;
  const maxLights = 16;
  for (let attempt = 0; attempt < 80 && placed < maxLights; attempt++) {
    const x = THREE.MathUtils.lerp(
      bbox.min.x + 30,
      bbox.max.x - 30,
      Math.random(),
    );
    const z = THREE.MathUtils.lerp(
      bbox.min.z + 30,
      bbox.max.z - 30,
      Math.random(),
    );
    if (Math.hypot(x - STATE.startPos.x, z - STATE.startPos.z) < 25) continue;
    if (Math.hypot(x - STATE.endPos.x, z - STATE.endPos.z) < 25) continue;

    ray.ray.origin.set(x, bbox.max.y + 200, z);
    const hits = ray.intersectObject(STATE.cityRoot, true);
    if (!hits.length) continue;

    const y = hits[0].point.y + 0.5;
    if (y < bbox.min.y + (bbox.max.y - bbox.min.y) * 0.4) continue;

    const isWhite = Math.random() < 0.25;
    const color = isWhite ? 0xffffff : 0xff3030;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color }),
    );
    bulb.position.set(x, y, z);
    scene.add(bulb);

    const pl = new THREE.PointLight(color, 0.5, 12);
    pl.position.copy(bulb.position);
    scene.add(pl);

    STATE.aviationLights.push({
      bulb,
      light: pl,
      phase: Math.random() * Math.PI * 2,
      white: isWhite,
    });
    placed++;
  }
}

// ====================================================================
// UI
// ====================================================================
const hud = document.getElementById('hud');
const intro = document.getElementById('intro');
const startBtn = document.getElementById('start-btn');
const quizEl = document.getElementById('quiz');
const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const timerFill = document.getElementById('timer-fill');
const timerLabel = document.getElementById('timer-label');
const hintEl = document.getElementById('hint');
const stepNumber = document.getElementById('step-number');
const stepTotal = document.getElementById('step-total');
const altitudeEl = document.getElementById('altitude');
const gameoverEl = document.getElementById('gameover');
const endTitle = document.getElementById('endtitle');
const endText = document.getElementById('endtext');
const restartBtn = document.getElementById('restart');
const dangerWarning = document.getElementById('danger-warning');
const moveControls = document.getElementById('move-controls');
if (quizEl) quizEl.classList.add('hidden');
if (timerFill) timerFill.style.transform = 'scaleX(1)';
if (timerLabel) timerLabel.textContent = '';
if (hintEl) hintEl.textContent = 'Ответ откроет следующий шаг. Время стекла не показывается.';

function setDangerWarning(strength) {
  STATE.dangerWarningStrength = THREE.MathUtils.clamp(strength, 0, 1);
  if (!dangerWarning) return;

  const pulse = (Math.sin(performance.now() * 0.003) + 1) * 0.5;
  const opacity = STATE.dangerWarningStrength <= 0
    ? 0
    : 0.18 + STATE.dangerWarningStrength * 0.62 + pulse * 0.08;
  const blur = THREE.MathUtils.lerp(2.6, 0.1, STATE.dangerWarningStrength);
  const glow = 0.12 + STATE.dangerWarningStrength * 0.5 + pulse * 0.12;

  dangerWarning.style.opacity = String(Math.min(opacity, 0.88));
  dangerWarning.style.filter = `blur(${blur.toFixed(2)}px)`;
  dangerWarning.style.textShadow =
    `0 0 16px rgba(255, 45, 55, ${glow.toFixed(2)}), ` +
    `0 0 48px rgba(255, 45, 55, ${(glow * 0.5).toFixed(2)})`;
}

function updateHudProgress() {
  const currentRow = Math.max(0, Math.min(BRIDGE_ROWS, STATE.playerCell.row + 1));
  stepNumber.textContent = String(currentRow);
  stepTotal.textContent = String(BRIDGE_ROWS);
}

function setOptionsDisabled(disabled) {
  optionsEl.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

function clearQuestion() {
  STATE.currentQuestion = null;
  STATE.questionLocked = false;
  quizEl.classList.add('hidden');
  moveControls?.classList.remove('locked');
}

function startQuestion() {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;
  if (STATE.playerCell.row < 0 || STATE.playerCell.row >= BRIDGE_ROWS) return;

  STATE.currentQuestion = pickQuestion();
  STATE.questionLocked = false;

  questionEl.textContent = STATE.currentQuestion.q.replace('___', '_____');
  optionsEl.innerHTML = '';
  STATE.currentQuestion.options.forEach((option, idx) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.textContent = option;
    button.addEventListener('click', () => onAnswer(idx, button));
    optionsEl.appendChild(button);
  });

  quizEl.classList.remove('shake');
  quizEl.classList.remove('hidden');
  moveControls?.classList.add('locked');
}

function damageCurrentTile(amount) {
  const idx = currentTileIndex();
  if (idx < 0) return false;

  const meta = STATE.tileMeta[idx];
  meta.crackProgress = Math.min(1, meta.crackProgress + amount);
  if (meta.fragile) armFragileTile(idx);

  if (meta.crackProgress >= 1) {
    breakTile(idx);
    triggerFall();
    return true;
  }

  return false;
}

function onAnswer(idx, button) {
  if (!STATE.active || STATE.questionLocked || !STATE.currentQuestion) return;

  STATE.questionLocked = true;
  setOptionsDisabled(true);

  if (STATE.currentQuestion.correct === idx) {
    button.classList.add('correct');
    setTimeout(() => {
      if (!STATE.active || STATE.falling || STATE.won) return;
      clearQuestion();
    }, 220);
    return;
  }

  button.classList.add('wrong');
  quizEl.classList.remove('shake');
  void quizEl.offsetWidth;
  quizEl.classList.add('shake');

  const fell = damageCurrentTile(0.32);
  if (fell) return;

  setTimeout(() => {
    if (!STATE.active || STATE.falling || STATE.won) return;
    startQuestion();
  }, 620);
}

function enterPlay() {
  intro.classList.add('hidden');
  hud.classList.remove('hidden');
  moveControls?.classList.remove('hidden');
  moveControls?.classList.remove('locked');
  quizEl.classList.add('hidden');
  STATE.currentQuestion = null;
  STATE.questionLocked = false;
  STATE.intro = false;
  STATE.active = true;
  setDangerWarning(0);
  updateHudProgress();
}

function showIntro() {
  stepTotal.textContent = String(BRIDGE_ROWS);
  stepNumber.textContent = '0';
  intro.classList.remove('hidden');
  STATE.intro = true;
  STATE.active = false;
  STATE.currentQuestion = null;
  STATE.questionLocked = false;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  moveControls?.classList.remove('locked');
  setDangerWarning(0);
}

startBtn.addEventListener('click', () => {
  enterPlay();
});

restartBtn.addEventListener('click', () => {
  softRestart();
});

// ====================================================================
// INPUT
// ====================================================================
canvas.addEventListener('pointerdown', (e) => {
  if (!STATE.active || STATE.falling || STATE.won) return;
  STATE.cameraDragging = true;
  canvas.setPointerCapture?.(e.pointerId);
});

window.addEventListener('pointerup', () => {
  STATE.cameraDragging = false;
});

document.addEventListener('pointerlockchange', () => {
  STATE.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (!STATE.pointerLocked && !STATE.cameraDragging) return;
  STATE.player.yaw -= e.movementX * MOUSE_SENS;
  STATE.player.pitch -= e.movementY * MOUSE_SENS;
  STATE.player.pitch = THREE.MathUtils.clamp(STATE.player.pitch, -1.35, 1.35);
});

const keyMoves = new Map([
  ['ArrowUp', 'forward'],
  ['KeyW', 'forward'],
  ['ArrowDown', 'back'],
  ['KeyS', 'back'],
  ['ArrowLeft', 'left'],
  ['KeyA', 'left'],
  ['ArrowRight', 'right'],
  ['KeyD', 'right'],
]);

document.addEventListener('keydown', (e) => {
  const command = keyMoves.get(e.code);
  if (!command) return;
  e.preventDefault();
  requestMove(command);
});

moveControls?.querySelectorAll('[data-move]').forEach((button) => {
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    requestMove(button.dataset.move);
  });
});

// ====================================================================
// SUPPORT LOOKUPS
// ====================================================================
function getTileAt(pos) {
  const local = pos.clone().sub(STATE.bridgeStart);
  const f = local.dot(STATE.forwardDir);
  const rt = local.dot(STATE.rightDir);
  if (f < -PLAYER_RADIUS || f > STATE.bridgeLength + PLAYER_RADIUS) return null;

  const totalWidth = BRIDGE_COLS * TILE_SIZE + (BRIDGE_COLS - 1) * TILE_GAP;
  const halfW = totalWidth / 2;
  if (rt < -halfW - PLAYER_RADIUS * 0.3 || rt > halfW + PLAYER_RADIUS * 0.3) {
    return null;
  }

  const cellLen = STATE.bridgeLength / BRIDGE_ROWS;
  const row = Math.max(
    0,
    Math.min(BRIDGE_ROWS - 1, Math.floor(f / cellLen)),
  );
  const colFloat = (rt + halfW) / (TILE_SIZE + TILE_GAP);
  const col = Math.max(
    0,
    Math.min(BRIDGE_COLS - 1, Math.floor(colFloat)),
  );

  const localInCol = colFloat - col;
  const colWidthRel = TILE_SIZE / (TILE_SIZE + TILE_GAP);
  if (localInCol > colWidthRel + PLAYER_RADIUS * 0.08) return null;

  return { row, col, idx: row * BRIDGE_COLS + col };
}

function isOnPlatform(pos, plPos) {
  const delta = pos.clone().sub(plPos);
  const lateral = delta.dot(STATE.rightDir);
  const forward = delta.dot(STATE.forwardDir);
  const half = PLATFORM_SIZE / 2 + PLAYER_RADIUS;
  return Math.abs(lateral) < half && Math.abs(forward) < half;
}

// ====================================================================
// GAME UPDATE
// ====================================================================
function columnLateral(col) {
  return (col - (BRIDGE_COLS - 1) / 2) * (TILE_SIZE + TILE_GAP);
}

function cellWorldPosition(row, col) {
  const safeCol = Math.max(0, Math.min(BRIDGE_COLS - 1, col));
  if (row < 0) {
    return STATE.startPos
      .clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.25)
      .addScaledVector(STATE.rightDir, columnLateral(safeCol));
  }

  if (row >= BRIDGE_ROWS) {
    return STATE.endPos
      .clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.18)
      .addScaledVector(STATE.rightDir, columnLateral(safeCol));
  }

  return STATE.tiles[row * BRIDGE_COLS + safeCol].position.clone();
}

function currentTileIndex() {
  const { row, col } = STATE.playerCell;
  if (row < 0 || row >= BRIDGE_ROWS) return -1;
  return row * BRIDGE_COLS + col;
}

function randomFragileDurationMs() {
  const extra =
    FRAGILE_EXTRA_MIN_SECONDS +
    Math.random() * (FRAGILE_EXTRA_MAX_SECONDS - FRAGILE_EXTRA_MIN_SECONDS);
  return (FRAGILE_BASE_SECONDS + extra) * 1000;
}

function armFragileTile(idx, now = performance.now()) {
  const meta = STATE.tileMeta[idx];
  if (!meta || !meta.fragile || meta.broken || meta.triggered) return;
  meta.triggered = true;
  meta.triggerTime = now;
  meta.dangerDuration = randomFragileDurationMs();
}

function breakTile(idx) {
  const meta = STATE.tileMeta[idx];
  if (!meta || meta.broken) return;
  meta.broken = true;
  STATE.tiles[idx].userData.shatterStart = performance.now();
}

function landOnCell(row, col) {
  STATE.playerCell.row = row;
  STATE.playerCell.col = col;
  STATE.step = Math.max(0, Math.min(BRIDGE_ROWS, row + 1));
  updateHudProgress();

  if (row >= BRIDGE_ROWS) {
    onWin();
    return;
  }

  const idx = currentTileIndex();
  if (idx >= 0) armFragileTile(idx);
  startQuestion();
}

function startMoveToCell(row, col) {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;

  clearQuestion();
  STATE.moving = true;
  STATE.moveStart = performance.now();
  STATE.moveFrom.copy(STATE.player.pos);
  STATE.moveTo.copy(cellWorldPosition(row, col));
  STATE.moveTargetCell.row = row;
  STATE.moveTargetCell.col = col;
  setDangerWarning(0);
}

function requestMove(command) {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;
  if (STATE.currentQuestion) return;

  let { row, col } = STATE.playerCell;
  if (command === 'forward') row += 1;
  if (command === 'back') row -= 1;
  if (command === 'left') col -= 1;
  if (command === 'right') col += 1;

  if (row < -1 || row > BRIDGE_ROWS) return;
  if (col < 0 || col >= BRIDGE_COLS) return;
  startMoveToCell(row, col);
}

function updateGame(t) {
  updateMovementGame(t);
}

function unusedOldQuestionTimerUpdate(t) {

  if (STATE.falling || STATE.won || !STATE.active) {
    setDangerWarning(0);
    return;
  }

  if (STATE.moving) {
    const raw = (t - STATE.moveStart) / STEP_MOVE_MS;
    const p = THREE.MathUtils.clamp(raw, 0, 1);
    const eased = p * p * (3 - 2 * p);
    STATE.player.pos.copy(STATE.moveFrom).lerp(STATE.moveTo, eased);
    STATE.player.pos.y = STATE.groundY + Math.sin(p * Math.PI) * 0.08;

    if (p >= 1) {
      STATE.moving = false;
      STATE.player.pos.copy(STATE.moveTo);

      if (STATE.step > BRIDGE_ROWS) {
        onWin();
      } else if (STATE.step === BRIDGE_ROWS) {
        // last bridge tile reached — walk off to the target rooftop, no extra question
        setTimeout(() => {
          if (!STATE.active || STATE.falling || STATE.won) return;
          STATE.moving = true;
          STATE.moveStart = performance.now();
          STATE.moveFrom.copy(STATE.player.pos);
          STATE.step += 1;
          STATE.moveTo.copy(stepWorldPosition(STATE.step));
        }, 380);
      } else {
        startQuestion();
      }
    }
    return;
  }

  if (!STATE.currentQuestion || STATE.questionLocked) return;

  const elapsed = (t - STATE.qStartTime) / 1000;
  const remaining = Math.max(0, QUESTION_TIME - elapsed);
  const ratio = remaining / QUESTION_TIME;
  timerFill.style.transform = `scaleX(${ratio})`;
  timerLabel.textContent = remaining.toFixed(1);
  timerFill.classList.toggle('warn', ratio < 0.5 && ratio >= 0.25);
  timerFill.classList.toggle('crit', ratio < 0.25);

  const idx = currentTileIndex();
  if (idx >= 0) {
    const meta = STATE.tileMeta[idx];
    meta.crackProgress = Math.max(meta.crackProgress, (1 - ratio) * 0.8);
  }

  if (remaining <= 0) {
    STATE.questionLocked = true;
    quizEl.classList.add('hidden');
    breakCurrentTile();
    triggerFall();
  }
}

function updateMovementGame(t) {
  if (STATE.falling || STATE.won || !STATE.active) {
    setDangerWarning(0);
    return;
  }

  if (STATE.moving) {
    const raw = (t - STATE.moveStart) / STEP_MOVE_MS;
    const p = THREE.MathUtils.clamp(raw, 0, 1);
    const eased = p * p * (3 - 2 * p);
    STATE.player.pos.copy(STATE.moveFrom).lerp(STATE.moveTo, eased);
    STATE.player.pos.y = STATE.groundY + Math.sin(p * Math.PI) * 0.08;

    if (p >= 1) {
      STATE.moving = false;
      STATE.player.pos.copy(STATE.moveTo);
      landOnCell(STATE.moveTargetCell.row, STATE.moveTargetCell.col);
    }
  }

  const currentIdx = STATE.moving ? -1 : currentTileIndex();
  let warningStrength = 0;

  for (let i = 0; i < STATE.tileMeta.length; i++) {
    const meta = STATE.tileMeta[i];
    if (!meta.triggered || !meta.fragile || meta.broken) continue;

    const elapsed = t - meta.triggerTime;
    const duration = meta.dangerDuration || randomFragileDurationMs();
    meta.dangerDuration = duration;
    const ratio = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
    meta.crackProgress = Math.max(meta.crackProgress, ratio);

    if (i === currentIdx) {
      warningStrength = 0.18 + ratio * 0.82;
    }

    if (elapsed >= duration) {
      breakTile(i);
      if (i === currentIdx) triggerFall();
    }
  }

  setDangerWarning(warningStrength);
}

function onWin() {
  if (STATE.won) return;
  STATE.won = true;
  STATE.active = false;
  STATE.currentQuestion = null;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  setDangerWarning(0);
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();

  endTitle.textContent = 'Du hast es geschafft!';
  endText.textContent = 'Семь шагов позади. Стекло осталось целым, город — внизу.';
  gameoverEl.classList.remove('hidden');
}

function triggerFall() {
  if (STATE.falling) return;
  STATE.falling = true;
  STATE.active = false;
  STATE.moving = false;
  STATE.currentQuestion = null;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  setDangerWarning(0);
  STATE.fallStart = performance.now();
  STATE.fallVel.set(
    (Math.random() - 0.5) * 0.4,
    -2.4,
    (Math.random() - 0.5) * 0.4,
  );

  if (document.pointerLockElement === canvas) document.exitPointerLock?.();

  setTimeout(() => {
    endTitle.textContent = 'Ты упал';
    endText.textContent = 'Стекло не выдержало. Город принял тебя.';
    gameoverEl.classList.remove('hidden');
  }, FALL_DURATION_MS);
}

// ====================================================================
// RENDER LOOP
// ====================================================================
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now();

  for (const a of STATE.aviationLights) {
    const v = (Math.sin(t * 0.0025 + a.phase) + 1) * 0.5;
    const intensity = a.white
      ? 0.08 + Math.pow(v, 6) * 1.35
      : 0.2 + v * 0.8;
    a.light.intensity = intensity * 0.7;
    if (a.white) {
      a.bulb.material.color.setRGB(intensity, intensity, intensity);
    } else {
      a.bulb.material.color.setRGB(intensity, 0.18 * intensity, 0.18 * intensity);
    }
  }

  updateMovementGame(t);

  for (let i = 0; i < STATE.tiles.length; i++) {
    const tile = STATE.tiles[i];
    const meta = STATE.tileMeta[i];

    if (meta.triggered && meta.fragile && !meta.broken) {
      const elapsed = t - meta.triggerTime;
      const duration = meta.dangerDuration || randomFragileDurationMs();
      meta.dangerDuration = duration;
      meta.crackProgress = Math.max(
        meta.crackProgress,
        THREE.MathUtils.clamp(elapsed / duration, 0, 1),
      );
      if (elapsed >= duration) breakTile(i);
    }

    if (meta.broken) {
      tile.position.y -= 9 * dt;
      tile.scale.multiplyScalar(0.985);
      tile.userData.glassMat.opacity = Math.max(
        0,
        tile.userData.glassMat.opacity - dt * 0.8,
      );
      tile.userData.neonMats?.forEach((mat, idx) => {
        mat.opacity = Math.max(0, mat.opacity - dt * (idx === 0 ? 0.55 : 0.35));
      });
      tile.userData.neonLights?.forEach((light) => {
        light.intensity = Math.max(0, light.intensity - dt * 0.08);
      });
      continue;
    }

    const cp = meta.crackProgress;
    const neonPulse = (Math.sin(t * 0.0022 + i * 0.7) + 1) * 0.5;
    if (tile.userData.neonMats?.length) {
      tile.userData.neonMats[0].opacity = Math.min(0.82, 0.54 + neonPulse * 0.1 + cp * 0.12);
    }
    if (tile.userData.neonLights?.length) {
      tile.userData.neonLights[0].intensity = 0.032 + neonPulse * 0.018 + cp * 0.025;
    }

    if (cp > 0) {
      const cracks = tile.userData.cracks;
      cracks.children.forEach((line, idx) => {
        line.material.opacity = Math.min(0.95, cp * (0.4 + (idx % 3) * 0.2));
      });

      const mat = tile.userData.glassMat;
      const base = tile.userData.baseColor;
      const white = new THREE.Color(0xffffff);
      mat.color.copy(base).lerp(white, cp * 0.55);
      mat.opacity = THREE.MathUtils.lerp(0.16, 0.62, cp);
      mat.roughness = THREE.MathUtils.lerp(0.035, 0.58, cp);
      mat.transmission = THREE.MathUtils.lerp(0.72, 0.08, cp);
      tile.position.y =
        tile.userData.baseY - cp * 0.05 - Math.sin(t * 0.02) * cp * 0.005;
    }
  }

  if (!STATE.falling) {
    camera.position.copy(STATE.player.pos);
    camera.position.y += PLAYER_EYE;

    const yaw = STATE.player.yaw;
    const pitch = STATE.player.pitch;
    const lookDir = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(camera.position.clone().add(lookDir));
    altitudeEl.textContent = `${Math.max(0, Math.round(camera.position.y - 1))} м`;
  } else {
    STATE.fallVel.y -= 12 * dt;
    STATE.player.pos.addScaledVector(STATE.fallVel, dt * 6);
    camera.position.copy(STATE.player.pos);
    camera.position.y += PLAYER_EYE;
    camera.rotation.x -= dt * 0.6;
    camera.rotation.z += dt * 0.25;
    altitudeEl.textContent = `${Math.max(0, Math.round(camera.position.y - 1))} м`;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// ====================================================================
// RESIZE
// ====================================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ====================================================================
// BOOT
// ====================================================================
if (bootScene()) {
  loadRealCityInBackground();
}
