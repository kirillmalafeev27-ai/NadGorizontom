import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pickQuestion } from './questions.js';

// ====================================================================
// CONSTANTS
// ====================================================================
const PLAYER_EYE     = 1.7;
const TILE_SIZE      = 1.6;
const TILE_THICKNESS = 0.07;
const TILE_GAP       = 0.05;
const TILE_COUNT     = 12;
const QUESTION_TIME  = 7.0;
const PLATFORM_SIZE  = 9.0;
const BRIDGE_WIDTH   = 1.7;

// ====================================================================
// RENDERER / SCENE / CAMERA
// ====================================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);
scene.fog = new THREE.FogExp2(0x0b1424, 0.0026);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 8000);

// ====================================================================
// LIGHTS
// ====================================================================
scene.add(new THREE.HemisphereLight(0x39547a, 0x06080d, 0.55));
const moon = new THREE.DirectionalLight(0xb8caea, 0.6);
moon.position.set(220, 480, 180);
scene.add(moon);
// Warm bounce from city lights below
const warmBounce = new THREE.HemisphereLight(0xff9b58, 0x000000, 0.18);
warmBounce.position.set(0, -1, 0);
scene.add(warmBounce);

// Procedural environment for glass reflections
const envScene = new THREE.Scene();
{
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0b1730, side: THREE.BackSide,
    }),
  );
  envScene.add(top);
  // Warm city band near horizon
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 6, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff7a3c, side: THREE.BackSide, transparent: true, opacity: 0.85,
    }),
  );
  band.position.y = -2;
  envScene.add(band);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 1.5, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd28a, side: THREE.BackSide,
    }),
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
  tiles: [],          // Group per tile
  tileMeta: [],       // { fragile, crackProgress, glassMat, cracks }
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  bridgeYStart: 0,
  bridgeYEnd: 0,
  forwardDir: new THREE.Vector3(),
  rightDir: new THREE.Vector3(),

  step: 0,            // 0 = on start platform; 1..N = tile index; N+1 = on target
  totalSteps: TILE_COUNT + 1,
  active: false,
  qStartTime: 0,      // performance.now ms when timer started
  questionLocked: false,

  cameraPos: new THREE.Vector3(),
  cameraLook: new THREE.Vector3(),
  camTargetPos: new THREE.Vector3(),
  camTargetLook: new THREE.Vector3(),

  falling: false,
  fallVel: new THREE.Vector3(),
  fallStart: 0,

  aviationLights: [],
  cityNeons: [],
};

// ====================================================================
// CITY LOAD
// ====================================================================
const loader = new GLTFLoader();
const loadingBar = document.getElementById('loading-bar');
const loadingEl  = document.getElementById('loading');

loader.load('la_night_2k.glb',
  (gltf) => {
    STATE.cityRoot = gltf.scene;

    // Normalize scale: aim for ~900 units across.
    const tmpBox = new THREE.Box3().setFromObject(STATE.cityRoot);
    const csize = tmpBox.getSize(new THREE.Vector3()).length();
    if (csize > 0) {
      const k = 900 / csize;
      STATE.cityRoot.scale.setScalar(k);
    }
    STATE.cityRoot.updateMatrixWorld(true);

    // Recenter so the city center is at origin XZ, with min Y near 0 deep below.
    const box = new THREE.Box3().setFromObject(STATE.cityRoot);
    const c = box.getCenter(new THREE.Vector3());
    STATE.cityRoot.position.x -= c.x;
    STATE.cityRoot.position.z -= c.z;
    // Lower the city so the player is high above its base.
    // We don't shift Y — we'll work with whatever heights the model has.
    STATE.cityRoot.updateMatrixWorld(true);

    scene.add(STATE.cityRoot);

    setupBridgeAndRoofs();
    spawnAviationLightsOnSkyline();
    showIntro();
    loadingEl.classList.add('hidden');
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      loadingBar.style.width = `${(xhr.loaded / xhr.total) * 100}%`;
    }
  },
  (err) => {
    console.error('GLB load failed', err);
    // Fallback procedural city so the game still runs.
    STATE.cityRoot = makeFallbackCity();
    scene.add(STATE.cityRoot);
    setupBridgeAndRoofs();
    spawnAviationLightsOnSkyline();
    showIntro();
    loadingEl.classList.add('hidden');
  },
);

