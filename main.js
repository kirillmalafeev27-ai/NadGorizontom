import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  GRAMMAR_TOPICS,
  LANGUAGE_LEVELS,
  LEXICAL_TOPICS,
  QuestionBank,
  pickQuestion,
} from './questions.js';

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
const BRIDGE_COLS = 7;
const BRIDGE_ROWS = 7;
const GRAMMAR_SLOT_COUNT = BRIDGE_COLS;
const PLATFORM_SIZE = 14;
const MOUSE_SENS = 0.0022;
const STEP_MOVE_MS = 460;
const MOVE_DIRECTION_MIN_DOT = 0.2;
const FRAGILE_BASE_SECONDS = 8;
const FRAGILE_EXTRA_MIN_SECONDS = 1;
const FRAGILE_EXTRA_MAX_SECONDS = 6;
const FALL_DURATION_MS = 2400;
const SECOND_LEVEL_FRAGILE_LIMIT_MS = 40000;
const DUEL_BOARD_SIZE = 7;
const CITY_TARGET_TOP_Y = 60;
const PLATFORM_Y = 32;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const IS_COARSE_POINTER = window.matchMedia?.('(pointer: coarse)').matches || false;
const IS_SMALL_VIEWPORT = Math.min(window.innerWidth, window.innerHeight) <= 820;
const DEVICE_MEMORY_GB = navigator.deviceMemory || 8;
const HARDWARE_CORES = navigator.hardwareConcurrency || 8;
const IS_MOBILE_QUALITY =
  IS_COARSE_POINTER ||
  IS_SMALL_VIEWPORT ||
  DEVICE_MEMORY_GB <= 4 ||
  HARDWARE_CORES <= 4 ||
  navigator.userAgentData?.mobile === true;
const QUALITY = {
  mobile: IS_MOBILE_QUALITY,
  antialias: !IS_MOBILE_QUALITY,
  pixelRatioCap: IS_MOBILE_QUALITY ? 1.15 : 2,
  cameraFar: IS_MOBILE_QUALITY ? 2800 : 8000,
  fogDensity: IS_MOBILE_QUALITY ? 0.0032 : 0.0026,
  fallbackBuildingCount: IS_MOBILE_QUALITY ? 72 : 180,
  loadRealCity: true,
  maxAviationLights: IS_MOBILE_QUALITY ? 4 : 16,
  platformPointLights: !IS_MOBILE_QUALITY,
  tilePointLights: !IS_MOBILE_QUALITY,
  tileTextureSize: IS_MOBILE_QUALITY ? 256 : 512,
  crackRays: IS_MOBILE_QUALITY ? 4 : 7,
  frameIntervalMs: IS_MOBILE_QUALITY ? 1000 / 45 : 0,
};

function getRenderPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, QUALITY.pixelRatioCap);
}

// ====================================================================
// RENDERER / SCENE / CAMERA
// ====================================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: QUALITY.antialias,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(getRenderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);
scene.fog = new THREE.FogExp2(0x0b1424, QUALITY.fogDensity);

const camera = new THREE.PerspectiveCamera(
  74,
  window.innerWidth / window.innerHeight,
  0.1,
  QUALITY.cameraFar,
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
  cityBounds: null,
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
  cameraPointerId: null,
  cameraPointerLastX: 0,
  cameraPointerLastY: 0,

  step: 0,
  currentQuestion: null,
  questionLoading: false,
  questionLocked: false,
  questionRequestToken: 0,
  questionTargetCell: { row: -999, col: -999 },
  preparedQuestion: null,
  preparedQuestionCell: { row: -999, col: -999 },
  questionSettings: null,
  questionsAnswered: 0,
  questionsCorrect: 0,
  diaryEntries: [],
  diaryForced: false,
  playerCell: { row: -1, col: Math.floor(BRIDGE_COLS / 2) },
  moving: false,
  moveStart: 0,
  moveFrom: new THREE.Vector3(),
  moveTo: new THREE.Vector3(),
  moveTargetCell: { row: -1, col: Math.floor(BRIDGE_COLS / 2) },
  answeredMoveCell: { row: -999, col: -999 },
  dangerWarningStrength: 0,
  bridgeLevel: 1,
  weakGlassStreakMs: 0,
  weakGlassLastT: 0,

  intro: true,
  active: false,
  falling: false,
  won: false,
  fallVel: new THREE.Vector3(),
  fallStart: 0,
  paused: false,
  returningFromSettings: false,
  lastFrameAt: 0,
  mode: 'solo',
  duel: {
    active: false,
    roomId: null,
    playerId: null,
    state: null,
    pollTimer: null,
    seriesLine: null,
    seriesStep: 1,
    seriesCorrect: 0,
    currentQuestion: null,
    questionLocked: false,
    actionPower: 0,
    mannequins: {},
    visualLocks: {},
    visualAnims: [],
    fallView: null,
    seenActionId: 0,
    bannerTimer: null,
  },

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

  const buildingGeom = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0x1c2030,
    roughness: 0.7,
    metalness: 0.3,
    emissive: 0x4a5a82,
    emissiveIntensity: QUALITY.mobile ? 0.04 : 0.06,
  });

  for (let i = 0; i < QUALITY.fallbackBuildingCount; i++) {
    const w = 8 + Math.random() * 18;
    const d = 8 + Math.random() * 18;
    const h = 30 + Math.random() * 220;
    const x = (Math.random() - 0.5) * 800;
    const z = (Math.random() - 0.5) * 800;
    if (Math.hypot(x, z) < 35) continue;

    const b = new THREE.Mesh(buildingGeom, buildingMat);
    b.scale.set(w, h, d);
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
  cityRoot.updateMatrixWorld(true);
  STATE.cityBounds = new THREE.Box3().setFromObject(cityRoot);
}

function optimizeCityModelForDevice(cityRoot) {
  const textures = new Set();
  cityRoot.traverse((child) => {
    if (!child.isMesh) return;

    child.frustumCulled = true;
    child.castShadow = false;
    child.receiveShadow = false;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material].filter(Boolean);
    for (const material of materials) {
      material.dithering = !QUALITY.mobile;
      material.needsUpdate = true;

      for (const key of [
        'map',
        'emissiveMap',
        'aoMap',
        'lightMap',
        'roughnessMap',
        'metalnessMap',
        'normalMap',
        'alphaMap',
      ]) {
        if (material[key]) textures.add(material[key]);
      }

      if (QUALITY.mobile) {
        material.envMapIntensity = Math.min(material.envMapIntensity || 0.5, 0.45);
        if (material.normalMap) material.normalMap = null;
        if (material.roughnessMap) material.roughnessMap = null;
        if (material.metalnessMap) material.metalnessMap = null;
      }
    }
  });

  textures.forEach((texture) => {
    texture.anisotropy = QUALITY.mobile ? 1 : renderer.capabilities.getMaxAnisotropy();
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = QUALITY.mobile ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    if (QUALITY.mobile) texture.generateMipmaps = false;
    texture.needsUpdate = true;
  });

  cityRoot.updateMatrixWorld(true);
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
      try {
        fitCity(gltf.scene);
        optimizeCityModelForDevice(gltf.scene);
        mountCity(gltf.scene);
        console.info(QUALITY.mobile
          ? 'Real city model loaded with mobile optimizations.'
          : 'Upgraded to real city.');
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

function makeTransparentGlassMaterial(options) {
  const {
    color,
    roughness,
    opacity,
    transmission,
    thickness,
    ior,
    clearcoat,
    clearcoatRoughness,
    envMapIntensity,
    attenuationColor,
    attenuationDistance,
    side,
  } = options;

  if (QUALITY.mobile) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: Math.max(roughness, 0.24),
      metalness: 0.0,
      transparent: true,
      opacity: Math.min(0.5, opacity * 1.18),
      side,
      envMapIntensity: Math.min(envMapIntensity || 0.8, 0.8),
      depthWrite: false,
    });
  }

  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.0,
    transparent: true,
    opacity,
    transmission,
    thickness,
    attenuationColor,
    attenuationDistance,
    ior,
    clearcoat,
    clearcoatRoughness,
    side,
    envMapIntensity,
    depthWrite: false,
  });
}

