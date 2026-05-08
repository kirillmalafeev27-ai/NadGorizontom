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
const BRIDGE_COLS = 3;
const BRIDGE_ROWS = 7;
const PLATFORM_SIZE = 9.5;
const MOUSE_SENS = 0.0022;
const QUESTION_TIME = 7.0;
const STEP_MOVE_MS = 520;
const FRAGILE_BREAK_MS = 480;
const FALL_DURATION_MS = 2400;
const CITY_TARGET_TOP_Y = 60;
const PLATFORM_Y = 70;

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
  qStartTime: 0,
  questionLocked: false,
  moving: false,
  moveStart: 0,
  moveFrom: new THREE.Vector3(),
  moveTo: new THREE.Vector3(),

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

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f38,
    roughness: 0.78,
    metalness: 0.18,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x191b21,
    roughness: 0.42,
    metalness: 0.9,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x383d48,
    roughness: 0.55,
    metalness: 0.55,
  });
  const darkPanelMat = new THREE.MeshStandardMaterial({
    color: 0x23272f,
    roughness: 0.5,
    metalness: 0.6,
  });

  // Tall slab so the platform always reads as a solid building tower,
  // independent of whatever city geometry sits below it.
  const slabH = 240.0;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(size, slabH, size),
    concreteMat,
  );
  slab.position.y = -slabH / 2 - 0.05;
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
function makeGlassTile(fragile) {
  const g = new THREE.Group();
  const baseColor = fragile ? 0xb9c8de : 0xc1d3eb;
  const roughness = fragile ? 0.16 : 0.08;
  const opacity = fragile ? 0.42 : 0.35;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    metalness: 0.0,
    roughness,
    transparent: true,
    opacity,
    transmission: 0.0,
    ior: 1.45,
    clearcoat: 1.0,
    clearcoatRoughness: fragile ? 0.12 : 0.05,
    side: THREE.DoubleSide,
    envMapIntensity: 1.4,
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
  const path = [];
  let col = Math.floor(BRIDGE_COLS / 2);
  let dir = Math.random() < 0.5 ? -1 : 1;

  path.push(col);
  for (let row = 1; row < BRIDGE_ROWS; row++) {
    const canHold = row > 1 && row < BRIDGE_ROWS - 1;
    const hold = canHold && Math.random() < 0.16;
    if (!hold) {
      let next = col + dir;
      if (next < 0 || next >= BRIDGE_COLS) {
        dir *= -1;
        next = col + dir;
      }
      col = next;
    }
    path.push(col);
  }

  return path;
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
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(totalWidth + 0.6, 0.16, length),
    frameMat,
  );
  rim.position.copy(start).addScaledVector(dir, 0.5);
  rim.position.y -= TILE_THICKNESS / 2 + 0.08;
  rim.rotation.y = yaw;
  group.add(rim);

  const railOffset = totalWidth / 2 + 0.12;
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
  hud.classList.remove('hidden');
  STATE.intro = false;
  STATE.active = true;
  startQuestion();
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
  STATE.player.pos.copy(stepWorldPosition(0));
  STATE.player.yaw = Math.atan2(-STATE.forwardDir.x, -STATE.forwardDir.z);
  STATE.player.pitch = -0.05;
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
const stepNumber = document.getElementById('step-number');
const stepTotal = document.getElementById('step-total');
const altitudeEl = document.getElementById('altitude');
const gameoverEl = document.getElementById('gameover');
const endTitle = document.getElementById('endtitle');
const endText = document.getElementById('endtext');
const restartBtn = document.getElementById('restart');
if (quizEl) quizEl.classList.add('hidden');

function showIntro() {
  stepTotal.textContent = String(BRIDGE_ROWS);
  stepNumber.textContent = '0';
  intro.classList.remove('hidden');
  STATE.intro = true;
  STATE.active = false;
  quizEl.classList.add('hidden');
}

startBtn.addEventListener('click', () => {
  intro.classList.add('hidden');
  hud.classList.remove('hidden');
  STATE.intro = false;
  STATE.active = true;
  startQuestion();
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
function stepWorldPosition(step) {
  if (step <= 0) {
    return STATE.startPos
      .clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.25);
  }

  if (step > BRIDGE_ROWS) {
    return STATE.endPos
      .clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.18);
  }

  const row = step - 1;
  const col = STATE.safePath[row] ?? Math.floor(BRIDGE_COLS / 2);
  return STATE.tiles[row * BRIDGE_COLS + col].position.clone();
}

function currentTileIndex() {
  if (STATE.step < 1 || STATE.step > BRIDGE_ROWS) return -1;
  const row = STATE.step - 1;
  const col = STATE.safePath[row] ?? Math.floor(BRIDGE_COLS / 2);
  return row * BRIDGE_COLS + col;
}