function makeFallbackCity() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x070912, roughness: 1.0 }),
  );
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -200;
  g.add(ground);

  for (let i = 0; i < 240; i++) {
    const w = 8 + Math.random() * 18;
    const d = 8 + Math.random() * 18;
    const h = 30 + Math.random() * 220;
    const x = (Math.random() - 0.5) * 800;
    const z = (Math.random() - 0.5) * 800;
    if (Math.hypot(x, z) < 35) continue;
    const m = new THREE.MeshStandardMaterial({
      color: 0x1c2030, roughness: 0.7, metalness: 0.3,
      emissive: 0x4a5a82, emissiveIntensity: 0.06,
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, h/2 - 200, z);
    g.add(b);
    // Sprinkle window-like emissive panels
    if (Math.random() < 0.6) {
      const lit = new THREE.Mesh(
        new THREE.PlaneGeometry(w*0.85, h*0.85),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.08 + Math.random()*0.08, 0.6, 0.55),
          transparent: true, opacity: 0.4,
        }),
      );
      lit.position.set(x, h/2 - 200, z + d/2 + 0.05);
      g.add(lit);
    }
  }
  return g;
}

// ====================================================================
// FIND TWO HIGH ROOFS VIA RAYCAST
// ====================================================================
function findTwoRoofs() {
  const bbox = new THREE.Box3().setFromObject(STATE.cityRoot);
  const N = 14;
  const hits = [];
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = THREE.MathUtils.lerp(bbox.min.x + 30, bbox.max.x - 30, (i + 0.5) / N);
      const z = THREE.MathUtils.lerp(bbox.min.z + 30, bbox.max.z - 30, (j + 0.5) / N);
      ray.ray.origin.set(x, bbox.max.y + 200, z);
      const isects = ray.intersectObject(STATE.cityRoot, true);
      if (isects.length) {
        hits.push({ x, z, y: isects[0].point.y });
      }
    }
  }
  if (hits.length < 2) {
    // Fallback positions
    const fallbackY = bbox.max.y - 5;
    return [
      { x: -25, y: fallbackY, z: 0 },
      { x:  25, y: fallbackY, z: 0 },
    ];
  }
  // Sort by height descending
  hits.sort((a, b) => b.y - a.y);
  // The top building tends to dominate; pick start from top quartile,
  // then a target that is between 30 and 90 units away horizontally
  // and similarly tall.
  const start = hits[0];
  let target = null;
  let bestScore = -Infinity;
  for (const h of hits) {
    if (h === start) continue;
    const d = Math.hypot(h.x - start.x, h.z - start.z);
    if (d < 28 || d > 95) continue;
    // Score: prefer similar height, moderate distance
    const dy = Math.abs(h.y - start.y);
    const score = -dy - Math.abs(d - 50);
    if (score > bestScore) {
      bestScore = score;
      target = h;
    }
  }
  if (!target) {
    // Loosen constraints
    for (const h of hits) {
      const d = Math.hypot(h.x - start.x, h.z - start.z);
      if (d > 22) { target = h; break; }
    }
  }
  if (!target) target = hits[Math.min(3, hits.length - 1)];
  return [start, target];
}