// ====================================================================
// ROOF PLATFORM
// ====================================================================
function makeRoofPlatform(isTarget) {
  const g = new THREE.Group();
  const size = PLATFORM_SIZE;

  const towerGlassMat = makeTransparentGlassMaterial({
    color: 0x7f9fbd,
    roughness: 0.2,
    opacity: 0.24,
    transmission: 0.35,
    thickness: 1.2,
    ior: 1.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x191b21,
    roughness: 0.42,
    metalness: 0.9,
  });
  const panelMat = makeTransparentGlassMaterial({
    color: 0x94b4ce,
    roughness: 0.18,
    opacity: 0.28,
    transmission: 0.45,
    thickness: 0.4,
    ior: 1.35,
    clearcoat: 0.8,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.4,
  });
  const darkPanelMat = makeTransparentGlassMaterial({
    color: 0x6f879d,
    roughness: 0.24,
    opacity: 0.18,
    transmission: 0.35,
    thickness: 0.4,
    ior: 1.35,
    clearcoat: 0.65,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.1,
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

  const aviLight = QUALITY.platformPointLights
    ? new THREE.PointLight(0xff3030, 0.5, 6)
    : null;
  if (aviLight) {
    aviLight.position.copy(aviBulb.position);
    g.add(aviLight);
  }
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

    if (QUALITY.platformPointLights) {
      const pl = new THREE.PointLight(0x6da3e6, 0.4, 6);
      pl.position.set(0, 1.2, 0);
      g.add(pl);
    }
  }

  return g;
}

// ====================================================================
// GLASS TILE
// ====================================================================
let tileEdgeGlowTexture = null;

function getTileEdgeGlowTexture() {
  if (tileEdgeGlowTexture) return tileEdgeGlowTexture;

  const size = QUALITY.tileTextureSize;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const inset = Math.round(size * 0.113);
  const rectSize = size - inset * 2;

  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const rings = QUALITY.mobile ? 10 : 20;
  for (let i = 0; i < rings; i++) {
    const p = i / Math.max(1, rings - 1);
    const alpha = 0.042 * (1 - p) ** 1.45;
    ctx.strokeStyle = `rgba(112, 246, 255, ${alpha})`;
    ctx.lineWidth = size * 0.21 - p * size * 0.18;
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
  tileEdgeGlowTexture.generateMipmaps = !QUALITY.mobile;
  tileEdgeGlowTexture.minFilter = QUALITY.mobile
    ? THREE.LinearFilter
    : THREE.LinearMipmapLinearFilter;
  tileEdgeGlowTexture.magFilter = THREE.LinearFilter;
  tileEdgeGlowTexture.anisotropy = QUALITY.mobile
    ? 1
    : renderer.capabilities.getMaxAnisotropy();
  tileEdgeGlowTexture.needsUpdate = true;
  return tileEdgeGlowTexture;
}

function makeGlassTile(fragile) {
  const g = new THREE.Group();
  const baseColor = 0xc8ddf3;
  const roughness = 0.035;
  const opacity = 0.16;

  const glassMat = makeTransparentGlassMaterial({
    color: baseColor,
    roughness,
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

  if (QUALITY.tilePointLights) {
    const softLight = new THREE.PointLight(TILE_NEON_COLOR, 0.052, 2.8, 2.0);
    softLight.position.set(0, 0.24, 0);
    g.add(softLight);
    g.userData.neonLights.push(softLight);
  }

  if (!QUALITY.mobile) {
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
  }

  const cracks = new THREE.Group();
  const ny = TILE_THICKNESS / 2 + 0.0015;
  for (let r = 0; r < QUALITY.crackRays; r++) {
    const angle0 = (r / QUALITY.crackRays) * Math.PI * 2 + Math.random() * 0.4;
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

function rebuildRun() {
  if (STATE.bridgeGroup) {
    scene.remove(STATE.bridgeGroup);
    disposeObject(STATE.bridgeGroup);
  }

  STATE.bridgeGroup = buildBridge(STATE.bridgeStart, STATE.bridgeEnd);
  scene.add(STATE.bridgeGroup);

  STATE.falling = false;
  STATE.won = false;
  STATE.weakGlassStreakMs = 0;
  STATE.weakGlassLastT = 0;
  STATE.fallVel.set(0, 0, 0);

  resetPlayer();
}

function softRestart() {
  STATE.bridgeLevel = 1;
  rebuildRun();
  gameoverEl.classList.add('hidden');
  diaryEl?.classList.add('hidden');
  enterPlay();
}

function disposeObject(obj) {
  const geometries = new Set();
  const materials = new Set();
  obj.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => materials.add(m));
      else materials.add(child.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function resetPlayer() {
  STATE.step = 0;
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionLocked = false;
  STATE.questionRequestToken++;
  STATE.questionTargetCell.row = -999;
  STATE.questionTargetCell.col = -999;
  STATE.preparedQuestion = null;
  STATE.preparedQuestionCell.row = -999;
  STATE.preparedQuestionCell.col = -999;
  STATE.moving = false;
  STATE.weakGlassStreakMs = 0;
  STATE.weakGlassLastT = 0;
  STATE.playerCell.row = -1;
  STATE.playerCell.col = Math.floor(BRIDGE_COLS / 2);
  STATE.moveTargetCell.row = STATE.playerCell.row;
  STATE.moveTargetCell.col = STATE.playerCell.col;
  STATE.answeredMoveCell.row = -999;
  STATE.answeredMoveCell.col = -999;
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
  if (QUALITY.maxAviationLights <= 0) return;

  const bbox = new THREE.Box3().setFromObject(STATE.cityRoot);
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);

  let placed = 0;
  const maxLights = QUALITY.maxAviationLights;
  const maxAttempts = QUALITY.mobile ? 32 : 80;
  for (let attempt = 0; attempt < maxAttempts && placed < maxLights; attempt++) {
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

    const pl = QUALITY.platformPointLights
      ? new THREE.PointLight(color, 0.5, 12)
      : null;
    if (pl) {
      pl.position.copy(bulb.position);
      scene.add(pl);
    }

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
const questionScoreEl = document.getElementById('question-score');
const gameoverEl = document.getElementById('gameover');
const endTitle = document.getElementById('endtitle');
const endText = document.getElementById('endtext');
const restartBtn = document.getElementById('restart');
const dangerWarning = document.getElementById('danger-warning');
const moveControls = document.getElementById('move-controls');
const pauseBtn = document.getElementById('pause-btn');
const pauseMenuEl = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const settingsBtn = document.getElementById('settings-btn');
const diaryEl = document.getElementById('diary');
const diaryBtn = document.getElementById('diary-btn');
const diaryCloseBtn = document.getElementById('diary-close');
const diaryListEl = document.getElementById('diary-list');
const duelOpenBtn = document.getElementById('duel-open-btn');
const duelMenuEl = document.getElementById('duel-menu');
const duelMenuCloseBtn = document.getElementById('duel-menu-close');
const duelCreateBtn = document.getElementById('duel-create-btn');
const duelJoinBtn = document.getElementById('duel-join-btn');
const duelPlayerNameInput = document.getElementById('duel-player-name');
const duelRoomInput = document.getElementById('duel-room-input');
const duelMenuStatus = document.getElementById('duel-menu-status');
const duelLinkOutput = document.getElementById('duel-link-output');
const duelHud = document.getElementById('duel-hud');
const duelRoomLabel = document.getElementById('duel-room-label');
const duelLives = document.getElementById('duel-lives');
const duelTurnLabel = document.getElementById('duel-turn-label');
const duelStatus = document.getElementById('duel-status');
const duelRiskLines = document.getElementById('duel-risk-lines');
const duelSeriesEl = document.getElementById('duel-series');
const duelSeriesMeta = document.getElementById('duel-series-meta');
const duelQuestionEl = document.getElementById('duel-question');
const duelOptionsEl = document.getElementById('duel-options');
const duelClaimEl = document.getElementById('duel-claim');
const duelClaimBtn = document.getElementById('duel-claim-btn');
const duelRiskBtn = document.getElementById('duel-risk-btn');
const duelActionPanel = document.getElementById('duel-action-panel');
const duelEventBanner = document.getElementById('duel-event-banner');
const duelEventKicker = document.getElementById('duel-event-kicker');
const duelEventTitle = document.getElementById('duel-event-title');
const duelEventText = document.getElementById('duel-event-text');
if (quizEl) quizEl.classList.add('hidden');
if (timerFill) timerFill.style.transform = 'scaleX(1)';
if (timerLabel) timerLabel.textContent = '';
if (hintEl) hintEl.textContent = 'Ответ откроет следующий шаг. Время стекла не показывается.';

const questionBank = new QuestionBank();
const duelQuestionBank = new QuestionBank();
const MENU_STATE_KEY = 'nad_gorizontom_flammen_dashboard_v3_7x7';
const DIFFICULTIES = [
  { id: 'easy', title: 'Лёгкий', desc: 'больше времени' },
  { id: 'medium', title: 'Средний', desc: 'обычный темп' },
  { id: 'hard', title: 'Трудный', desc: 'нервное стекло' },
];
const RITUAL_SLOTS = Array.from({ length: GRAMMAR_SLOT_COUNT }, (_, index) => ({
  title: `Колонка ${index + 1}`,
  role: `Столбец ${index + 1}`,
}));

function isWortstellungTopic(grammarTopic) {
  return typeof grammarTopic === 'string' && grammarTopic.includes('Wortstellung');
}

const dashboard = {
  intro,
  startButton: startBtn,
  startStatus: document.getElementById('start-status'),
  playerName: document.getElementById('player-name'),
  steps: Array.from(document.querySelectorAll('.setup-step')),
  progressSteps: Array.from(document.querySelectorAll('.progress-step')),
  levelButtons: document.getElementById('level-buttons'),
  difficultyButtons: document.getElementById('difficulty-buttons'),
  lexicalGrid: document.getElementById('lexical-grid'),
  ritualSlots: document.getElementById('ritual-slots'),
  grammarPicker: document.getElementById('grammar-picker'),
  ready: false,
  selectedStep: 1,
  selectedLevel: null,
  selectedDifficulty: 'hard',
  selectedLexical: null,
  selectedGrammar: null,
  selectedSlotIndex: null,
  slotAssignments: Array(GRAMMAR_SLOT_COUNT).fill(null),

  bind() {
    this.loadState();
    this.populate();
    this.startButton?.addEventListener('click', () => this.requestStart());
    document.getElementById('to-step2-btn')?.addEventListener('click', () => this.showStep(2));
    document.getElementById('back-to-step1')?.addEventListener('click', () => this.showStep(1));
    document.getElementById('back-to-step2')?.addEventListener('click', () => this.showStep(2));
    document.getElementById('back-to-step3')?.addEventListener('click', () => this.showStep(3));
    this.playerName?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.showStep(2);
      }
    });
    this.playerName?.addEventListener('input', () => this.saveState());
  },

  loadState() {
    try {
      const savedName = localStorage.getItem('flammen_player_name');
      const raw = localStorage.getItem(MENU_STATE_KEY);
      if (savedName && this.playerName) this.playerName.value = savedName;
      if (!raw) return;

      const state = JSON.parse(raw);
      if (LANGUAGE_LEVELS.includes(state.selectedLevel)) this.selectedLevel = state.selectedLevel;
      if (DIFFICULTIES.some((difficulty) => difficulty.id === state.selectedDifficulty)) {
        this.selectedDifficulty = state.selectedDifficulty;
      }
      if (LEXICAL_TOPICS.includes(state.selectedLexical)) this.selectedLexical = state.selectedLexical;
      if (Array.isArray(state.slotAssignments)) {
        this.slotAssignments = Array.from({ length: GRAMMAR_SLOT_COUNT }, (_, index) => {
          const topic = state.slotAssignments[index];
          return GRAMMAR_TOPICS.includes(topic) ? topic : null;
        });
      }
      if (Number.isInteger(state.selectedStep)) {
        this.selectedStep = Math.max(1, Math.min(4, state.selectedStep));
      }
    } catch (error) {
      // Local storage is optional.
    }
  },

  saveState() {
    try {
      const playerName = this.playerName?.value.trim();
      if (playerName) localStorage.setItem('flammen_player_name', playerName);
      localStorage.setItem(MENU_STATE_KEY, JSON.stringify({
        selectedLevel: this.selectedLevel,
        selectedDifficulty: this.selectedDifficulty,
        selectedLexical: this.selectedLexical,
        selectedStep: this.selectedStep,
        slotAssignments: this.slotAssignments,
      }));
    } catch (error) {
      // Local storage is optional.
    }
  },

  populate() {
    this.renderLevelButtons();
    this.renderDifficultyButtons();
    this.renderLexicalGrid();
    this.renderSlots();
    this.renderGrammarPicker();
    this.showStep(this.getRestoredStep());
    this.updateStartButton();
  },

  getRestoredStep() {
    if (this.selectedStep >= 4 && this.selectedLevel && this.selectedLexical) return 4;
    if (this.selectedStep >= 3 && this.selectedLevel) return 3;
    if (this.selectedStep >= 2) return 2;
    return 1;
  },

  showStep(step) {
    this.selectedStep = step;
    this.steps.forEach((node) => {
      node.classList.toggle('hidden', node.id !== `setup-step${step}`);
    });
    this.progressSteps.forEach((node) => {
      node.classList.toggle('active', node.dataset.progressStep === String(step));
    });
    this.saveState();
  },

  renderLevelButtons() {
    if (!this.levelButtons) return;
    const labels = {
      A1: 'Начальный',
      A2: 'Базовый',
      B1: 'Средний',
      B2: 'Выше среднего',
    };
    this.levelButtons.innerHTML = '';
    for (const level of LANGUAGE_LEVELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level-btn';
      button.innerHTML = `<span class="level-code">${level}</span><span class="level-desc">${labels[level] || ''}</span>`;
      button.classList.toggle('selected', this.selectedLevel === level);
      button.addEventListener('click', () => {
        this.selectedLevel = level;
        this.renderLevelButtons();
        this.updateStartButton();
        this.saveState();
        this.showStep(3);
      });
      this.levelButtons.appendChild(button);
    }
  },

  renderDifficultyButtons() {
    if (!this.difficultyButtons) return;
    this.difficultyButtons.innerHTML = '';
    for (const difficulty of DIFFICULTIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'difficulty-btn';
      button.innerHTML = `<span class="level-code">${difficulty.title}</span><span class="level-desc">${difficulty.desc}</span>`;
      button.classList.toggle('selected', this.selectedDifficulty === difficulty.id);
      button.addEventListener('click', () => {
        this.selectedDifficulty = difficulty.id;
        this.renderDifficultyButtons();
        this.saveState();
      });
      this.difficultyButtons.appendChild(button);
    }
  },

  renderLexicalGrid() {
    if (!this.lexicalGrid) return;
    this.lexicalGrid.innerHTML = '';
    for (const topic of LEXICAL_TOPICS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lexical-btn';
      button.textContent = topic;
      button.classList.toggle('selected', this.selectedLexical === topic);
      button.addEventListener('click', () => {
        this.selectedLexical = topic;
        this.renderLexicalGrid();
        this.updateStartButton();
        this.saveState();
        this.showStep(4);
      });
      this.lexicalGrid.appendChild(button);
    }
  },

  renderSlots() {
    if (!this.ritualSlots) return;
    this.ritualSlots.innerHTML = '';
    RITUAL_SLOTS.forEach((slot, index) => {
      const grammar = this.slotAssignments[index];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ritual-slot';
      button.classList.toggle('selected-slot', this.selectedSlotIndex === index);
      button.innerHTML =
        `<div class="slot-bonus">${slot.role}</div>` +
        `<div class="slot-topic">${grammar || slot.title}</div>` +
        `<div class="slot-grammar">${grammar ? 'эта колонка будет спрашивать об этом' : 'назначь грамматику этой колонке'}</div>`;
      button.addEventListener('click', () => {
        if (this.selectedGrammar) {
          this.assignGrammarToSlot(index, this.selectedGrammar);
          return;
        }
        this.selectedSlotIndex = this.selectedSlotIndex === index ? null : index;
        this.saveState();
        this.renderSlots();
        this.renderGrammarPicker();
      });
      this.ritualSlots.appendChild(button);
    });
  },

  renderGrammarPicker() {
    if (!this.grammarPicker) return;
    this.grammarPicker.innerHTML = '';
    for (const topic of GRAMMAR_TOPICS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grammar-tag';
      button.textContent = topic;
      button.classList.toggle('selected-grammar', this.selectedGrammar === topic);
      button.addEventListener('click', () => {
        if (this.selectedSlotIndex !== null) {
          this.assignGrammarToSlot(this.selectedSlotIndex, topic);
          return;
        }
        this.selectedGrammar = this.selectedGrammar === topic ? null : topic;
        this.saveState();
        this.renderSlots();
        this.renderGrammarPicker();
      });
      this.grammarPicker.appendChild(button);
    }
  },

  assignGrammarToSlot(slotIndex, grammarTopic) {
    this.slotAssignments[slotIndex] = grammarTopic;
    this.selectedGrammar = null;
    this.selectedSlotIndex = null;
    this.saveState();
    this.renderSlots();
    this.renderGrammarPicker();
    this.updateStartButton();
  },

  isComplete() {
    return Boolean(this.selectedLevel && this.selectedLexical && this.slotAssignments.every(Boolean));
  },

  setReady(isReady) {
    this.ready = isReady;
    if (this.startStatus) {
      this.startStatus.textContent = isReady
        ? 'Город готов. Настрой темы и начинай.'
        : 'Сцена загружается...';
    }
    this.updateStartButton();
  },

  updateStartButton() {
    if (this.startButton) this.startButton.disabled = !this.ready || !this.isComplete();
  },

  getSettings() {
    const playerName = this.playerName?.value.trim() || 'Spieler';
    try { localStorage.setItem('flammen_player_name', playerName); } catch (error) {}
    this.saveState();
    return {
      playerName,
      langLevel: this.selectedLevel || 'A2',
      difficulty: this.selectedDifficulty || 'hard',
      lexicalTopic: this.selectedLexical || LEXICAL_TOPICS[0],
      grammarSlots: this.slotAssignments.map((grammarTopic, index) => ({
        grammarTopic,
        bridgeIndex: index,
        isWortstellung: isWortstellungTopic(grammarTopic),
      })),
    };
  },

  requestStart() {
    if (!this.ready || !this.isComplete()) {
      if (this.startStatus) {
        this.startStatus.textContent = this.ready
          ? 'Заполни все семь колонок перед стартом.'
          : 'Сцена загружается...';
      }
      return;
    }

    STATE.questionSettings = this.getSettings();
    questionBank.configure(STATE.questionSettings);
    enterPlay({ resetRun: STATE.returningFromSettings });
    STATE.returningFromSettings = false;
  },
};

dashboard.bind();

// ====================================================================
// NETWORK DUEL MODE
// ====================================================================
const DUEL_LINES = {
  lexicon: { title: 'Лексика', reward: 'позиция' },
  grammar: { title: 'Грамматика', reward: 'толчок' },
  translation: { title: 'Перевод', reward: 'приём' },
};

const DUEL_DIRS = [
  { label: 'Вперёд', row: -1, col: 0 },
  { label: 'Назад', row: 1, col: 0 },
  { label: 'Влево', row: 0, col: 1 },
  { label: 'Вправо', row: 0, col: -1 },
];

const duelAudio = {
  ctx: null,
};

function ensureDuelAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!duelAudio.ctx) duelAudio.ctx = new AudioContextClass();
  if (duelAudio.ctx.state === 'suspended') {
    duelAudio.ctx.resume().catch(() => {});
  }
  return duelAudio.ctx;
}

function playDuelTone(ctx, freq, start, duration, gainAmount, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainAmount), start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playDuelNoise(ctx, start, duration, gainAmount, filterFreq = 900) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, start);
  filter.Q.setValueAtTime(0.9, start);
  gain.gain.setValueAtTime(gainAmount, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playDuelSound(kind) {
  const ctx = ensureDuelAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (kind === 'question') {
    playDuelTone(ctx, 440, now, 0.09, 0.035, 'triangle');
    playDuelTone(ctx, 660, now + 0.08, 0.12, 0.035, 'triangle');
  } else if (kind === 'correct') {
    playDuelTone(ctx, 620, now, 0.1, 0.055, 'sine');
    playDuelTone(ctx, 930, now + 0.08, 0.16, 0.045, 'sine');
  } else if (kind === 'wrong') {
    playDuelTone(ctx, 180, now, 0.18, 0.06, 'sawtooth');
    playDuelTone(ctx, 116, now + 0.08, 0.24, 0.045, 'sawtooth');
    playDuelNoise(ctx, now, 0.18, 0.035, 260);
  } else if (kind === 'move') {
    playDuelNoise(ctx, now, 0.11, 0.04, 520);
    playDuelTone(ctx, 210, now, 0.09, 0.04, 'triangle');
  } else if (kind === 'push') {
    playDuelNoise(ctx, now, 0.22, 0.075, 760);
    playDuelTone(ctx, 96, now, 0.18, 0.08, 'square');
    playDuelTone(ctx, 300, now + 0.08, 0.09, 0.035, 'triangle');
  } else if (kind === 'guard') {
    playDuelTone(ctx, 260, now, 0.12, 0.045, 'triangle');
    playDuelTone(ctx, 392, now + 0.04, 0.18, 0.035, 'triangle');
  } else if (kind === 'swap') {
    playDuelNoise(ctx, now, 0.28, 0.045, 1350);
    playDuelTone(ctx, 520, now + 0.02, 0.12, 0.035, 'sine');
    playDuelTone(ctx, 780, now + 0.12, 0.14, 0.035, 'sine');
  } else if (kind === 'fall') {
    playDuelNoise(ctx, now, 0.7, 0.075, 420);
    playDuelTone(ctx, 220, now, 0.28, 0.08, 'sawtooth');
    playDuelTone(ctx, 92, now + 0.22, 0.46, 0.065, 'sawtooth');
  } else if (kind === 'round') {
    playDuelTone(ctx, 330, now, 0.18, 0.05, 'triangle');
    playDuelTone(ctx, 495, now + 0.05, 0.2, 0.045, 'triangle');
    playDuelTone(ctx, 740, now + 0.1, 0.24, 0.04, 'triangle');
  }
}

function showDuelEventBanner(kicker, title, text, tone = 'danger') {
  if (!duelEventBanner) return;
  if (STATE.duel.bannerTimer) clearTimeout(STATE.duel.bannerTimer);
  if (duelEventKicker) duelEventKicker.textContent = kicker;
  if (duelEventTitle) duelEventTitle.textContent = title;
  if (duelEventText) duelEventText.textContent = text;
  duelEventBanner.classList.remove('hidden', 'danger');
  if (tone) duelEventBanner.classList.add(tone);
  duelEventBanner.style.animation = 'none';
  void duelEventBanner.offsetWidth;
  duelEventBanner.style.animation = '';
  STATE.duel.bannerTimer = setTimeout(() => {
    duelEventBanner.classList.add('hidden');
  }, 2850);
}

function getDuelSettings() {
  const settings = dashboard.getSettings();
  const firstSlot = settings.grammarSlots.find((slot) => slot?.grammarTopic) || settings.grammarSlots[0];
  return {
    level: settings.langLevel || 'A2',
    lexicalTopic: settings.lexicalTopic || LEXICAL_TOPICS[0],
    grammarTopic: firstSlot?.grammarTopic || GRAMMAR_TOPICS[0],
  };
}

function configureDuelQuestionBank(settings) {
  duelQuestionBank.configure({
    langLevel: settings.level,
    lexicalTopic: settings.lexicalTopic,
    grammarSlots: [{
      grammarTopic: settings.grammarTopic,
      isWortstellung: isWortstellungTopic(settings.grammarTopic),
    }],
  });
}

function setDuelMenuStatus(text) {
  if (duelMenuStatus) duelMenuStatus.textContent = text;
}

function openDuelMenu() {
  ensureDuelAudio();
  const name = dashboard.playerName?.value.trim() || localStorage.getItem('flammen_player_name') || '';
  if (duelPlayerNameInput && !duelPlayerNameInput.value.trim()) duelPlayerNameInput.value = name;
  duelMenuEl?.classList.remove('hidden');
  setDuelMenuStatus(
    dashboard.isComplete()
      ? 'Создай комнату со своими темами или войди по коду: в чужой комнате вопросы задаёт хост.'
      : 'Для своей комнаты сначала собери темы в настройках. Для входа в чужую достаточно имени и кода.',
  );
}

function closeDuelMenu() {
  duelMenuEl?.classList.add('hidden');
}

async function duelApi(path, body = null, method = 'POST') {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function stopDuelPolling() {
  if (STATE.duel.pollTimer) {
    clearInterval(STATE.duel.pollTimer);
    STATE.duel.pollTimer = null;
  }
}

function startDuelPolling() {
  stopDuelPolling();
  STATE.duel.pollTimer = setInterval(pollDuelState, 700);
  pollDuelState();
}

async function pollDuelState() {
  if (!STATE.duel.roomId) return;
  try {
    const data = await duelApi(
      `/api/duel/state?roomId=${encodeURIComponent(STATE.duel.roomId)}&playerId=${encodeURIComponent(STATE.duel.playerId || '')}`,
      null,
      'GET',
    );
    applyDuelState(data.state);
  } catch (error) {
    if (duelStatus) duelStatus.textContent = `Связь с комнатой потеряна: ${error.message}`;
  }
}

async function createDuelRoom() {
  ensureDuelAudio();
  if (!dashboard.isComplete()) {
    setDuelMenuStatus('Сначала собери темы в настройках: уровень, лексику и грамматику для всех колонок.');
    return;
  }
  try {
    const settings = getDuelSettings();
    const name = duelPlayerNameInput?.value.trim() || settings.playerName || 'Spieler 1';
    const data = await duelApi('/api/duel/create', { settings, name });
    enterDuelMode(data.roomId, data.playerId, data.state);
    const link = `${location.origin}${location.pathname}?duel=${data.roomId}`;
    if (duelLinkOutput) duelLinkOutput.value = link;
    setDuelMenuStatus(`Комната ${data.roomId} создана. Отправь второму игроку ссылку ниже или сам код комнаты.`);
  } catch (error) {
    setDuelMenuStatus(`Не удалось создать комнату: ${error.message}`);
  }
}

async function joinDuelRoom(roomId = duelRoomInput?.value.trim()) {
  ensureDuelAudio();
  const cleanRoomId = String(roomId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanRoomId) {
    setDuelMenuStatus('Введи код комнаты.');
    return;
  }
  try {
    const name = duelPlayerNameInput?.value.trim() || 'Spieler 2';
    const data = await duelApi('/api/duel/join', { roomId: cleanRoomId, name });
    enterDuelMode(data.roomId, data.playerId, data.state);
    setDuelMenuStatus(`Ты подключился к комнате ${data.roomId}.`);
  } catch (error) {
    setDuelMenuStatus(`Не удалось подключиться: ${error.message}`);
  }
}

function enterDuelMode(roomId, playerId, state) {
  STATE.mode = 'duel';
  STATE.active = false;
  STATE.paused = false;
  STATE.won = false;
  STATE.falling = false;
  STATE.duel.active = true;
  STATE.duel.roomId = roomId;
  STATE.duel.playerId = playerId;
  STATE.duel.seriesLine = null;
  STATE.duel.seriesStep = 1;
  STATE.duel.seriesCorrect = 0;
  STATE.duel.currentQuestion = null;
  STATE.duel.questionLocked = false;
  STATE.duel.actionPower = 0;
  STATE.duel.visualLocks = {};
  STATE.duel.visualAnims = [];
  STATE.duel.fallView = null;
  STATE.duel.seenActionId = 0;

  const settings = state?.settings || getDuelSettings();
  configureDuelQuestionBank(settings);
  rebuildRun();
  resetDuelViewForPlayer(playerId);
  ensureDuelMannequins();

  intro.classList.add('hidden');
  duelMenuEl?.classList.add('hidden');
  hud.classList.add('hidden');
  quizEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  pauseMenuEl?.classList.add('hidden');
  diaryEl?.classList.add('hidden');
  duelHud?.classList.remove('hidden');

  applyDuelState(state);
  startDuelPolling();
}

function leaveDuelMode() {
  stopDuelPolling();
  STATE.mode = 'solo';
  STATE.duel.active = false;
  if (STATE.duel.bannerTimer) {
    clearTimeout(STATE.duel.bannerTimer);
    STATE.duel.bannerTimer = null;
  }
  duelEventBanner?.classList.add('hidden');
  duelHud?.classList.add('hidden');
  Object.values(STATE.duel.mannequins).forEach((mannequin) => {
    scene.remove(mannequin);
    disposeObject(mannequin);
  });
  STATE.duel.mannequins = {};
  STATE.duel.visualLocks = {};
  STATE.duel.visualAnims = [];
  STATE.duel.fallView = null;
}

function applyDuelState(state) {
  if (!state) return;
  STATE.duel.state = state;
  if (duelRoomLabel) duelRoomLabel.textContent = `комната ${state.id}`;

  const me = state.players?.[STATE.duel.playerId];
  const enemy = state.players?.[STATE.duel.playerId === 'p1' ? 'p2' : 'p1'];
  if (duelLives) {
    duelLives.textContent = me && enemy
      ? `${me.name}: ${me.lives} · ${enemy.name}: ${enemy.lives}`
      : 'ожидаем второго игрока';
  }
  if (duelTurnLabel) {
    duelTurnLabel.textContent = state.phase === 'finished'
      ? `победил ${state.players?.[state.winner]?.name || state.winner}`
      : state.phase === 'abandoned'
        ? 'комната закрыта'
      : state.phase === 'playing'
        ? 'оба на ходу'
        : 'ожидание';
  }

  syncDuelMannequins(state);
  handleDuelActionEvent(state.lastAction);
  renderDuelTurnPanel();
}

function canPlayDuelNow() {
  const state = STATE.duel.state;
  return Boolean(
    state &&
    state.phase === 'playing' &&
    state.players?.[STATE.duel.playerId] &&
    state.players?.[duelOpponentId()]
  );
}

function duelYawForPlayer(playerId) {
  return playerId === 'p1'
    ? Math.atan2(STATE.forwardDir.x, STATE.forwardDir.z)
    : Math.atan2(-STATE.forwardDir.x, -STATE.forwardDir.z);
}

function resetDuelViewForPlayer(playerId) {
  STATE.player.yaw = duelYawForPlayer(playerId);
  STATE.player.pitch = -0.04;
}

function renderDuelTurnPanel() {
  const state = STATE.duel.state;
  if (!state) return;

  if (state.phase === 'waiting') {
    duelSeriesEl?.classList.add('hidden');
    duelClaimEl?.classList.add('hidden');
    duelActionPanel?.classList.add('hidden');
    setDuelRiskButtonsDisabled(true);
    if (duelStatus) duelStatus.textContent = `${state.lastEvent || 'Ждём второго игрока.'}`;
    duelRiskLines?.classList.add('hidden');
    return;
  }

  if (state.phase === 'finished') {
    duelSeriesEl?.classList.add('hidden');
    duelClaimEl?.classList.add('hidden');
    duelActionPanel?.classList.add('hidden');
    setDuelRiskButtonsDisabled(true);
    const winnerName = state.players?.[state.winner]?.name || 'победитель';
    if (duelStatus) duelStatus.textContent = `${winnerName} выиграл Sprachduell.`;
    duelRiskLines?.classList.add('hidden');
    return;
  }

  if (state.phase === 'abandoned') {
    duelSeriesEl?.classList.add('hidden');
    duelClaimEl?.classList.add('hidden');
    duelActionPanel?.classList.add('hidden');
    setDuelRiskButtonsDisabled(true);
    if (duelStatus) duelStatus.textContent = state.lastEvent || 'Хост покинул комнату. Дуэль остановлена.';
    duelRiskLines?.classList.add('hidden');
    return;
  }

  if (
    STATE.duel.currentQuestion ||
    STATE.duel.questionLocked ||
    STATE.duel.actionPower > 0 ||
    STATE.duel.seriesCorrect > 0 ||
    STATE.duel.seriesLine
  ) return;

  duelSeriesEl?.classList.add('hidden');
  duelClaimEl?.classList.add('hidden');
  duelActionPanel?.classList.add('hidden');
  setDuelRiskButtonsDisabled(false);
  if (duelStatus) duelStatus.textContent = `${state.lastEvent || ''} Выбери линию риска и дави темп.`;
  duelRiskLines?.classList.remove('hidden');
}

function duelQuestionSlot() {
  const settings = STATE.duel.state?.settings || getDuelSettings();
  return {
    grammarTopic: settings.grammarTopic || GRAMMAR_TOPICS[0],
    isWortstellung: isWortstellungTopic(settings.grammarTopic || ''),
  };
}

function setDuelRiskButtonsDisabled(disabled) {
  duelRiskLines?.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

async function startDuelSeries(line) {
  ensureDuelAudio();
  if (!canPlayDuelNow()) return;
  if (
    STATE.duel.questionLocked ||
    STATE.duel.currentQuestion ||
    STATE.duel.seriesLine ||
    STATE.duel.actionPower > 0
  ) return;

  STATE.duel.seriesLine = line;
  STATE.duel.seriesStep = 1;
  STATE.duel.seriesCorrect = 0;
  STATE.duel.questionLocked = true;
  setDuelRiskButtonsDisabled(true);
  duelRiskLines?.classList.add('hidden');
  await askDuelQuestion();
}

async function askDuelQuestion() {
  const line = DUEL_LINES[STATE.duel.seriesLine] || DUEL_LINES.grammar;
  playDuelSound('question');
  STATE.duel.currentQuestion = null;
  STATE.duel.questionLocked = true;
  setDuelRiskButtonsDisabled(true);
  duelClaimEl?.classList.add('hidden');
  duelActionPanel?.classList.add('hidden');
  duelSeriesEl?.classList.remove('hidden');
  if (duelSeriesMeta) {
    duelSeriesMeta.textContent =
      `${line.title} · вопрос ${STATE.duel.seriesStep}/3 · собрано ${STATE.duel.seriesCorrect}`;
  }
  if (duelQuestionEl) duelQuestionEl.textContent = 'Город достаёт вопрос...';
  if (duelOptionsEl) duelOptionsEl.innerHTML = '';

  let rawQuestion;
  try {
    const data = await duelApi('/api/duel/question', {
      roomId: STATE.duel.roomId,
      playerId: STATE.duel.playerId,
      line: STATE.duel.seriesLine,
    });
    rawQuestion = data.question;
    if (data.state) applyDuelState(data.state);
  } catch (error) {
    console.warn('Shared duel question failed:', error);
    if (duelStatus) duelStatus.textContent = `Вопрос не пришёл: ${error.message}`;
    STATE.duel.questionLocked = false;
    await pollDuelState();
    if (STATE.duel.state?.phase !== 'abandoned') {
      clearDuelSeries();
      renderDuelTurnPanel();
    }
    return;
  }
  const question = normalizeBridgeQuestion(rawQuestion);
  STATE.duel.currentQuestion = question;
  STATE.duel.questionLocked = false;
  renderDuelQuestion(question);
}

function renderDuelQuestion(question) {
  if (duelQuestionEl) duelQuestionEl.textContent = question.q.replace('___', '_____');
  if (!duelOptionsEl) return;
  duelOptionsEl.innerHTML = '';
  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option;
    button.addEventListener('click', () => answerDuelQuestion(index, button));
    duelOptionsEl.appendChild(button);
  });
}

async function answerDuelQuestion(index, button) {
  if (STATE.duel.questionLocked || !STATE.duel.currentQuestion) return;
  STATE.duel.questionLocked = true;
  const correct = STATE.duel.currentQuestion.correct === index;
  duelOptionsEl?.querySelectorAll('button').forEach((option) => { option.disabled = true; });

  if (!correct) {
    playDuelSound('wrong');
    button?.classList.add('wrong');
    await sendDuelAction({
      type: 'penalty',
      correctBefore: STATE.duel.seriesCorrect,
    });
    clearDuelSeries();
    renderDuelTurnPanel();
    return;
  }

  button?.classList.add('correct');
  playDuelSound('correct');
  STATE.duel.seriesCorrect += 1;
  STATE.duel.currentQuestion = null;

  if (STATE.duel.seriesCorrect >= 3) {
    showDuelActions(3);
    return;
  }

  duelClaimEl?.classList.remove('hidden');
  if (duelStatus) duelStatus.textContent = `Есть ${STATE.duel.seriesCorrect}/3. Забрать силу или рискнуть дальше?`;
}

function clearDuelSeries() {
  STATE.duel.seriesLine = null;
  STATE.duel.seriesStep = 1;
  STATE.duel.seriesCorrect = 0;
  STATE.duel.currentQuestion = null;
  STATE.duel.questionLocked = false;
  STATE.duel.actionPower = 0;
  duelSeriesEl?.classList.add('hidden');
  duelClaimEl?.classList.add('hidden');
  duelActionPanel?.classList.add('hidden');
  setDuelRiskButtonsDisabled(false);
}

function claimDuelPower() {
  ensureDuelAudio();
  const power = Math.max(1, STATE.duel.seriesCorrect);
  showDuelActions(power);
}

async function riskDuelNextQuestion() {
  ensureDuelAudio();
  STATE.duel.seriesStep += 1;
  await askDuelQuestion();
}

function duelOpponentId() {
  return STATE.duel.playerId === 'p1' ? 'p2' : 'p1';
}

function duelManhattan(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function duelCellInside(cell) {
  return (
    cell &&
    cell.row >= 0 &&
    cell.row < DUEL_BOARD_SIZE &&
    cell.col >= 0 &&
    cell.col < DUEL_BOARD_SIZE
  );
}

function duelCellOccupied(cell) {
  const players = STATE.duel.state?.players || {};
  return Object.values(players).some((player) => player && player.pos && duelManhattan(player.pos, cell) === 0);
}

function duelMoveDirsForPlayer(playerId) {
  if (playerId !== 'p2') return DUEL_DIRS;
  return [
    { label: 'Вперёд', row: 1, col: 0 },
    { label: 'Назад', row: -1, col: 0 },
    { label: 'Влево', row: 0, col: -1 },
    { label: 'Вправо', row: 0, col: 1 },
  ];
}

function duelDiagonalDirsForPlayer(playerId) {
  if (playerId !== 'p2') {
    return [
      { label: 'вперёд-влево', row: -1, col: 1 },
      { label: 'вперёд-вправо', row: -1, col: -1 },
      { label: 'назад-влево', row: 1, col: 1 },
      { label: 'назад-вправо', row: 1, col: -1 },
    ];
  }
  return [
    { label: 'вперёд-влево', row: 1, col: -1 },
    { label: 'вперёд-вправо', row: 1, col: 1 },
    { label: 'назад-влево', row: -1, col: -1 },
    { label: 'назад-вправо', row: -1, col: 1 },
  ];
}

function appendDuelActionButton(label, handler, disabled = false) {
  if (!duelActionPanel) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', handler);
  duelActionPanel.appendChild(button);
}

function showDuelActions(power) {
  const lineKey = STATE.duel.seriesLine || 'grammar';
  const line = DUEL_LINES[lineKey] || DUEL_LINES.grammar;
  const me = STATE.duel.state?.players?.[STATE.duel.playerId];
  const opponent = STATE.duel.state?.players?.[duelOpponentId()];
  const adjacent = duelManhattan(me?.pos, opponent?.pos) === 1;

  STATE.duel.actionPower = power;
  duelSeriesEl?.classList.add('hidden');
  duelClaimEl?.classList.add('hidden');
  duelActionPanel?.classList.remove('hidden');
  if (duelStatus) duelStatus.textContent = `${line.title}: сила ${power}. Выбери, как забрать край.`;
  if (!duelActionPanel) return;

  const moveDistance = power >= 2 ? 2 : 1;
  const pushDistance = lineKey === 'grammar' && power >= 2 ? 2 : power >= 3 ? 2 : 1;
  duelActionPanel.innerHTML = '';

  for (const dir of duelMoveDirsForPlayer(STATE.duel.playerId)) {
    const target = me ? {
      row: me.pos.row + dir.row * moveDistance,
      col: me.pos.col + dir.col * moveDistance,
    } : null;
    const disabled = !duelCellInside(target) || duelCellOccupied(target);
    appendDuelActionButton(
      `${moveDistance > 1 ? 'Рывок' : 'Шаг'}: ${dir.label}`,
      () => commitDuelMove(target, power, lineKey),
      disabled,
    );
  }

  if (lineKey === 'lexicon' && power >= 2) {
    for (const dir of duelDiagonalDirsForPlayer(STATE.duel.playerId)) {
      const target = me ? { row: me.pos.row + dir.row, col: me.pos.col + dir.col } : null;
      const disabled = !duelCellInside(target) || duelCellOccupied(target);
      appendDuelActionButton(`Скользнуть ${dir.label}`, () => commitDuelMove(target, power, lineKey), disabled);
    }
  }

  if (lineKey === 'grammar') {
    appendDuelActionButton(
      `Толчок ${pushDistance}`,
      () => commitDuelPush(power, lineKey),
      !adjacent,
    );
  }

  if (lineKey === 'translation' && power >= 2) {
    appendDuelActionButton(
      'Смена мест',
      () => commitDuelSwap(power, lineKey),
      duelManhattan(me?.pos, opponent?.pos) > 2,
    );
  }

  appendDuelActionButton('Упереться', () => commitDuelGuard(power, lineKey));
}

async function sendDuelAction(action) {
  if (!STATE.duel.roomId || !STATE.duel.playerId) return false;
  try {
    const data = await duelApi('/api/duel/action', {
      roomId: STATE.duel.roomId,
      playerId: STATE.duel.playerId,
      action,
    });
    applyDuelState(data.state);
    return true;
  } catch (error) {
    if (duelStatus) duelStatus.textContent = `Действие не принято: ${error.message}`;
    await pollDuelState();
    return false;
  }
}

async function commitDuelMove(target, power, line) {
  if (!target) return;
  if (await sendDuelAction({ type: 'move', target, power, line })) {
    clearDuelSeries();
    renderDuelTurnPanel();
  }
}

async function commitDuelPush(power, line) {
  if (await sendDuelAction({ type: 'push', power, line })) {
    clearDuelSeries();
    renderDuelTurnPanel();
  }
}

async function commitDuelSwap(power, line) {
  if (await sendDuelAction({ type: 'swap', power, line })) {
    clearDuelSeries();
    renderDuelTurnPanel();
  }
}

async function commitDuelGuard(power, line) {
  if (await sendDuelAction({ type: 'guard', power, line })) {
    clearDuelSeries();
    renderDuelTurnPanel();
  }
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);
}

function duelWorldPosition(cell) {
  const row = Number(cell?.row ?? 0);
  const col = Number(cell?.col ?? Math.floor(DUEL_BOARD_SIZE / 2));
  const clampedRow = THREE.MathUtils.clamp(row, 0, BRIDGE_ROWS - 1);
  const clampedCol = THREE.MathUtils.clamp(col, 0, BRIDGE_COLS - 1);
  const rowOffset = row - clampedRow;
  const colOffset = col - clampedCol;
  const cellLen = STATE.bridgeLength / BRIDGE_ROWS || TILE_SIZE;
  return cellWorldPosition(clampedRow, clampedCol)
    .addScaledVector(STATE.forwardDir, rowOffset * cellLen)
    .addScaledVector(STATE.rightDir, colOffset * (TILE_SIZE + TILE_GAP));
}

function duelPlayerName(playerId) {
  return STATE.duel.state?.players?.[playerId]?.name || (playerId === 'p1' ? 'Spieler 1' : 'Spieler 2');
}

function startDuelMannequinAnimation(playerId, fromCell, toCell, options = {}) {
  if (!playerId || playerId === STATE.duel.playerId) return;
  ensureDuelMannequins();
  const mannequin = STATE.duel.mannequins[playerId];
  if (!mannequin) return;

  const now = performance.now();
  const duration = options.duration || (options.fall ? 2300 : 420);
  const from = duelWorldPosition(fromCell);
  const to = duelWorldPosition(toCell || fromCell);
  STATE.duel.visualLocks[playerId] = now + duration + 180;
  STATE.duel.visualAnims = STATE.duel.visualAnims.filter((anim) => anim.playerId !== playerId);
  STATE.duel.visualAnims.push({
    playerId,
    start: now,
    duration,
    from,
    to,
    fall: Boolean(options.fall),
    spin: playerId === 'p1' ? -1 : 1,
  });
  mannequin.visible = true;
  mannequin.position.copy(from);
  mannequin.position.y += 0.1;
}

function startDuelFallView(action) {
  const from = duelWorldPosition(action.from);
  const to = duelWorldPosition(action.to || action.from);
  STATE.duel.fallView = {
    start: performance.now(),
    duration: FALL_DURATION_MS,
    from,
    to,
    yaw: STATE.player.yaw,
    pitch: STATE.player.pitch,
    roll: STATE.duel.playerId === 'p1' ? 1 : -1,
  };
}

function updateDuelVisuals(t, dt) {
  if (!STATE.duel.visualAnims.length) return;
  STATE.duel.visualAnims = STATE.duel.visualAnims.filter((anim) => {
    const mannequin = STATE.duel.mannequins[anim.playerId];
    if (!mannequin) return false;
    const p = THREE.MathUtils.clamp((t - anim.start) / anim.duration, 0, 1);
    const e = easeOutCubic(p);
    mannequin.position.copy(anim.from).lerp(anim.to, e);
    mannequin.position.y += 0.1;
    if (anim.fall) {
      mannequin.position.y -= Math.pow(p, 2.05) * 34;
      mannequin.rotation.x = p * Math.PI * 1.25 * anim.spin;
      mannequin.rotation.z = Math.sin(p * Math.PI) * 0.9 * anim.spin;
    } else {
      mannequin.position.y += Math.sin(p * Math.PI) * 0.18;
      mannequin.rotation.z = Math.sin(p * Math.PI) * 0.12 * anim.spin;
    }
    mannequin.rotation.y = (anim.playerId === 'p1' ? STATE.bridgeYaw : STATE.bridgeYaw + Math.PI) + p * 0.55 * anim.spin;
    mannequin.visible = true;
    return p < 1;
  });

  const now = performance.now();
  for (const [playerId, until] of Object.entries(STATE.duel.visualLocks)) {
    if (until <= now) delete STATE.duel.visualLocks[playerId];
  }
}

function handleDuelActionEvent(action) {
  if (!action || !Number.isFinite(Number(action.id)) || Number(action.id) <= STATE.duel.seenActionId) return;
  STATE.duel.seenActionId = Number(action.id);

  const me = STATE.duel.playerId;
  if (action.type === 'join') {
    playDuelSound('round');
    return;
  }

  if (action.type === 'move') {
    playDuelSound('move');
    startDuelMannequinAnimation(action.actorId, action.from, action.to);
    return;
  }

  if (action.type === 'push') {
    playDuelSound('push');
    startDuelMannequinAnimation(action.targetId, action.from, action.to, { duration: 560 });
    return;
  }

  if (action.type === 'guard' || action.type === 'guardBlock') {
    playDuelSound('guard');
    return;
  }

  if (action.type === 'swap') {
    playDuelSound('swap');
    startDuelMannequinAnimation(action.actorId, action.actorFrom, action.actorTo, { duration: 620 });
    startDuelMannequinAnimation(action.targetId, action.targetFrom, action.targetTo, { duration: 620 });
    return;
  }

  if (action.type === 'penalty') {
    if (action.actorId !== me) playDuelSound('wrong');
    return;
  }

  if (action.type === 'penaltyStep') {
    playDuelSound('move');
    startDuelMannequinAnimation(action.targetId, action.from, action.to, { duration: 520 });
    return;
  }

  if (action.type === 'fall') {
    clearDuelSeries();
    playDuelSound('fall');
    setTimeout(() => playDuelSound('round'), 320);
    if (action.fallenId === me) {
      startDuelFallView(action);
    } else {
      startDuelMannequinAnimation(action.fallenId, action.from, action.to, { fall: true, duration: 2350 });
    }
    const fallenName = duelPlayerName(action.fallenId);
    const winnerName = duelPlayerName(action.winner || action.attackerId);
    showDuelEventBanner(
      action.final ? 'Дуэль завершена' : 'Раунд завершён',
      `${fallenName}: -1 жизнь`,
      action.final ? `${winnerName} забирает мост.` : `Осталось жизней: ${Math.max(0, action.livesAfter ?? 0)}`,
      'danger',
    );
  }
}

function createMannequin(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.15,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x111821,
    roughness: 0.6,
    metalness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.9, 12), mat);
  body.position.y = 0.62;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
  head.position.y = 1.22;
  group.add(head);

  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.72, 8), dark);
    arm.position.set(sx * 0.34, 0.7, 0);
    arm.rotation.z = sx * 0.28;
    group.add(arm);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.72, 8), dark);
    leg.position.set(sx * 0.12, 0.1, 0);
    group.add(leg);
  }

  group.userData.isDuelMannequin = true;
  return group;
}