function setOptionsDisabled(disabled) {
  optionsEl.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

function startQuestion() {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;

  STATE.currentQuestion = pickQuestion();
  STATE.questionLocked = false;
  STATE.qStartTime = performance.now();

  questionEl.textContent = STATE.currentQuestion.q.replace('___', '_____');
  optionsEl.innerHTML = '';
  STATE.currentQuestion.options.forEach((option, idx) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.textContent = option;
    button.addEventListener('click', () => onAnswer(idx, button));
    optionsEl.appendChild(button);
  });

  timerFill.style.transform = 'scaleX(1)';
  timerFill.classList.remove('warn', 'crit');
  timerLabel.textContent = QUESTION_TIME.toFixed(1);
  stepNumber.textContent = String(Math.min(STATE.step + 1, BRIDGE_ROWS));
  quizEl.classList.remove('hidden');
}

function onAnswer(idx, button) {
  if (!STATE.active || STATE.questionLocked || STATE.moving || !STATE.currentQuestion) {
    return;
  }

  STATE.questionLocked = true;
  setOptionsDisabled(true);

  const correct = STATE.currentQuestion.correct === idx;
  if (correct) {
    button.classList.add('correct');
    setTimeout(advanceStep, 180);
    return;
  }

  button.classList.add('wrong');
  quizEl.classList.remove('shake');
  void quizEl.offsetWidth;
  quizEl.classList.add('shake');

  if (!bumpCrackOnCurrent(0.28)) {
    setTimeout(() => {
      if (!STATE.active || STATE.falling || STATE.won) return;
      startQuestion();
    }, 420);
  }
}

function bumpCrackOnCurrent(amount) {
  const idx = currentTileIndex();
  if (idx < 0) return false;

  const meta = STATE.tileMeta[idx];
  meta.triggered = true;
  meta.triggerTime = performance.now();
  meta.crackProgress = Math.min(1, meta.crackProgress + amount);

  if (meta.crackProgress >= 1) {
    breakCurrentTile();
    triggerFall();
    return true;
  }

  setTimeout(() => {
    if (!STATE.active || STATE.falling || STATE.won) return;
    startQuestion();
  }, 420);
  return true;
}

function breakCurrentTile() {
  const idx = currentTileIndex();
  if (idx < 0) return;

  const meta = STATE.tileMeta[idx];
  meta.broken = true;
  STATE.tiles[idx].userData.shatterStart = performance.now();
}

function advanceStep() {
  if (!STATE.active || STATE.falling || STATE.won) return;

  quizEl.classList.add('hidden');
  STATE.currentQuestion = null;
  STATE.questionLocked = true;
  STATE.moving = true;
  STATE.moveStart = performance.now();
  STATE.moveFrom.copy(STATE.player.pos);
  STATE.step += 1;
  STATE.moveTo.copy(stepWorldPosition(STATE.step));
  stepNumber.textContent = String(Math.min(STATE.step, BRIDGE_ROWS));
}

function updateGame(t) {
  if (STATE.falling || STATE.won || !STATE.active) return;

  if (STATE.moving) {
    const raw = (t - STATE.moveStart) / STEP_MOVE_MS;
    const p = THREE.MathUtils.clamp(raw, 0, 1);
    const eased = p * p * (3 - 2 * p);
    STATE.player.pos.copy(STATE.moveFrom).lerp(STATE.moveTo, eased);
    STATE.player.pos.y = STATE.groundY;

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

function onWin() {
  if (STATE.won) return;
  STATE.won = true;
  STATE.active = false;
  STATE.currentQuestion = null;
  quizEl.classList.add('hidden');
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

  updateGame(t);

  for (let i = 0; i < STATE.tiles.length; i++) {
    const tile = STATE.tiles[i];
    const meta = STATE.tileMeta[i];

    if (meta.triggered && meta.fragile && !meta.broken) {
      const elapsed = t - meta.triggerTime;
      meta.crackProgress = Math.min(1, elapsed / FRAGILE_BREAK_MS);
      if (elapsed >= FRAGILE_BREAK_MS) meta.broken = true;
    }

    if (meta.broken) {
      tile.position.y -= 9 * dt;
      tile.scale.multiplyScalar(0.985);
      tile.userData.glassMat.opacity = Math.max(
        0,
        tile.userData.glassMat.opacity - dt * 0.8,
      );
      continue;
    }

    const cp = meta.crackProgress;
    if (cp > 0) {
      const cracks = tile.userData.cracks;
      cracks.children.forEach((line, idx) => {
        line.material.opacity = Math.min(0.95, cp * (0.4 + (idx % 3) * 0.2));
      });

      const mat = tile.userData.glassMat;
      const base = tile.userData.baseColor;
      const white = new THREE.Color(0xffffff);
      mat.color.copy(base).lerp(white, cp * 0.55);
      mat.opacity = THREE.MathUtils.lerp(meta.fragile ? 0.42 : 0.35, 0.85, cp);
      mat.roughness = THREE.MathUtils.lerp(
        meta.fragile ? 0.16 : 0.08,
        0.45,
        cp,
      );
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