// ====================================================================
// ROOF PLATFORM (clean, architectural)
// ====================================================================
function makeRoofPlatform(isTarget) {
  const g = new THREE.Group();
  const size = PLATFORM_SIZE;

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f38, roughness: 0.78, metalness: 0.18,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x191b21, roughness: 0.42, metalness: 0.9,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x383d48, roughness: 0.55, metalness: 0.55,
  });
  const darkPanelMat = new THREE.MeshStandardMaterial({
    color: 0x23272f, roughness: 0.5, metalness: 0.6,
  });

  // Slab base
  const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.8, size), concreteMat);
  slab.position.y = -0.4;
  g.add(slab);

  // Top panel grid (clean walking surface)
  const cells = 4;
  const cellSize = (size - 0.4) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(cellSize - 0.05, 0.06, cellSize - 0.05),
        ((i + j) % 2 === 0) ? panelMat : darkPanelMat,
      );
      tile.position.x = -size/2 + 0.2 + cellSize/2 + i * cellSize;
      tile.position.z = -size/2 + 0.2 + cellSize/2 + j * cellSize;
      tile.position.y = 0.03;
      g.add(tile);
    }
  }

  // Edge fascia (4 sides)
  const fasciaH = 0.6;
  const fThick = 0.18;
  const fSides = [
    [size, fasciaH, fThick, 0, -0.05, size/2 - fThick/2],
    [size, fasciaH, fThick, 0, -0.05, -size/2 + fThick/2],
    [fThick, fasciaH, size, size/2 - fThick/2, -0.05, 0],
    [fThick, fasciaH, size, -size/2 + fThick/2, -0.05, 0],
  ];
  for (const [w, h, d, x, y, z] of fSides) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
    m.position.set(x, y, z);
    g.add(m);
  }

  // HVAC unit
  const ac = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.8, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x40444c, roughness: 0.55, metalness: 0.7 }),
  );
  ac.position.set(-size/2 + 1.4, 0.4, -size/2 + 0.9);
  g.add(ac);
  // Vent slots
  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.5, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x080a0e }),
  );
  vent.position.set(-size/2 + 1.4, 0.4, -size/2 + 1.42);
  g.add(vent);

  // Rooftop access hatch (small)
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.12, 0.9),
    metalMat,
  );
  hatch.position.set(size/2 - 1.2, 0.06, size/2 - 1.6);
  g.add(hatch);

  // Aviation light
  const aviBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  );
  aviBulb.position.set(size/2 - 0.6, 0.85, size/2 - 0.6);
  g.add(aviBulb);
  const aviLight = new THREE.PointLight(0xff3030, 0.5, 6);
  aviLight.position.copy(aviBulb.position);
  g.add(aviLight);
  STATE.aviationLights.push({ bulb: aviBulb, light: aviLight, phase: Math.random() * Math.PI * 2 });

  if (isTarget) {
    // Soft architectural strip lighting around the rim (subtle, not gamey)
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x6da3e6 });
    const stripsConf = [
      [size - 1.6, 0.04, 0.06, 0, 0.06, size/2 - 0.55],
      [size - 1.6, 0.04, 0.06, 0, 0.06, -size/2 + 0.55],
      [0.06, 0.04, size - 1.6, size/2 - 0.55, 0.06, 0],
      [0.06, 0.04, size - 1.6, -size/2 + 0.55, 0.06, 0],
    ];
    for (const [w, h, d, x, y, z] of stripsConf) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stripMat);
      s.position.set(x, y, z);
      g.add(s);
    }
    // Faint blue point light over the surface
    const pl = new THREE.PointLight(0x6da3e6, 0.4, 6);
    pl.position.set(0, 1.2, 0);
    g.add(pl);
  }

  return g;
}