function ensureDuelMannequins() {
  if (!STATE.duel.mannequins.p1) {
    STATE.duel.mannequins.p1 = createMannequin(0x5ca8ff);
    scene.add(STATE.duel.mannequins.p1);
  }
  if (!STATE.duel.mannequins.p2) {
    STATE.duel.mannequins.p2 = createMannequin(0xff6767);
    scene.add(STATE.duel.mannequins.p2);
  }
}

function syncDuelMannequins(state) {
  ensureDuelMannequins();
  for (const id of ['p1', 'p2']) {
    const player = state.players?.[id];
    const mannequin = STATE.duel.mannequins[id];
    if (!mannequin) continue;
    if (STATE.duel.visualLocks[id] && STATE.duel.visualLocks[id] > performance.now()) {
      mannequin.visible = true;
      continue;
    }
    mannequin.visible = Boolean(player) && id !== STATE.duel.playerId;
    if (!player) continue;
    const target = cellWorldPosition(player.pos.row, player.pos.col);
    mannequin.position.copy(target);
    mannequin.position.y += 0.1;
    mannequin.rotation.y = id === 'p1' ? STATE.bridgeYaw : STATE.bridgeYaw + Math.PI;
  }
}

function updateDuelCamera() {
  const fall = STATE.duel.fallView;
  if (fall) {
    const p = THREE.MathUtils.clamp((performance.now() - fall.start) / fall.duration, 0, 1);
    const e = easeOutCubic(p);
    camera.position.copy(fall.from).lerp(fall.to, e);
    camera.position.y += PLAYER_EYE - Math.pow(p, 2.05) * 38;
    const yaw = fall.yaw + Math.sin(p * Math.PI) * 0.22 * fall.roll;
    const pitch = fall.pitch - p * 1.05;
    const lookDir = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(camera.position.clone().add(lookDir));
    camera.rotation.z += p * 0.38 * fall.roll;
    if (altitudeEl) altitudeEl.textContent = `${Math.max(0, Math.round(camera.position.y - 1))} м`;
    if (p >= 1) {
      STATE.duel.fallView = null;
      resetDuelViewForPlayer(STATE.duel.playerId);
    }
    return;
  }

  const me = STATE.duel.state?.players?.[STATE.duel.playerId];
  if (!me) return;

  camera.position.copy(cellWorldPosition(me.pos.row, me.pos.col));
  camera.position.y += PLAYER_EYE;

  const yaw = STATE.player.yaw;
  const pitch = STATE.player.pitch;
  const lookDir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(camera.position.clone().add(lookDir));
  if (altitudeEl) altitudeEl.textContent = `${Math.round(camera.position.y)} м`;
}

duelOpenBtn?.addEventListener('click', openDuelMenu);
duelMenuCloseBtn?.addEventListener('click', closeDuelMenu);
duelCreateBtn?.addEventListener('click', createDuelRoom);
duelJoinBtn?.addEventListener('click', () => joinDuelRoom());
duelRoomInput?.addEventListener('input', () => {
  const clean = duelRoomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (duelRoomInput.value !== clean) duelRoomInput.value = clean;
});
duelRiskLines?.querySelectorAll('[data-duel-line]').forEach((button) => {
  button.addEventListener('click', () => startDuelSeries(button.dataset.duelLine));
});
duelClaimBtn?.addEventListener('click', claimDuelPower);
duelRiskBtn?.addEventListener('click', riskDuelNextQuestion);

const duelUrlRoom = new URLSearchParams(window.location.search).get('duel');
if (duelUrlRoom && duelRoomInput) {
  duelRoomInput.value = duelUrlRoom.toUpperCase();
  openDuelMenu();
}

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
  if (questionScoreEl) {
    questionScoreEl.textContent = `${STATE.questionsCorrect}/${STATE.questionsAnswered}`;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function recordQuestionOutcome(question, correct) {
  const meta = question?.meta;
  const targetSlot =
    getQuestionSlotForCell(STATE.questionTargetCell.row, STATE.questionTargetCell.col) ||
    getCurrentQuestionSlot();
  STATE.questionsAnswered += 1;
  if (correct) STATE.questionsCorrect += 1;

  if (!correct && meta?.generated) {
    questionBank.returnQuestion(meta);
  }

  const display = String(meta?.display || question?.q || '').replace(/_{2,}/g, '—');
  STATE.diaryEntries.push({
    id: `${performance.now()}:${STATE.diaryEntries.length}`,
    correct,
    level: meta?.level || STATE.questionSettings?.langLevel || '',
    topic: meta?.topic || targetSlot?.grammarTopic || '',
    lexicalTopic: meta?.lexicalTopic || STATE.questionSettings?.lexicalTopic || '',
    text: meta?.text || '',
    display,
  });
  updateHudProgress();
}

function renderDiary(afterFall = false) {
  if (!diaryListEl) return;

  if (!STATE.diaryEntries.length) {
    diaryListEl.innerHTML = afterFall
      ? '<div class="diary-empty">Страницы молчат: мост оборвал путь раньше, чем ответ успел стать записью.</div>'
      : '<div class="diary-empty">Пока нет отвеченных вопросов.</div>';
    return;
  }

  diaryListEl.innerHTML = STATE.diaryEntries.map((entry, index) => (
    `<article class="diary-entry">` +
    `<div class="diary-meta">${index + 1}. ${entry.correct ? 'стекло выдержало' : 'трещина запомнила'} · ${escapeHtml(entry.topic)} · ${escapeHtml(entry.level)} · ${escapeHtml(entry.lexicalTopic)}</div>` +
    `<div class="diary-text">${escapeHtml(entry.text || 'Вопрос')}</div>` +
    `<div class="diary-display">${escapeHtml(entry.display)}</div>` +
    `</article>`
  )).join('');
}

function showDiary(options = {}) {
  const afterFall = Boolean(options.afterFall);
  STATE.diaryForced = afterFall;
  renderDiary(afterFall);
  diaryEl?.classList.toggle('diary-forced', afterFall);
  if (diaryCloseBtn) diaryCloseBtn.textContent = afterFall ? 'Продолжить' : 'Закрыть';
  diaryEl?.classList.remove('hidden');
}

function hideDiary() {
  const wasForced = STATE.diaryForced;
  STATE.diaryForced = false;
  diaryEl?.classList.remove('diary-forced');
  if (diaryCloseBtn) diaryCloseBtn.textContent = 'Закрыть';
  diaryEl?.classList.add('hidden');
}

function setOptionsDisabled(disabled) {
  optionsEl.querySelectorAll('button').forEach((button) => {
    button.disabled = disabled;
  });
}

function setQuestionControlsOpen(isOpen) {
  moveControls?.classList.toggle('question-open', isOpen);
}

function clearQuestion() {
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionLocked = false;
  STATE.questionRequestToken++;
  STATE.questionTargetCell.row = -999;
  STATE.questionTargetCell.col = -999;
  STATE.preparedQuestion = null;
  STATE.preparedQuestionCell.row = -999;
  STATE.preparedQuestionCell.col = -999;
  STATE.answeredMoveCell.row = -999;
  STATE.answeredMoveCell.col = -999;
  quizEl.classList.add('hidden');
  setQuestionControlsOpen(false);
  moveControls?.classList.remove('locked');
}

function getQuestionSlotForCell(row, col) {
  const slots = STATE.questionSettings?.grammarSlots;
  if (!Array.isArray(slots) || !slots.length || row < 0) return null;
  return slots[col] || slots[col % slots.length] || null;
}

function getCurrentQuestionSlot() {
  return getQuestionSlotForCell(STATE.playerCell.row, STATE.playerCell.col);
}

function normalizeBridgeQuestion(rawQuestion) {
  if (!rawQuestion) return pickQuestion();
  if (typeof rawQuestion.q === 'string') return rawQuestion;

  const correct = Number.isInteger(rawQuestion.correctIndex)
    ? rawQuestion.correctIndex
    : rawQuestion.correct;
  if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length !== 4 || !Number.isInteger(correct)) {
    return pickQuestion();
  }
  return {
    q: [rawQuestion.text, rawQuestion.display].filter(Boolean).join(' ').trim(),
    options: rawQuestion.options || [],
    correct,
    meta: rawQuestion,
  };
}