// ====================================================================
// GLASS BRIDGE
// ====================================================================
function makeGlassTile(fragile) {
  const g = new THREE.Group();
  // Tiny color/roughness variation to keep fragile tiles SUBTLY different.
  const baseColor = fragile ? 0xb9c8de : 0xc1d3eb;
  const roughness = fragile ? 0.16 : 0.08;
  const opacity = fragile ? 0.42 : 0.35;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    metalness: 0.0,
    roughness: roughness,
    transparent: true,
    opacity: opacity,
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

  // Steel mounts on the underside corners
  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f25, roughness: 0.4, metalness: 0.92,
  });
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
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

  // Slight micro-deformation hint for fragile (a barely visible inner "stress" plane).
  if (fragile) {
    const stressGeom = new THREE.PlaneGeometry(TILE_SIZE - 0.1, TILE_SIZE - 0.1, 1, 1);
    const stressMat = new THREE.MeshBasicMaterial({
      color: 0xdfe8ff, transparent: true, opacity: 0.04,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const stress = new THREE.Mesh(stressGeom, stressMat);
    stress.rotation.x = -Math.PI / 2;
    stress.position.y = TILE_THICKNESS / 2 + 0.001;
    g.add(stress);
  }

  // Crack overlay (line group) — invisible until tile starts breaking.
  const cracks = new THREE.Group();
  const crackMat = new THREE.LineBasicMaterial({
    color: 0xeaf2ff, transparent: true, opacity: 0,
    linewidth: 1,
  });
  const cx = 0, cz = 0;
  const ny = TILE_THICKNESS / 2 + 0.0015;
  for (let r = 0; r < 7; r++) {
    const angle0 = (r / 7) * Math.PI * 2 + Math.random() * 0.4;
    const pts = [new THREE.Vector3(cx, ny, cz)];
    let x = cx, z = cz, len = 0;
    for (let s = 0; s < 5; s++) {
      const seg = 0.08 + Math.random() * 0.07;
      len += seg;
      const a = angle0 + (Math.random() - 0.5) * 0.7;
      x = cx + Math.cos(a) * len;
      z = cz + Math.sin(a) * len;
      if (Math.abs(x) > TILE_SIZE/2 - 0.05) x = Math.sign(x) * (TILE_SIZE/2 - 0.05);
      if (Math.abs(z) > TILE_SIZE/2 - 0.05) z = Math.sign(z) * (TILE_SIZE/2 - 0.05);
      pts.push(new THREE.Vector3(x, ny, z));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geom, crackMat.clone());
    cracks.add(line);
  }
  g.add(cracks);
  g.userData.cracks = cracks;

  return g;
}

function buildBridge(start, end) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const dirN = dir.clone().normalize();
  const right = new THREE.Vector3().crossVectors(dirN, new THREE.Vector3(0, 1, 0)).normalize();
  const yaw = Math.atan2(dirN.x, dirN.z);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c22, roughness: 0.4, metalness: 0.9,
    envMapIntensity: 1.0,
  });

  // Bottom rim (under tiles, runs along the bridge)
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(BRIDGE_WIDTH + 0.4, 0.14, length),
    frameMat,
  );
  rim.position.copy(start).addScaledVector(dir, 0.5);
  rim.position.y -= TILE_THICKNESS / 2 + 0.07;
  rim.rotation.y = yaw;
  group.add(rim);

  // Two side rails (waist-height handrails — actually keep them low-profile to feel exposed)
  const railH = 0.08;
  const railOffset = BRIDGE_WIDTH / 2 + 0.1;
  for (const sign of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, railH, length),
      frameMat,
    );
    const c = start.clone().addScaledVector(dir, 0.5);
    rail.position.copy(c).addScaledVector(right, sign * railOffset);
    rail.position.y -= TILE_THICKNESS / 2 + 0.04;
    rail.rotation.y = yaw;
    group.add(rail);
  }

  // Vertical posts every couple of tiles + thin guide cable up high
  const postCount = Math.max(3, Math.floor(TILE_COUNT / 3) + 1);
  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount;
    const c = start.clone().lerp(end, t);
    for (const sign of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 1.3, 0.07),
        frameMat,
      );
      post.position.copy(c).addScaledVector(right, sign * railOffset);
      post.position.y += 0.6;
      group.add(post);
    }
  }
  // Top cable (left + right)
  for (const sign of [-1, 1]) {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, length, 6),
      frameMat,
    );
    cable.rotation.z = Math.PI / 2;
    cable.rotation.y = yaw - Math.PI / 2;
    // place along bridge axis
    const c = start.clone().addScaledVector(dir, 0.5);
    cable.position.copy(c).addScaledVector(right, sign * railOffset);
    cable.position.y += 1.25;
    // We rotated wrong; simpler: build cable as box along Z then yaw it.
    group.remove(cable);
    const cable2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, length),
      frameMat,
    );
    cable2.position.copy(c).addScaledVector(right, sign * railOffset);
    cable2.position.y += 1.25;
    cable2.rotation.y = yaw;
    group.add(cable2);
  }

  // Tiles
  STATE.tiles.length = 0;
  STATE.tileMeta.length = 0;
  // Pre-decide fragile mask but never two fragiles in a row right at start
  const fragileMask = new Array(TILE_COUNT).fill(false);
  for (let i = 0; i < TILE_COUNT; i++) {
    fragileMask[i] = Math.random() < 0.45;
  }
  fragileMask[0] = false; // first tile is safe so the player can step in

  for (let i = 0; i < TILE_COUNT; i++) {
    const t = (i + 0.5) / TILE_COUNT;
    const center = start.clone().lerp(end, t);
    const tile = makeGlassTile(fragileMask[i]);
    tile.position.copy(center);
    tile.rotation.y = yaw;
    group.add(tile);
    STATE.tiles.push(tile);
    STATE.tileMeta.push({
      fragile: fragileMask[i],
      crackProgress: 0,
      broken: false,
    });
  }

  // Cross braces beneath the tiles every other gap
  for (let i = 1; i < TILE_COUNT; i++) {
    const t = i / TILE_COUNT;
    const c = start.clone().lerp(end, t);
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(BRIDGE_WIDTH + 0.3, 0.06, 0.06),
      frameMat,
    );
    brace.position.copy(c);
    brace.position.y -= TILE_THICKNESS / 2 + 0.04;
    brace.rotation.y = yaw;
    group.add(brace);
  }

  group.userData.start = start.clone();
  group.userData.end = end.clone();
  group.userData.dir = dirN.clone();
  group.userData.right = right.clone();
  group.userData.yaw = yaw;

  return group;
}