function showQuestionLoading(slot) {
  STATE.questionLoading = true;
  STATE.questionLocked = true;
  STATE.currentQuestion = null;
  questionEl.textContent = slot?.grammarTopic
    ? `Стекло вспоминает ${slot.grammarTopic}`
    : 'Стекло прислушивается...';
  optionsEl.innerHTML = '<div class="option option-loading">Город достаёт из темноты четыре ответа...</div>';
  if (hintEl) {
    hintEl.textContent = 'Вопрос придёт из уже зажжённых огней, если они ещё помнят эту тему.';
  }
  quizEl.classList.remove('shake');
  quizEl.classList.remove('hidden');
  setQuestionControlsOpen(true);
  moveControls?.classList.add('locked');
}

function isSameCell(cell, row, col) {
  return cell.row === row && cell.col === col;
}

function displayQuestion(question, options = {}) {
  const locked = Boolean(options.locked);
  const armTile = options.armTile !== false;
  const keepPrepared = Boolean(options.keepPrepared);

  STATE.currentQuestion = question;
  STATE.questionLoading = false;
  STATE.questionLocked = locked;
  if (!keepPrepared) {
    STATE.preparedQuestion = null;
    STATE.preparedQuestionCell.row = -999;
    STATE.preparedQuestionCell.col = -999;
  }

  questionEl.textContent = STATE.currentQuestion.q.replace('___', '_____');
  optionsEl.innerHTML = '';
  STATE.currentQuestion.options.forEach((option, idx) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.textContent = option;
    button.disabled = locked;
    button.addEventListener('click', () => onAnswer(idx, button));
    optionsEl.appendChild(button);
  });
  if (hintEl) {
    const meta = STATE.currentQuestion.meta;
    hintEl.textContent = meta?.topic
      ? `${meta.topic} · ${meta.level || STATE.questionSettings?.langLevel || ''} · ${meta.lexicalTopic || STATE.questionSettings?.lexicalTopic || ''}`
      : 'Ответ откроет следующий шаг. Время стекла не показывается.';
  }

  quizEl.classList.remove('shake');
  quizEl.classList.remove('hidden');
  setQuestionControlsOpen(true);
  moveControls?.classList.add('locked');

  if (armTile) {
    const idx = currentTileIndex();
    if (idx >= 0) armFragileTile(idx);
  }
}