// ====================================================================
// SETUP BRIDGE + ROOFS
// ====================================================================
function setupBridgeAndRoofs() {
  const [s, t] = findTwoRoofs();

  // Choose start & target world positions; lift platforms slightly above so
  // they cleanly cover whatever messy geometry the GLB has.
  const startY  = s.y + 0.4;
  const targetY = t.y + 0.4;
  STATE.startPos.set(s.x, startY, s.z);
  STATE.endPos.set(t.x, targetY, t.z);

  // Direction from start->target (we'll align platforms accordingly)
  const dir = new THREE.Vector3().subVectors(STATE.endPos, STATE.startPos).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  STATE.forwardDir.copy(dir);
  STATE.rightDir.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  // Compute bridge endpoints: edge of platforms facing each other
  const platHalf = PLATFORM_SIZE / 2;
  const bridgeStart = STATE.startPos.clone().addScaledVector(dir,  platHalf);
  const bridgeEnd   = STATE.endPos.clone().addScaledVector(dir,   -platHalf);
  STATE.bridgeYStart = bridgeStart.y;
  STATE.bridgeYEnd   = bridgeEnd.y;

  // Place start platform
  const sp = makeRoofPlatform(false);
  sp.position.copy(STATE.startPos);
  sp.rotation.y = yaw;
  scene.add(sp);
  STATE.startPlatform = sp;

  // Place target platform
  const tp = makeRoofPlatform(true);
  tp.position.copy(STATE.endPos);
  tp.rotation.y = yaw;
  scene.add(tp);
  STATE.targetPlatform = tp;

  // Build bridge
  STATE.bridgeGroup = buildBridge(bridgeStart, bridgeEnd);
  scene.add(STATE.bridgeGroup);

  // Initial camera position (on start platform, looking toward bridge/target)
  const initial = stepWorldPosition(0);
  initial.y += PLAYER_EYE;
  STATE.cameraPos.copy(initial);
  STATE.camTargetPos.copy(initial);
  STATE.cameraLook.copy(STATE.endPos);
  STATE.cameraLook.y = initial.y - 0.4;
  STATE.camTargetLook.copy(STATE.cameraLook);
  camera.position.copy(STATE.cameraPos);
  camera.lookAt(STATE.cameraLook);
}