async function startQuestion(row = STATE.playerCell.row, col = STATE.playerCell.col) {
  if (!STATE.active || STATE.falling || STATE.won) return;
  if (row < 0 || row > BRIDGE_ROWS) return;

  if (STATE.preparedQuestion && isSameCell(STATE.preparedQuestionCell, row, col) && !STATE.moving) {
    displayQuestion(STATE.preparedQuestion);
    return;
  }

  const token = ++STATE.questionRequestToken;
  STATE.questionTargetCell.row = row;
  STATE.questionTargetCell.col = col;
  STATE.preparedQuestion = null;
  STATE.preparedQuestionCell.row = -999;
  STATE.preparedQuestionCell.col = -999;

  const slot = getQuestionSlotForCell(row, col);
  showQuestionLoading(slot);

  let rawQuestion = null;
  try {
    rawQuestion = await questionBank.nextQuestion(slot);
  } catch (error) {
    console.warn('QuestionBank failed; using bridge fallback question.', error);
    rawQuestion = pickQuestion();
  }

  if (token !== STATE.questionRequestToken || !STATE.active || STATE.falling || STATE.won) return;

  const question = normalizeBridgeQuestion(rawQuestion);
  if (!STATE.moving) {
    displayQuestion(question);
    return;
  }

  if (STATE.moving && isSameCell(STATE.moveTargetCell, row, col)) {
    STATE.preparedQuestion = question;
    STATE.preparedQuestionCell.row = row;
    STATE.preparedQuestionCell.col = col;
    displayQuestion(question, { locked: true, armTile: false, keepPrepared: true });
  }
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

  const answeredQuestion = STATE.currentQuestion;
  const target = {
    row: STATE.questionTargetCell.row,
    col: STATE.questionTargetCell.col,
  };
  const correct = answeredQuestion.correct === idx;
  STATE.questionLocked = true;
  setOptionsDisabled(true);
  recordQuestionOutcome(answeredQuestion, correct);

  if (correct) {
    button.classList.add('correct');
    setTimeout(() => {
      if (!STATE.active || STATE.falling || STATE.won) return;
      clearQuestion();
      if (isCellInBounds(target.row, target.col) && target.row >= 0) {
        startMoveToCell(target.row, target.col, { questionAnswered: true });
      }
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
    startQuestion(target.row, target.col);
  }, 620);
}

function enterPlay(options = {}) {
  if (STATE.mode === 'duel') leaveDuelMode();
  STATE.mode = 'solo';
  STATE.bridgeLevel = 1;
  STATE.weakGlassStreakMs = 0;
  STATE.weakGlassLastT = 0;
  if (options.resetRun) rebuildRun();
  intro.classList.add('hidden');
  pauseMenuEl?.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  diaryEl?.classList.add('hidden');
  hud.classList.remove('hidden');
  moveControls?.classList.remove('hidden');
  moveControls?.classList.remove('locked');
  setQuestionControlsOpen(false);
  quizEl.classList.add('hidden');
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionLocked = false;
  STATE.questionRequestToken++;
  STATE.questionsAnswered = 0;
  STATE.questionsCorrect = 0;
  STATE.diaryEntries = [];
  STATE.diaryForced = false;
  STATE.intro = false;
  STATE.active = true;
  STATE.paused = false;
  STATE.falling = false;
  setDangerWarning(0);
  updateHudProgress();
}

function showIntro() {
  stepTotal.textContent = String(BRIDGE_ROWS);
  stepNumber.textContent = '0';
  intro.classList.remove('hidden');
  hud.classList.add('hidden');
  pauseMenuEl?.classList.add('hidden');
  dashboard.setReady(true);
  STATE.intro = true;
  STATE.active = false;
  STATE.paused = false;
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionLocked = false;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  moveControls?.classList.remove('locked');
  setQuestionControlsOpen(false);
  setDangerWarning(0);
}

function pauseGame() {
  if (!STATE.active || STATE.falling || STATE.won || STATE.paused) return;
  STATE.paused = true;
  stopCameraDrag();
  pauseMenuEl?.classList.remove('hidden');
  moveControls?.classList.add('locked');
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
}

function resumeGame() {
  if (!STATE.paused) return;
  STATE.paused = false;
  STATE.active = true;
  pauseMenuEl?.classList.add('hidden');
  if (!STATE.currentQuestion && !STATE.questionLoading) {
    moveControls?.classList.remove('locked');
  }
}

function openSettingsFromPause() {
  if (!STATE.paused) return;
  STATE.paused = false;
  STATE.active = false;
  STATE.returningFromSettings = true;
  pauseMenuEl?.classList.add('hidden');
  hud.classList.add('hidden');
  moveControls?.classList.add('hidden');
  moveControls?.classList.remove('locked');
  quizEl.classList.add('hidden');
  setQuestionControlsOpen(false);
  if (STATE.currentQuestion?.meta?.generated && !STATE.questionLocked) {
    questionBank.returnQuestion(STATE.currentQuestion.meta);
  }
  clearQuestion();
  dashboard.showStep(4);
  intro.classList.remove('hidden');
}

restartBtn.addEventListener('click', () => {
  softRestart();
});

diaryBtn?.addEventListener('click', showDiary);
diaryCloseBtn?.addEventListener('click', hideDiary);
diaryEl?.addEventListener('click', (event) => {
  if (event.target === diaryEl && !STATE.diaryForced) hideDiary();
});
pauseBtn?.addEventListener('click', pauseGame);
resumeBtn?.addEventListener('click', resumeGame);
settingsBtn?.addEventListener('click', openSettingsFromPause);

// ====================================================================
// INPUT
// ====================================================================
function rotateCameraByDelta(dx, dy) {
  STATE.player.yaw -= dx * MOUSE_SENS;
  STATE.player.pitch -= dy * MOUSE_SENS;
  STATE.player.pitch = THREE.MathUtils.clamp(STATE.player.pitch, -1.35, 1.35);
}

function stopCameraDrag() {
  STATE.cameraDragging = false;
  STATE.cameraPointerId = null;
}

function canUseCameraLook() {
  return Boolean(
    !STATE.paused &&
    !STATE.falling &&
    !STATE.won &&
    (STATE.active || (STATE.mode === 'duel' && STATE.duel.active)),
  );
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canUseCameraLook()) return;
  if (!e.isPrimary) return;
  e.preventDefault();
  STATE.cameraDragging = true;
  STATE.cameraPointerId = e.pointerId;
  STATE.cameraPointerLastX = e.clientX;
  STATE.cameraPointerLastY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});