// ====================================================================
// AVIATION LIGHTS ACROSS SKYLINE (life)
// ====================================================================
function spawnAviationLightsOnSkyline() {
  // Sample some city points and put blinking red lights up high.
  const bbox = new THREE.Box3().setFromObject(STATE.cityRoot);
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  let placed = 0;
  const maxLights = 16;
  for (let attempt = 0; attempt < 80 && placed < maxLights; attempt++) {
    const x = THREE.MathUtils.lerp(bbox.min.x + 30, bbox.max.x - 30, Math.random());
    const z = THREE.MathUtils.lerp(bbox.min.z + 30, bbox.max.z - 30, Math.random());
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
      bulb, light: pl, phase: Math.random() * Math.PI * 2, white: isWhite,
    });
    placed++;
  }
}

// ====================================================================
// GAME LOGIC
// ====================================================================
const hud      = document.getElementById('hud');
const intro    = document.getElementById('intro');
const startBtn = document.getElementById('start-btn');
const quizEl   = document.getElementById('quiz');
const questionEl = document.getElementById('question');
const optionsEl  = document.getElementById('options');
const timerFill  = document.getElementById('timer-fill');
const timerLabel = document.getElementById('timer-label');
const stepNumber = document.getElementById('step-number');
const stepTotal  = document.getElementById('step-total');
const altitudeEl = document.getElementById('altitude');
const gameoverEl = document.getElementById('gameover');
const endTitle   = document.getElementById('endtitle');
const endText    = document.getElementById('endtext');
const restartBtn = document.getElementById('restart');

function showIntro() {
  stepTotal.textContent = TILE_COUNT;
  intro.classList.remove('hidden');
}
startBtn.addEventListener('click', () => {
  intro.classList.add('hidden');
  hud.classList.remove('hidden');
  startStep();
});
restartBtn.addEventListener('click', () => {
  // Reload the page for a clean reset
  location.reload();
});

function startStep() {
  STATE.active = true;
  STATE.questionLocked = false;
  STATE.qStartTime = performance.now();
  STATE.step = STATE.step; // unchanged
  stepNumber.textContent = String(STATE.step);
  showQuestion();
  quizEl.classList.remove('hidden');
}

function showQuestion(animate = true) {
  STATE.current = pickQuestion();
  questionEl.textContent = STATE.current.q.replace('___', '_____');
  optionsEl.innerHTML = '';
  STATE.current.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = opt;
    btn.addEventListener('click', () => onAnswer(idx, btn));
    optionsEl.appendChild(btn);
  });
  if (animate) {
    quizEl.classList.remove('shake');
    void quizEl.offsetWidth;
  }
  STATE.questionLocked = false;
}

function onAnswer(idx, btn) {
  if (!STATE.active || STATE.questionLocked) return;
  STATE.questionLocked = true;
  const correct = STATE.current.correct === idx;
  if (correct) {
    btn.classList.add('correct');
    advanceStep();
  } else {
    btn.classList.add('wrong');
    quizEl.classList.add('shake');
    // Bump crack progress on current tile (if it's a tile, not roof)
    bumpCrackOnCurrent(0.18);
    setTimeout(() => {
      if (!STATE.active) return;
      showQuestion(true);
    }, 420);
  }
}

function bumpCrackOnCurrent(amount) {
  const tileIdx = STATE.step - 1;
  if (tileIdx < 0 || tileIdx >= STATE.tiles.length) return;
  STATE.tileMeta[tileIdx].crackProgress = Math.min(
    1.0,
    STATE.tileMeta[tileIdx].crackProgress + amount,
  );
}