window.addEventListener('pointerup', (e) => {
  if (STATE.cameraPointerId !== null && e.pointerId !== STATE.cameraPointerId) return;
  stopCameraDrag();
});

window.addEventListener('pointercancel', (e) => {
  if (STATE.cameraPointerId !== null && e.pointerId !== STATE.cameraPointerId) return;
  stopCameraDrag();
});

document.addEventListener('pointermove', (e) => {
  if (STATE.paused || STATE.pointerLocked || !STATE.cameraDragging) return;
  if (STATE.cameraPointerId !== null && e.pointerId !== STATE.cameraPointerId) return;
  e.preventDefault();

  const dx = e.clientX - STATE.cameraPointerLastX;
  const dy = e.clientY - STATE.cameraPointerLastY;
  STATE.cameraPointerLastX = e.clientX;
  STATE.cameraPointerLastY = e.clientY;
  rotateCameraByDelta(dx, dy);
});

document.addEventListener('pointerlockchange', () => {
  STATE.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (STATE.paused) return;
  if (!STATE.pointerLocked) return;
  rotateCameraByDelta(e.movementX, e.movementY);
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

function isTextEntryTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

document.addEventListener('keydown', (e) => {
  if (isTextEntryTarget(e.target)) return;

  if (e.code === 'Escape') {
    e.preventDefault();
    if (STATE.diaryForced) return;
    if (STATE.paused) resumeGame();
    else pauseGame();
    return;
  }
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

function isCellInBounds(row, col) {
  return row >= -1 && row <= BRIDGE_ROWS && col >= 0 && col < BRIDGE_COLS;
}

function cameraForwardFlat() {
  const forward = new THREE.Vector3(
    -Math.sin(STATE.player.yaw),
    0,
    -Math.cos(STATE.player.yaw),
  );
  if (forward.lengthSq() < 0.0001) return STATE.forwardDir.clone();
  return forward.normalize();
}

function cameraSideFlat() {
  const right = new THREE.Vector3().crossVectors(cameraForwardFlat(), WORLD_UP);
  if (right.lengthSq() < 0.0001) return STATE.rightDir.clone();
  return right.normalize();
}

function directionForMoveCommand(command) {
  const forward = cameraForwardFlat();
  const right = cameraSideFlat();
  if (command === 'forward') return forward;
  if (command === 'back') return forward.multiplyScalar(-1);
  if (command === 'right') return right;
  if (command === 'left') return right.multiplyScalar(-1);
  return null;
}

function cameraRelativeTargetCell(command) {
  const desired = directionForMoveCommand(command);
  if (!desired) return null;

  const { row, col } = STATE.playerCell;
  const origin = cellWorldPosition(row, col);
  const candidates = [
    { row: row + 1, col },
    { row, col: col + 1 },
    { row: row - 1, col },
    { row, col: col - 1 },
  ].filter((cell) => isCellInBounds(cell.row, cell.col));

  let best = null;
  let bestDot = -Infinity;

  for (const cell of candidates) {
    const stepDir = cellWorldPosition(cell.row, cell.col).sub(origin);
    stepDir.y = 0;
    if (stepDir.lengthSq() < 0.0001) continue;
    const dot = stepDir.normalize().dot(desired);
    if (dot > bestDot) {
      best = cell;
      bestDot = dot;
    }
  }

  return bestDot > MOVE_DIRECTION_MIN_DOT ? best : null;
}

function randomFragileDurationMs() {
  const extra =
    FRAGILE_EXTRA_MIN_SECONDS +
    Math.random() * (FRAGILE_EXTRA_MAX_SECONDS - FRAGILE_EXTRA_MIN_SECONDS);
  const difficultyScale = {
    easy: 3.0,
    medium: 1.75,
    hard: 1.0,
  }[STATE.questionSettings?.difficulty || 'hard'] || 1.0;
  return (FRAGILE_BASE_SECONDS + extra) * 1000 * difficultyScale;
}

function armFragileTile(idx, now = performance.now()) {
  if (STATE.bridgeLevel >= 2) return;
  const meta = STATE.tileMeta[idx];
  if (!meta || !meta.fragile || meta.broken || meta.triggered) return;
  meta.triggered = true;
  meta.triggerTime = now;
  meta.dangerDuration = randomFragileDurationMs();
}

function resetWeakGlassTimer(t = performance.now()) {
  STATE.weakGlassStreakMs = 0;
  STATE.weakGlassLastT = t;
}

function updateSecondLevelWeakGlassTimer(t) {
  if (STATE.bridgeLevel !== 2) return 0;

  if (STATE.moving) {
    STATE.weakGlassLastT = t;
    return STATE.weakGlassStreakMs > 0
      ? THREE.MathUtils.clamp(STATE.weakGlassStreakMs / SECOND_LEVEL_FRAGILE_LIMIT_MS, 0, 1) * 0.45
      : 0;
  }

  const idx = currentTileIndex();
  if (idx < 0) {
    resetWeakGlassTimer(t);
    return 0;
  }

  const meta = STATE.tileMeta[idx];
  if (!meta || !meta.fragile || meta.broken) {
    resetWeakGlassTimer(t);
    return 0;
  }

  if (STATE.weakGlassLastT <= 0) STATE.weakGlassLastT = t;
  const delta = THREE.MathUtils.clamp(t - STATE.weakGlassLastT, 0, 250);
  STATE.weakGlassStreakMs += delta;
  STATE.weakGlassLastT = t;

  const ratio = THREE.MathUtils.clamp(
    STATE.weakGlassStreakMs / SECOND_LEVEL_FRAGILE_LIMIT_MS,
    0,
    1,
  );
  meta.crackProgress = Math.max(meta.crackProgress, ratio * 0.95);

  if (STATE.weakGlassStreakMs >= SECOND_LEVEL_FRAGILE_LIMIT_MS) {
    breakTile(idx);
    triggerFall();
    return 1;
  }

  return 0.12 + ratio * 0.88;
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

  if (isSameCell(STATE.answeredMoveCell, row, col)) {
    STATE.answeredMoveCell.row = -999;
    STATE.answeredMoveCell.col = -999;
    moveControls?.classList.remove('locked');
    setDangerWarning(0);
    return;
  }

  if (STATE.preparedQuestion && isSameCell(STATE.preparedQuestionCell, row, col)) {
    displayQuestion(STATE.preparedQuestion);
    return;
  }

  if (STATE.questionLoading && isSameCell(STATE.questionTargetCell, row, col)) {
    return;
  }

  startQuestion(row, col);
}

function startMoveToCell(row, col, options = {}) {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;

  STATE.moving = true;
  STATE.moveStart = performance.now();
  STATE.moveFrom.copy(STATE.player.pos);
  STATE.moveTo.copy(cellWorldPosition(row, col));
  STATE.moveTargetCell.row = row;
  STATE.moveTargetCell.col = col;
  if (options.questionAnswered) {
    STATE.answeredMoveCell.row = row;
    STATE.answeredMoveCell.col = col;
  } else {
    STATE.answeredMoveCell.row = -999;
    STATE.answeredMoveCell.col = -999;
  }
  moveControls?.classList.add('locked');
  setDangerWarning(0);
}

function prepareMoveQuestion(row, col) {
  if (!STATE.active || STATE.falling || STATE.won || STATE.moving) return;
  if (row < 0 || row > BRIDGE_ROWS) return;

  clearQuestion();
  STATE.moveTargetCell.row = row;
  STATE.moveTargetCell.col = col;
  setDangerWarning(0);
  startQuestion(row, col);
}

function requestMove(command) {
  if (STATE.mode === 'duel') return;
  if (!STATE.active || STATE.paused || STATE.falling || STATE.won || STATE.moving) return;
  if (STATE.currentQuestion || STATE.questionLoading) return;

  const target = cameraRelativeTargetCell(command);
  if (!target) return;
  prepareMoveQuestion(target.row, target.col);
}

function updateGame(t) {
  if (STATE.mode === 'duel') {
    setDangerWarning(0);
  } else {
    updateMovementGame(t);
  }
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
  if (STATE.falling || STATE.won || STATE.paused || !STATE.active) {
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

  warningStrength = Math.max(warningStrength, updateSecondLevelWeakGlassTimer(t));
  if (STATE.falling) return;

  setDangerWarning(warningStrength);
}

function startSecondLevel() {
  STATE.bridgeLevel = 2;
  rebuildRun();
  intro.classList.add('hidden');
  pauseMenuEl?.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  diaryEl?.classList.add('hidden');
  hud.classList.remove('hidden');
  moveControls?.classList.remove('hidden');
  moveControls?.classList.remove('locked');
  setQuestionControlsOpen(false);
  quizEl.classList.add('hidden');
  STATE.intro = false;
  STATE.active = true;
  STATE.paused = false;
  STATE.falling = false;
  STATE.won = false;
  STATE.diaryForced = false;
  resetWeakGlassTimer(0);
  setDangerWarning(0);
  updateHudProgress();
}

function onWin() {
  if (STATE.won) return;
  if (STATE.bridgeLevel === 1) {
    startSecondLevel();
    return;
  }

  STATE.won = true;
  STATE.active = false;
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionRequestToken++;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  setQuestionControlsOpen(false);
  setDangerWarning(0);
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();

  endTitle.textContent = 'Du hast es geschafft!';
  endText.textContent = 'Оба пролёта остались позади. Внизу гаснут окна, а мост больше не спорит с тобой.';
  gameoverEl.classList.remove('hidden');
}

function triggerFall() {
  if (STATE.falling) return;
  STATE.falling = true;
  STATE.active = false;
  STATE.paused = false;
  STATE.moving = false;
  STATE.currentQuestion = null;
  STATE.questionLoading = false;
  STATE.questionRequestToken++;
  quizEl.classList.add('hidden');
  moveControls?.classList.add('hidden');
  setQuestionControlsOpen(false);
  pauseMenuEl?.classList.add('hidden');
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

function animate(frameTime = performance.now()) {
  if (
    QUALITY.frameIntervalMs > 0 &&
    STATE.lastFrameAt > 0 &&
    frameTime - STATE.lastFrameAt < QUALITY.frameIntervalMs
  ) {
    requestAnimationFrame(animate);
    return;
  }
  STATE.lastFrameAt = frameTime;

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now();

  for (const a of STATE.aviationLights) {
    const v = (Math.sin(t * 0.0025 + a.phase) + 1) * 0.5;
    const intensity = a.white
      ? 0.08 + Math.pow(v, 6) * 1.35
      : 0.2 + v * 0.8;
    if (a.light) a.light.intensity = intensity * 0.7;
    if (a.white) {
      a.bulb.material.color.setRGB(intensity, intensity, intensity);
    } else {
      a.bulb.material.color.setRGB(intensity, 0.18 * intensity, 0.18 * intensity);
    }
  }

  updateGame(t);
  if (STATE.mode === 'duel') updateDuelVisuals(t, dt);

  for (let i = 0; i < STATE.tiles.length; i++) {
    const tile = STATE.tiles[i];
    const meta = STATE.tileMeta[i];

    if (STATE.active && !STATE.paused && meta.triggered && meta.fragile && !meta.broken) {
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

  if (STATE.mode === 'duel') {
    updateDuelCamera();
  } else if (!STATE.falling) {
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
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ====================================================================
// BOOT
// ====================================================================
if (bootScene()) {
  loadRealCityInBackground();
}