function advanceStep() {
  STATE.active = false;       // pause input until move animation finishes
  quizEl.classList.add('hidden');
  // Move to next position
  STATE.step += 1;
  const next = stepWorldPosition(STATE.step);
  STATE.camTargetPos.copy(next).add(new THREE.Vector3(0, PLAYER_EYE, 0));
  // Look forward
  const lookFrom = STATE.camTargetPos;
  const aheadIdx = Math.min(STATE.step + 1, STATE.totalSteps);
  const aheadPos = stepWorldPosition(aheadIdx);
  STATE.camTargetLook.copy(aheadPos);
  STATE.camTargetLook.y = lookFrom.y - 0.1;

  // After move, decide what's next
  setTimeout(() => {
    if (STATE.step >= STATE.totalSteps) {
      onWin();
      return;
    }
    startStep();
  }, 520);
}

// step 0     = on start platform (a bit back from bridge edge, looking forward)
// step 1..N  = on tile index step-1
// step N+1   = on target platform (a bit past bridge edge)
function stepWorldPosition(step) {
  if (step <= 0) {
    // On start platform, slightly back from the bridge-facing edge
    return STATE.startPos.clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.18);
  }
  if (step > TILE_COUNT) {
    // Onto target platform, just past bridge edge
    return STATE.endPos.clone()
      .addScaledVector(STATE.forwardDir, -PLATFORM_SIZE * 0.18);
  }
  return STATE.tiles[step - 1].position.clone();
}

function onTimeOut() {
  if (!STATE.active) return;
  STATE.active = false;
  STATE.questionLocked = true;
  quizEl.classList.add('hidden');
  triggerFall();
}

function onWin() {
  STATE.active = false;
  endTitle.textContent = 'Du hast es geschafft!';
  endText.textContent = 'Ты прошел стеклянный мост и не упал. Город остался внизу.';
  gameoverEl.classList.remove('hidden');
}

// ====================================================================
// FALL ANIMATION
// ====================================================================
function triggerFall() {
  STATE.falling = true;
  STATE.fallStart = performance.now();
  STATE.fallVel.set(
    (Math.random() - 0.5) * 0.3,
    -1.0,
    (Math.random() - 0.5) * 0.3,
  );

  // Shatter the current tile if applicable
  const tileIdx = STATE.step - 1;
  if (tileIdx >= 0 && tileIdx < STATE.tiles.length) {
    const tile = STATE.tiles[tileIdx];
    STATE.tileMeta[tileIdx].broken = true;
    // Make tile fragments fall (cheap: scale tile down + drop it)
    tile.userData.shatterStart = performance.now();
  }

  // Show end card after fall completes
  setTimeout(() => {
    endTitle.textContent = 'Ты упал';
    endText.textContent = 'Стекло не выдержало. Город принял тебя.';
    gameoverEl.classList.remove('hidden');
  }, 2400);
}

// ====================================================================
// RENDER LOOP
// ====================================================================
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now();

  // Aviation lights blink (1Hz)
  for (const a of STATE.aviationLights) {
    const v = (Math.sin(t * 0.0025 + a.phase) + 1) * 0.5;
    const intensity = a.white ? (v > 0.95 ? 1.5 : 0.05) : (0.2 + v * 0.8);
    a.light.intensity = intensity * 0.7;
    a.bulb.material.color.setScalar(0); // reset
    if (a.white) {
      a.bulb.material.color.setRGB(intensity, intensity, intensity);
    } else {
      a.bulb.material.color.setRGB(intensity, 0.18 * intensity, 0.18 * intensity);
    }
  }

  // Step timer + crack progression — only on glass tiles, not on solid platforms
  if (STATE.active && !STATE.falling) {
    const onTile = (STATE.step >= 1 && STATE.step <= TILE_COUNT);
    if (onTile) {
      const elapsed = (t - STATE.qStartTime) / 1000;
      const remaining = Math.max(0, QUESTION_TIME - elapsed);
      const ratio = remaining / QUESTION_TIME;
      timerFill.style.transform = `scaleX(${ratio})`;
      timerLabel.textContent = remaining.toFixed(1);
      timerFill.classList.toggle('warn', ratio < 0.5 && ratio >= 0.25);
      timerFill.classList.toggle('crit', ratio < 0.25);
      // Tile cracks while waiting
      const meta = STATE.tileMeta[STATE.step - 1];
      const baseRate = meta.fragile ? 1.0 : 0.55;
      meta.crackProgress = Math.min(
        1.0,
        meta.crackProgress + dt * baseRate * 0.16 + (1 - ratio) * dt * 0.08,
      );
      if (remaining <= 0) onTimeOut();
    } else {
      // On solid platform — no countdown, no panic
      timerFill.style.transform = 'scaleX(1)';
      timerLabel.textContent = 'safe';
      timerFill.classList.remove('warn', 'crit');
    }
  }

  // Update tile crack visuals
  for (let i = 0; i < STATE.tiles.length; i++) {
    const tile = STATE.tiles[i];
    const meta = STATE.tileMeta[i];
    if (meta.broken) {
      // Fragments / shatter animation
      const since = (t - (tile.userData.shatterStart || t)) / 1000;
      tile.position.y -= 9 * dt;        // drops along with camera
      tile.scale.multiplyScalar(0.985);
      tile.userData.glassMat.opacity = Math.max(0, tile.userData.glassMat.opacity - dt * 0.8);
      continue;
    }
    const cp = meta.crackProgress;
    if (cp > 0) {
      const cracks = tile.userData.cracks;
      cracks.children.forEach((line, idx) => {
        line.material.opacity = Math.min(0.95, cp * (0.4 + (idx % 3) * 0.2));
      });
      // Whitening + slight sag
      const mat = tile.userData.glassMat;
      const base = tile.userData.baseColor;
      const w = new THREE.Color(0xffffff);
      mat.color.copy(base).lerp(w, cp * 0.55);
      mat.opacity = THREE.MathUtils.lerp(meta.fragile ? 0.42 : 0.35, 0.85, cp);
      mat.roughness = THREE.MathUtils.lerp(meta.fragile ? 0.16 : 0.08, 0.45, cp);
      // Tile dips a fraction as cracks deepen (only the current one)
      if (i === STATE.step - 1) {
        tile.position.y = tile.userData.baseY ?? tile.position.y;
        if (tile.userData.baseY === undefined) tile.userData.baseY = tile.position.y;
        tile.position.y = tile.userData.baseY - cp * 0.05 - Math.sin(t * 0.02) * cp * 0.005;
      }
    }
  }

  // Smooth camera move
  if (!STATE.falling) {
    STATE.cameraPos.lerp(STATE.camTargetPos, 1 - Math.pow(0.001, dt));
    STATE.cameraLook.lerp(STATE.camTargetLook, 1 - Math.pow(0.0005, dt));
    // Tiny breathing/sway when standing on a tile
    const tileIdx = STATE.step - 1;
    let sway = 0;
    if (tileIdx >= 0 && tileIdx < STATE.tiles.length) {
      const cp = STATE.tileMeta[tileIdx].crackProgress;
      sway = cp * 0.04;
    }
    camera.position.copy(STATE.cameraPos);
    camera.position.y += Math.sin(t * 0.004) * 0.01 + Math.sin(t * 0.013) * sway;
    camera.position.x += Math.sin(t * 0.0017) * sway;
    camera.lookAt(STATE.cameraLook);
  } else {
    // Falling
    STATE.fallVel.y -= 12 * dt;
    STATE.cameraPos.addScaledVector(STATE.fallVel, dt * 6);
    camera.position.copy(STATE.cameraPos);
    // Tumble
    camera.rotation.x -= dt * 0.6;
    camera.rotation.z += dt * 0.25;
  }

  // HUD altitude
  if (!STATE.falling) {
    altitudeEl.textContent = `${Math.max(0, Math.round(camera.position.y - 1)) } м`;
  } else {
    altitudeEl.textContent = `${Math.max(0, Math.round(camera.position.y - 1)) } м`;
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
