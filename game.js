import * as THREE from "three";

// =================================================================
// Config
// =================================================================
const SUPABASE_URL = "https://gluoioiimapyhchdasfl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdW9pb2lpbWFweWhjaGRhc2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDQ3MjAsImV4cCI6MjA5NTYyMDcyMH0.dHVB0jJBMjUunJKSsqbaM3MGCAq-ZRSWQEqvEyUjIyk";
const SAVE_KEY = "kristal-ajaib-3d-save-v1";

const ZONES = {
  VILLAGE_END: -95,
  FOREST_END: -195,
  RAMP_END: -320,
  MOUNTAIN_END: -400,
  LAIR_END: -460,
};
const MOUNTAIN_Y = 15;
const STAGE_NAMES = ["Desa Damai", "Hutan Bisikan", "Gua Kunang-Kunang", "Puncak Awan", "Sarang Naga"];

function stageOfZ(z) {
  if (z > ZONES.VILLAGE_END) return 1;
  if (z > ZONES.FOREST_END) return 2;
  if (z > ZONES.RAMP_END) return 3;
  if (z > ZONES.MOUNTAIN_END) return 4;
  return 5;
}
function zoneName(z) { return STAGE_NAMES[stageOfZ(z) - 1]; }
function laneHalfWidth(z) {
  if (z <= ZONES.FOREST_END && z > ZONES.RAMP_END) return 8; // cave + ramp corridor
  if (z <= ZONES.MOUNTAIN_END) return 22; // dragon's lair arena
  return 45;
}
function groundHeightAt(z) {
  if (z > ZONES.FOREST_END) return 0;
  if (z > ZONES.RAMP_END) {
    const t = (ZONES.FOREST_END - z) / (ZONES.FOREST_END - ZONES.RAMP_END);
    return t * MOUNTAIN_Y;
  }
  return MOUNTAIN_Y;
}

// =================================================================
// DOM refs
// =================================================================
const $ = (id) => document.getElementById(id);
const startScreen = $("start-screen"), gameScreen = $("game-screen"), endScreen = $("end-screen");
const canvasWrap = $("canvas-wrap");
const dlgBox = $("dialogue"), dlgName = $("dlg-name"), dlgText = $("dlg-text");
const toastEl = $("toast"), promptEl = $("interact-prompt");
const areaNameEl = $("area-name"), crystalCountEl = $("crystal-count"), timerEl = $("timer");
const puzzleOverlay = $("puzzle-overlay"), puzzleStatus = $("puzzle-status");
const hpFillEl = $("hp-fill"), dmgFlashEl = $("dmg-flash"), attackBtn = $("attack-btn");
const manaFillEl = $("mana-fill");
const stageOverlayEl = $("stage-overlay"), stageOverlayTitle = $("stage-overlay-title"), stageOverlaySub = $("stage-overlay-sub");
const bossBarEl = $("boss-bar"), bossHpFillEl = $("boss-hp-fill");

// =================================================================
// Sound
// =================================================================
let actx = null, muted = false;
function playTone(freq, dur) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.15, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* audio unsupported */ }
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

// =================================================================
// Three.js scene setup
// =================================================================
const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#a9d8ff", 45, 140);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasWrap.appendChild(renderer.domElement);

// -------- gradient sky dome (nicer atmosphere than a flat color) --------
function makeSkyDome() {
  const geo = new THREE.SphereGeometry(190, 24, 16);
  const uniforms = {
    top: { value: new THREE.Color("#3a7bd5") },
    bottom: { value: new THREE.Color("#dceeff") },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, fog: false, depthWrite: false,
    vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
      void main() {
        float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.6)), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
scene.add(makeSkyDome());

const hemi = new THREE.HemisphereLight("#bfe3ff", "#5fb84e", 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff6d8", 1.25);
sun.position.set(30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.0015;
scene.add(sun);
const fill = new THREE.DirectionalLight("#bcd6ff", 0.35);
fill.position.set(-25, 20, -30);
scene.add(fill);
scene.add(new THREE.AmbientLight("#ffffff", 0.22));

function updateOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  document.body.classList.toggle("force-landscape", portrait && isTouch);
  resize();
}
function resize() {
  const rotated = document.body.classList.contains("force-landscape");
  const w = rotated ? window.innerHeight : window.innerWidth;
  const h = rotated ? window.innerWidth : window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener("resize", updateOrientation);
window.addEventListener("orientationchange", updateOrientation);
updateOrientation();

// =================================================================
// Name tag sprites
// =================================================================
function makeNameSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(15,8,30,0.55)";
  roundRect(ctx, 8, 8, 240, 48, 16); ctx.fill();
  ctx.fillStyle = "#ffd76a";
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// =================================================================
// Blocky humanoid builder
// =================================================================
function buildHumanoid({
  skin = "#f2c197", shirt = "#4a9eff", pants = "#3b3b55", hair = "#5b3a29",
  scale = 1, hat = null, beard = false, crown = false, skirt = null, headScale = 1,
} = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.6), mat(shirt));
  torso.position.y = 1.55; torso.castShadow = true;
  g.add(torso);

  const hs = 0.85 * headScale;
  const headY = 2.2 + hs / 2 + 0.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(hs, hs, hs), mat(skin));
  head.position.y = headY; head.castShadow = true;
  g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: "#241a12" });
  [-0.2 * headScale, 0.2 * headScale].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1 * headScale, 0.1 * headScale, 0.05), eyeMat);
    eye.position.set(ex, headY + 0.03 * headScale, hs * 0.52);
    g.add(eye);
  });

  if (beard) {
    const beardMesh = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.55, hs * 0.35, hs * 0.3), mat(hair));
    beardMesh.position.set(0, headY - hs * 0.42, hs * 0.32);
    g.add(beardMesh);
  }

  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.06, 0.28 * headScale, hs * 1.06), mat(hair));
  hairMesh.position.y = headY + hs * 0.51;
  g.add(hairMesh);

  if (hat) {
    const hatMesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12), mat(hat));
    hatMesh.position.y = headY + hs * 0.75;
    hatMesh.castShadow = true;
    g.add(hatMesh);
  }

  if (crown) {
    const gold = new THREE.MeshStandardMaterial({ color: "#ffd76a", roughness: 0.3, metalness: 0.6 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.48, hs * 0.52, 0.22, 10), gold);
    ring.position.y = headY + hs * 0.58;
    ring.castShadow = true;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 6), gold);
      spike.position.set(Math.cos(ang) * hs * 0.4, headY + hs * 0.75, Math.sin(ang) * hs * 0.4);
      g.add(spike);
    }
  }

  function limb(w, h, d, color, x, y) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, 0);
    m.castShadow = true;
    return m;
  }
  const armL = limb(0.34, 1.1, 0.34, shirt, -0.72, 2.15);
  const armR = limb(0.34, 1.1, 0.34, shirt, 0.72, 2.15);
  const legL = limb(0.4, skirt ? 0.5 : 1.15, 0.4, pants, -0.32, skirt ? 1.25 : 0.9);
  const legR = limb(0.4, skirt ? 0.5 : 1.15, 0.4, pants, 0.32, skirt ? 1.25 : 0.9);
  g.add(armL, armR, legL, legR);

  if (skirt) {
    const skirtMesh = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 10), mat(skirt));
    skirtMesh.position.y = 1.15;
    skirtMesh.castShadow = true;
    g.add(skirtMesh);
  }

  g.scale.setScalar(scale);
  g.userData.parts = { torso, head, armL, armR, legL, legR };
  g.userData.baseScale = scale;
  return g;
}

function buildAdultMale() {
  return buildHumanoid({ shirt: "#2d4a6b", pants: "#33210f", hair: "#2a1c14", skin: "#d8a06a", scale: 1.15, beard: true });
}
function buildPrincess() {
  return buildHumanoid({ shirt: "#ff8fd0", pants: "#ff8fd0", hair: "#caa53d", skin: "#ffe0c2", scale: 0.95, crown: true, skirt: "#ffb6e6" });
}
function buildBaby() {
  return buildHumanoid({ shirt: "#ffe27a", pants: "#bfe8ff", hair: "#caa53d", skin: "#ffe6cf", scale: 0.55, headScale: 1.35 });
}
const CHARACTER_BUILDERS = { ayah: buildAdultMale, putri: buildPrincess, bayi: buildBaby };

function buildDragon() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3.2), mat("#d64545"));
  body.position.y = 2; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), mat("#e06060"));
  head.position.set(0, 2.9, 1.9); head.castShadow = true;
  g.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 8), mat("#ffd76a"));
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 2.7, 2.7);
  g.add(snout);
  [-0.4, 0.4].forEach((hx) => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), mat("#fff2c2"));
    horn.position.set(hx, 3.6, 1.7);
    g.add(horn);
  });
  [-1.5, 1.5].forEach((wx) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 0.12), mat("#8a2c2c"));
    wing.position.set(wx, 2.6, 0);
    wing.rotation.z = wx > 0 ? -0.5 : 0.5;
    g.add(wing);
  });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.2), mat("#d64545"));
  tail.position.set(0, 1.4, -2.4);
  g.add(tail);
  [-0.7, 0.7].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), mat("#b53a3a"));
    leg.position.set(lx, 0.6, 1);
    g.add(leg);
  });
  g.userData.parts = {};
  return g;
}

// =================================================================
// World building
// =================================================================
const obstacles = []; // {x,z,radius}

// -------- procedural ground textures (canvas-based, no external assets) --------
function makeGroundTexture(base, speckle, speckleCount = 900) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < speckleCount; i++) {
    ctx.fillStyle = speckle[Math.floor(Math.random() * speckle.length)];
    const x = Math.random() * size, y = Math.random() * size, r = 0.6 + Math.random() * 1.8;
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const GROUND_TEXTURES = {
  grass: makeGroundTexture("#7ec850", ["#6bb443", "#8fd968", "#5fa53a"]),
  forest: makeGroundTexture("#3f8a4f", ["#347539", "#4a9d5c", "#2c5f30"]),
  cave: makeGroundTexture("#382048", ["#2c1839", "#442858", "#20122e"]),
  snow: makeGroundTexture("#e7f3fa", ["#ffffff", "#d6e9f2", "#c9e0ee"]),
  lair: makeGroundTexture("#241030", ["#3a1840", "#180820", "#4a2050"]),
};

function groundSlab(x1, x2, z1, z2, y, color, textureKey) {
  const w = x2 - x1, d = z1 - z2;
  const geo = new THREE.BoxGeometry(w, 1, d);
  const matOpts = { color, roughness: 0.95 };
  if (textureKey && GROUND_TEXTURES[textureKey]) {
    const tex = GROUND_TEXTURES[textureKey].clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 6, d / 6);
    matOpts.map = tex;
    matOpts.color = "#ffffff";
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matOpts));
  mesh.position.set((x1 + x2) / 2, y - 0.5, (z1 + z2) / 2);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function tree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 2, 8), new THREE.MeshStandardMaterial({ color: "#6b4a2f" }));
  trunk.position.y = 1; trunk.castShadow = true;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 8), new THREE.MeshStandardMaterial({ color: "#2e8b45" }));
  leaves.position.y = 3; leaves.castShadow = true;
  g.add(trunk, leaves);
  g.position.set(x, 0, z);
  scene.add(g);
  obstacles.push({ x, z, radius: 1.1 });
}
function rock(x, z, s = 1) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 * s), new THREE.MeshStandardMaterial({ color: "#8a8a92", roughness: 1 }));
  m.position.set(x, 0.6 * s, z);
  m.castShadow = true;
  scene.add(m);
  obstacles.push({ x, z, radius: 1 * s });
}
function house(x, z, color) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({ color }));
  base.position.y = 1.5; base.castShadow = true; base.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 4), new THREE.MeshStandardMaterial({ color: "#7a3b2e" }));
  roof.position.y = 3.9; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(base, roof);
  g.position.set(x, 0, z);
  scene.add(g);
  obstacles.push({ x, z, radius: 2.6 });
}

// Village
groundSlab(-45, 45, 8, ZONES.VILLAGE_END, 0, "#7ec850", "grass");
house(-16, -12, "#e0b26b");
house(16, -18, "#d68e5b");
tree(-30, -5); tree(30, -8); tree(-28, -40); tree(28, -45); tree(-5, -55); tree(20, -60);
rock(35, -20); rock(-38, -30);

// Forest
groundSlab(-45, 45, ZONES.VILLAGE_END, ZONES.FOREST_END, 0, "#3f8a4f", "forest");
for (let i = 0; i < 22; i++) {
  const x = (Math.random() - 0.5) * 80;
  const z = ZONES.VILLAGE_END - 8 - Math.random() * 82;
  if (Math.abs(x) < 6) continue;
  tree(x, z);
}
rock(-6, -140, 1.3); rock(7, -175, 1.1);

// Cave (corridor)
groundSlab(-9, 9, ZONES.FOREST_END, ZONES.RAMP_END, 0, "#382048", "cave");
const caveWallMat = new THREE.MeshStandardMaterial({ color: "#241531", roughness: 1 });
[-9, 9].forEach((x) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 24, ZONES.FOREST_END - ZONES.RAMP_END), caveWallMat);
  wall.position.set(x, 8, (ZONES.FOREST_END + ZONES.RAMP_END) / 2);
  wall.receiveShadow = true; wall.castShadow = true;
  scene.add(wall);
});
const caveRoof = new THREE.Mesh(new THREE.BoxGeometry(18, 1, ZONES.FOREST_END - ZONES.RAMP_END), caveWallMat);
caveRoof.position.set(0, 9, (ZONES.FOREST_END + ZONES.RAMP_END) / 2);
scene.add(caveRoof);
for (let i = 0; i < 6; i++) {
  const torchLight = new THREE.PointLight("#ffb84a", 1.2, 14);
  torchLight.position.set(i % 2 === 0 ? -7 : 7, 2.5, ZONES.FOREST_END - 15 - i * 14);
  scene.add(torchLight);
}

// Ramp up to mountain
const rampLen = ZONES.FOREST_END - ZONES.RAMP_END; // negative length magnitude reused below (unused)
const rampGeo = new THREE.BoxGeometry(16, 1, Math.abs(ZONES.RAMP_END - (-290)));
const ramp = new THREE.Mesh(rampGeo, new THREE.MeshStandardMaterial({ color: "#cdeaf7", roughness: 0.9 }));
ramp.position.set(0, MOUNTAIN_Y / 2, (ZONES.RAMP_END + (-290)) / 2);
ramp.rotation.x = -Math.atan2(MOUNTAIN_Y, Math.abs(ZONES.RAMP_END - (-290)));
ramp.receiveShadow = true;
scene.add(ramp);

// Mountain plateau
groundSlab(-45, 45, ZONES.RAMP_END, ZONES.MOUNTAIN_END, MOUNTAIN_Y, "#e7f3fa", "snow");
for (let i = 0; i < 10; i++) {
  const x = (Math.random() - 0.5) * 70;
  const z = ZONES.RAMP_END - 10 - Math.random() * 80;
  rock(x, z, 0.8 + Math.random() * 0.6);
}

// Dragon's Lair (stage 5 boss arena)
groundSlab(-22, 22, ZONES.MOUNTAIN_END, ZONES.LAIR_END, MOUNTAIN_Y, "#241030", "lair");
const lairGlowMat = new THREE.MeshStandardMaterial({ color: "#ff6b6b", emissive: "#ff3d3d", emissiveIntensity: 0.5, roughness: 0.4 });
for (let i = 0; i < 5; i++) {
  const ang = (i / 5) * Math.PI * 2;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 6, 8), new THREE.MeshStandardMaterial({ color: "#3a2050", roughness: 0.8 }));
  pillar.position.set(Math.cos(ang) * 18, MOUNTAIN_Y + 3, (ZONES.MOUNTAIN_END + ZONES.LAIR_END) / 2 + Math.sin(ang) * 18);
  pillar.castShadow = true;
  scene.add(pillar);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 8), lairGlowMat);
  flame.position.set(pillar.position.x, MOUNTAIN_Y + 6.5, pillar.position.z);
  scene.add(flame);
  const flameLight = new THREE.PointLight("#ff6b4a", 1, 12);
  flameLight.position.copy(flame.position);
  scene.add(flameLight);
}

// =================================================================
// Crystals (items)
// =================================================================
const gemGeo = new THREE.OctahedronGeometry(0.6);
function makeCrystal(id, x, z, y = 1.6) {
  const mat = new THREE.MeshStandardMaterial({ color: "#7fe3ff", emissive: "#2fa8d9", emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.3 });
  const mesh = new THREE.Mesh(gemGeo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  const light = new THREE.PointLight("#7fe3ff", 1, 6);
  mesh.add(light); light.position.y = 0.2;
  return { id, x, z, mesh, collected: false, baseY: y };
}
const crystals = [
  makeCrystal("crystal1", 10, -150),
  makeCrystal("crystal2", -5, -260),
  // crystal3 spawned after puzzle solved
];
let crystal3 = null;

// -------- energy orbs (light pickups that refill mana) --------
const energyOrbGeo = new THREE.SphereGeometry(0.35, 12, 12);
function makeEnergyOrb(x, z, y = 1.4) {
  const mat = new THREE.MeshStandardMaterial({ color: "#fff6c9", emissive: "#ffe066", emissiveIntensity: 1.1, roughness: 0.15 });
  const mesh = new THREE.Mesh(energyOrbGeo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const light = new THREE.PointLight("#ffe066", 1.3, 5);
  mesh.add(light);
  return { x, z, mesh, baseY: y, collected: false, respawnAt: 0 };
}
const energyOrbs = [
  makeEnergyOrb(6, -40), makeEnergyOrb(-6, -70),
  makeEnergyOrb(14, -130), makeEnergyOrb(-16, -165),
  makeEnergyOrb(4, -215), makeEnergyOrb(-6, -250),
  makeEnergyOrb(6, -300, MOUNTAIN_Y + 1.4), makeEnergyOrb(-6, -340, MOUNTAIN_Y + 1.4),
  makeEnergyOrb(8, -410, MOUNTAIN_Y + 1.4), makeEnergyOrb(-8, -440, MOUNTAIN_Y + 1.4),
];

// =================================================================
// NPCs
// =================================================================
const npcs = [];
function addNpc(def) {
  const mesh = def.build();
  mesh.position.set(def.x, groundHeightAt(def.z), def.z);
  scene.add(mesh);
  const tag = makeNameSprite(def.name);
  tag.position.set(0, 3.6, 0);
  mesh.add(tag);
  npcs.push({ ...def, mesh });
}

addNpc({
  id: "kek_tua", name: "Kek Tua", x: -14, z: -22, radius: 4,
  build: () => buildHumanoid({ shirt: "#8a6a4a", pants: "#4a3a2a", hair: "#d8d8d8", skin: "#e8c39e" }),
  getLines(s) {
    if (!s.flags.metKekTua) return [
      "Cucuku... desa kita kehilangan 3 Kristal Ajaib!",
      "Tanpa kristal itu, cahaya desa akan padam selamanya.",
      "Carilah ke hutan, gua, dan puncak gunung. Semoga berhasil!",
    ];
    return ["Semangat terus, cucuku! Desa mengandalkanmu."];
  },
  onComplete(s) { s.flags.metKekTua = true; },
});

addNpc({
  id: "blacksmith", name: "Bibi Api", x: 14, z: -20, radius: 4,
  build: () => buildHumanoid({ shirt: "#b5502e", pants: "#3b3b3b", hair: "#2a1c14", skin: "#c98a5b" }),
  getLines(s) {
    if (!s.inventory.has("torch")) return [
      "Gua itu gelap sekali, kamu butuh obor!",
      "Ini, bawalah obor buatanku. Hati-hati di jalan!",
    ];
    return ["Obornya masih menyala terang kan? Bagus!"];
  },
  onComplete(s) {
    if (!s.inventory.has("torch")) {
      s.inventory.add("torch"); playTone(660, 0.12); showToast("🔥 Kamu mendapat Obor!");
    }
  },
});

addNpc({
  id: "peri", name: "Peri Hutan", x: -8, z: -130, radius: 4,
  build: () => buildHumanoid({ shirt: "#ff9ad1", pants: "#c874e8", hair: "#7a3fb8", skin: "#ffe0c2", scale: 0.85 }),
  getLines(s) {
    if (!s.inventory.has("crystal1")) return ["Psst! Ada kristal bersinar tak jauh dari sini di hutan."];
    if (!s.inventory.has("torch")) return ["Kamu butuh obor dari Bibi Api untuk masuk gua di depan sana."];
    return ["Kristal kedua menantimu di dalam gua. Berani masuk?"];
  },
  onComplete() {},
});

addNpc({
  id: "hermit", name: "Kakek Gua", x: 4, z: -230, radius: 4,
  build: () => buildHumanoid({ shirt: "#5b4a8a", pants: "#3a2f5c", hair: "#c8c8c8", skin: "#d8b48f", hat: "#4a3a7a" }),
  getLines(s) {
    if (!s.inventory.has("crystal1")) return ["Kembalilah setelah kau temukan kristal pertama di hutan."];
    if (!s.inventory.has("crystal2")) return ["Kristal kedua bersembunyi di sudut gua yang gelap. Cari dengan teliti!"];
    if (!s.inventory.has("key")) return [
      "Hebat sekali kau menemukannya!",
      "Ambillah Kunci Emas ini untuk membuka jalan ke puncak gunung.",
    ];
    return ["Naga penjaga di puncak menantimu. Semoga beruntung!"];
  },
  onComplete(s) {
    if (s.inventory.has("crystal2") && !s.inventory.has("key")) {
      s.inventory.add("key"); playTone(660, 0.12); showToast("🗝️ Kamu mendapat Kunci Emas!");
    }
  },
});

// Puzzle altar
const altar = { x: 0, z: -350, radius: 5, flag: "puzzleSolved" };
const altarMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1, 8), new THREE.MeshStandardMaterial({ color: "#cfcfe0" }));
altarMesh.position.set(altar.x, MOUNTAIN_Y + 0.5, altar.z);
altarMesh.receiveShadow = true;
scene.add(altarMesh);
const altarGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: "#ffd76a", emissive: "#ffb84a", emissiveIntensity: 0.8 }));
altarGem.position.set(altar.x, MOUNTAIN_Y + 1.6, altar.z);
scene.add(altarGem);

// Gate barrier visuals
function makeBarrier(z, y = null) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({ color: "#ff4a4a", transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  mesh.position.set(0, (y ?? groundHeightAt(z)) + 4, z);
  scene.add(mesh);
  return mesh;
}
const stage1Barrier = makeBarrier(ZONES.VILLAGE_END - 1);
const caveBarrier = makeBarrier(ZONES.FOREST_END - 1);
const mountainBarrier = makeBarrier(ZONES.RAMP_END + 1);
const lairBarrier = makeBarrier(ZONES.MOUNTAIN_END - 1, MOUNTAIN_Y);

// =================================================================
// Boss: Naga Penjaga (stage 5)
// =================================================================
const boss = {
  name: "Naga Penjaga", x: 0, z: -430, hp: 220, maxHp: 220, alive: true,
  mesh: buildDragon(), lastAttackTime: 0, introShown: false,
};
boss.mesh.position.set(boss.x, MOUNTAIN_Y, boss.z);
scene.add(boss.mesh);
const bossTag = makeNameSprite(boss.name);
bossTag.position.set(0, 4.4, 0);
boss.mesh.add(bossTag);
const BOSS_ATTACK_RANGE = 5, BOSS_DAMAGE = 18, BOSS_ATTACK_COOLDOWN = 1800;

// =================================================================
// Monsters
// =================================================================
function buildMonster(bodyColor, eyeColor = "#ffe66d") {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(bodyColor));
  body.position.y = 0.9; body.castShadow = true;
  g.add(body);
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 0.6 });
  [-0.28, 0.28].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), eyeMat);
    eye.position.set(ex, 1.05, 0.62);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: "#241a12" }));
    pupil.position.set(ex, 1.05, 0.74);
    g.add(pupil);
  });
  g.userData.body = body;
  return g;
}

const monsters = [];
function addMonster(id, x, z, color) {
  const mesh = buildMonster(color);
  mesh.position.set(x, groundHeightAt(z), z);
  scene.add(mesh);
  monsters.push({
    id, x, z, homeX: x, homeZ: z, mesh, hp: 30, maxHp: 30, alive: true,
    lastAttackTime: 0, bobOffset: Math.random() * 10,
  });
}
addMonster("m1", 2, -145, "#4caf50");
addMonster("m2", -15, -178, "#4caf50");
addMonster("m3", 5, -245, "#8a4fd6");
addMonster("m4", -3, -272, "#8a4fd6");
addMonster("m5", -10, -345, "#7fd6e8");
addMonster("m6", 10, -385, "#7fd6e8");

const ATTACK_RANGE = 3, ENGAGE_RANGE = 7, ATTACK_DAMAGE = 22, MONSTER_DAMAGE = 12;
const ATTACK_COOLDOWN = 650, MONSTER_ATTACK_COOLDOWN = 1400, INVULN_TIME = 900;
const SPELL_MANA_COST = 20;
let monsterTarget = null;

const SPELL_DEFS = {
  ayah: { name: "Bola Api", color: "#ff7a3d", glow: "#ffb84a", sound: 180 },
  putri: { name: "Sihir Bintang", color: "#ff8fd0", glow: "#c084ff", sound: 520 },
  bayi: { name: "Gelembung Ajaib", color: "#8fd6ff", glow: "#c6f0ff", sound: 700 },
};

function flashDamage() {
  dmgFlashEl.classList.add("show");
  setTimeout(() => dmgFlashEl.classList.remove("show"), 200);
}

function respawnPlayer() {
  showToast("😵 Kamu kalah! Coba lagi, semangat!");
  state.hp = state.maxHp;
  state.invulnerableUntil = performance.now() + 1500;
  if (state.z > ZONES.VILLAGE_END) { state.x = 0; state.z = 5; }
  else if (state.z > ZONES.FOREST_END) { state.x = 0; state.z = ZONES.VILLAGE_END + 5; }
  else if (state.z > ZONES.RAMP_END) { state.x = 0; state.z = ZONES.FOREST_END + 5; }
  else if (state.z > ZONES.MOUNTAIN_END) { state.x = 0; state.z = ZONES.RAMP_END - 15; }
  else { state.x = 0; state.z = ZONES.MOUNTAIN_END - 15; }
  state.y = groundHeightAt(state.z);
  state.velY = 0;
  updateHpBar();
  saveGame();
}

// -------- spell particle bursts (per-character visuals) --------
function spawnSpellBurst(x, y, z, def) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const light = new THREE.PointLight(def.glow, 2.5, 8);
  group.add(light);
  const bits = [];
  for (let i = 0; i < 10; i++) {
    const geo = Math.random() < 0.5 ? new THREE.SphereGeometry(0.14, 6, 6) : new THREE.OctahedronGeometry(0.14);
    const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.glow, emissiveIntensity: 1 });
    const bit = new THREE.Mesh(geo, mat);
    const ang = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 3;
    bit.userData.vel = new THREE.Vector3(Math.cos(ang) * speed, 2 + Math.random() * 3, Math.sin(ang) * speed);
    group.add(bit); bits.push(bit);
  }
  const t0 = performance.now();
  function tick() {
    const dt2 = 0.016, age = (performance.now() - t0) / 1000;
    for (const b of bits) {
      b.position.addScaledVector(b.userData.vel, dt2);
      b.userData.vel.y -= 6 * dt2;
      b.scale.setScalar(Math.max(0, 1 - age / 0.6));
    }
    light.intensity = Math.max(0, 2.5 * (1 - age / 0.4));
    if (age < 0.6) requestAnimationFrame(tick);
    else scene.remove(group);
  }
  tick();
}

function castSpell() {
  if (inDialogue() || inPuzzle()) return;
  const now = performance.now();
  if (now < state.attackCooldownUntil) return;
  if (state.mana < SPELL_MANA_COST) {
    showToast("🔋 Energi tidak cukup! Ambil cahaya di sekitar.");
    playTone(140, 0.15);
    return;
  }
  state.attackCooldownUntil = now + ATTACK_COOLDOWN;
  state.mana = Math.max(0, state.mana - SPELL_MANA_COST);
  updateManaBar();
  const def = SPELL_DEFS[state.character] || SPELL_DEFS.ayah;
  playTone(def.sound, 0.15);
  spawnSpellBurst(state.x, state.y + 1.4, state.z, def);

  let hitAny = false;
  for (const m of monsters) {
    if (!m.alive) continue;
    const d = Math.hypot(state.x - m.x, state.z - m.z);
    if (d < ATTACK_RANGE) {
      hitAny = true;
      m.hp -= ATTACK_DAMAGE;
      const body = m.mesh.userData.body;
      body.material.emissive = new THREE.Color(def.glow);
      body.material.emissiveIntensity = 1;
      setTimeout(() => { body.material.emissiveIntensity = 0; }, 150);
      const dx = m.x - state.x, dz = m.z - state.z;
      const dist = Math.hypot(dx, dz) || 1;
      m.x += (dx / dist) * 0.8; m.z += (dz / dist) * 0.8;
      if (m.hp <= 0) {
        m.alive = false;
        playTone(140, 0.2);
        showToast("👾 Monster dikalahkan!");
        const startScale = m.mesh.scale.x;
        const t0 = performance.now();
        const shrink = () => {
          const p = Math.min(1, (performance.now() - t0) / 300);
          m.mesh.scale.setScalar(startScale * (1 - p));
          if (p < 1) requestAnimationFrame(shrink);
          else m.mesh.visible = false;
        };
        shrink();
      }
    }
  }
  if (boss.alive) {
    const d = Math.hypot(state.x - boss.x, state.z - boss.z);
    if (d < ATTACK_RANGE + 2) {
      hitAny = true;
      boss.hp = Math.max(0, boss.hp - ATTACK_DAMAGE);
      updateBossBar();
      if (boss.hp <= 0) defeatBoss();
    }
  }
  if (!hitAny) playTone(180, 0.08);
}
attackBtn.addEventListener("click", castSpell);

// =================================================================
// Player
// =================================================================
let player = null;
function spawnPlayer(characterType) {
  if (player) scene.remove(player);
  player = (CHARACTER_BUILDERS[characterType] || buildAdultMale)();
  player.position.set(0, 0, 5);
  scene.add(player);
}

const state = {
  playerName: "", character: "ayah", inventory: new Set(), crystalCount: 0, flags: {},
  startTime: 0, x: 0, y: 0, z: 5, velY: 0, grounded: true, facing: 0,
  hp: 100, maxHp: 100, mana: 100, maxMana: 100, invulnerableUntil: 0, attackCooldownUntil: 0,
  stageDone: [false, false, false, false, false],
};

// =================================================================
// Multiplayer (Supabase Realtime — presence + broadcast)
// =================================================================
const MP_ROOM = "kristal-ajaib-family";
const myId = Math.random().toString(36).slice(2);
const remotePlayers = new Map(); // id -> { mesh, target:{x,y,z,facing}, name, character }
let mpChannel = null;

function makeRemoteAvatar(character, name) {
  const mesh = (CHARACTER_BUILDERS[character] || buildAdultMale)();
  const tag = makeNameSprite(name || "Petualang");
  tag.position.set(0, 3.6, 0);
  mesh.add(tag);
  scene.add(mesh);
  return mesh;
}

function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (rp) { scene.remove(rp.mesh); remotePlayers.delete(id); }
}

function upsertRemotePlayer(id, payload) {
  let rp = remotePlayers.get(id);
  if (!rp) {
    rp = { mesh: makeRemoteAvatar(payload.character, payload.name), target: { x: payload.x, y: payload.y, z: payload.z, facing: payload.facing } };
    rp.mesh.position.set(payload.x, payload.y, payload.z);
    remotePlayers.set(id, rp);
  }
  rp.target.x = payload.x; rp.target.y = payload.y; rp.target.z = payload.z; rp.target.facing = payload.facing;
}

function connectMultiplayer() {
  if (mpChannel) { mpChannel.track({ name: state.playerName, character: state.character }); return; }
  if (typeof window.supabase === "undefined") return;
  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    mpChannel = client.channel(MP_ROOM, { config: { presence: { key: myId } } });

    mpChannel.on("broadcast", { event: "pos" }, ({ payload }) => {
      if (payload.id === myId) return;
      upsertRemotePlayer(payload.id, payload);
    });

    mpChannel.on("presence", { event: "leave" }, ({ key }) => {
      if (key !== myId) removeRemotePlayer(key);
    });

    mpChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        mpChannel.track({ name: state.playerName, character: state.character });
      }
    });

    clearInterval(mpBroadcastTimer);
    mpBroadcastTimer = setInterval(() => {
      if (!mpChannel) return;
      mpChannel.send({
        type: "broadcast", event: "pos",
        payload: { id: myId, name: state.playerName, character: state.character, x: state.x, y: state.y, z: state.z, facing: state.facing },
      });
    }, 120);
  } catch (e) { /* multiplayer unavailable, play solo */ }
}
let mpBroadcastTimer = null;

function updateRemotePlayers(dt) {
  for (const rp of remotePlayers.values()) {
    const p = rp.mesh.position;
    p.x += (rp.target.x - p.x) * Math.min(1, dt * 8);
    p.y += (rp.target.y - p.y) * Math.min(1, dt * 8);
    p.z += (rp.target.z - p.z) * Math.min(1, dt * 8);
    let diff = rp.target.facing - rp.mesh.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    rp.mesh.rotation.y += diff * Math.min(1, dt * 8);
  }
}

// =================================================================
// Input
// =================================================================
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

let cameraYaw = 0, cameraPitch = 0.35, cameraDist = 9;
let controlMode = "touch"; // "touch" | "gyro"

// -------- touch/mouse drag camera (fallback / manual mode) --------
let dragging = false, lastPX = 0, lastPY = 0;
renderer.domElement.addEventListener("pointerdown", (e) => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; });
window.addEventListener("pointermove", (e) => {
  if (!dragging || controlMode !== "touch") return;
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
  cameraYaw -= dx * 0.006;
  cameraPitch = Math.min(0.95, Math.max(-0.2, cameraPitch - dy * 0.004));
  lastPX = e.clientX; lastPY = e.clientY;
});
window.addEventListener("pointerup", () => { dragging = false; });
renderer.domElement.addEventListener("wheel", (e) => {
  cameraDist = Math.min(16, Math.max(4, cameraDist + e.deltaY * 0.01));
}, { passive: true });

// -------- gyroscope camera (default on devices that support it) --------
const GYRO_SENSITIVITY = 1.7; // gain: how far the camera swings per degree of tilt
const GYRO_SMOOTH = 16; // higher = snappier, lower = smoother/laggier
let gyroBaseline = null; // { rawYaw, rawPitch, camYaw, camPitch }
let gyroTargetYaw = 0, gyroTargetPitch = 0.35;
let gyroLastEventAt = 0;

function gyroReading(e) {
  const angle = (screen.orientation && typeof screen.orientation.angle === "number")
    ? screen.orientation.angle
    : (typeof window.orientation === "number" ? window.orientation : 90);
  const beta = e.beta || 0, gamma = e.gamma || 0;
  let rawYaw, rawPitch;
  if (angle === 90) { rawYaw = gamma; rawPitch = beta; }
  else if (angle === -90 || angle === 270) { rawYaw = -gamma; rawPitch = -beta; }
  else { rawYaw = -beta; rawPitch = gamma; }
  return { rawYaw, rawPitch };
}
function handleOrientationEvent(e) {
  if (controlMode !== "gyro") return;
  if (e.beta == null && e.gamma == null) return;
  gyroLastEventAt = performance.now();
  const { rawYaw, rawPitch } = gyroReading(e);
  if (!gyroBaseline) { gyroBaseline = { rawYaw, rawPitch, camYaw: cameraYaw, camPitch: cameraPitch }; return; }
  const dYaw = (rawYaw - gyroBaseline.rawYaw) * (Math.PI / 180) * GYRO_SENSITIVITY;
  const dPitch = (rawPitch - gyroBaseline.rawPitch) * (Math.PI / 180) * GYRO_SENSITIVITY;
  gyroTargetYaw = gyroBaseline.camYaw - dYaw;
  gyroTargetPitch = Math.min(1.15, Math.max(-0.4, gyroBaseline.camPitch + dPitch));
}
window.addEventListener("deviceorientation", handleOrientationEvent);
window.addEventListener("deviceorientationabsolute", handleOrientationEvent);

function recalibrateGyro() { gyroBaseline = null; }

async function tryEnableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== "granted") return false;
    } else if (typeof DeviceOrientationEvent === "undefined") {
      return false;
    }
    controlMode = "gyro";
    gyroBaseline = null;
    updateControlModeUI();
    setTimeout(() => {
      if (controlMode === "gyro" && !gyroBaseline) setTouchMode();
    }, 1500);
    return true;
  } catch (e) { return false; }
}
function setTouchMode() {
  controlMode = "touch";
  updateControlModeUI();
}
function updateControlModeUI() {
  const modeBtn = $("control-mode-btn"), calBtn = $("calibrate-btn");
  if (modeBtn) modeBtn.textContent = controlMode === "gyro" ? "🧭" : "🖐️";
  if (calBtn) calBtn.classList.toggle("hidden", controlMode !== "gyro");
}

// Joystick
const joyBase = $("joystick-base"), joyKnob = $("joystick-knob");
let joyActive = false, joyVec = { x: 0, y: 0 }, joyId = null;
joyBase.addEventListener("pointerdown", (e) => {
  joyActive = true; joyId = e.pointerId;
  e.stopPropagation();
});
window.addEventListener("pointermove", (e) => {
  if (!joyActive || e.pointerId !== joyId) return;
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const max = rect.width / 2;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
  joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyVec.x = dx / max; joyVec.y = dy / max;
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerId !== joyId) return;
  joyActive = false; joyVec.x = 0; joyVec.y = 0;
  joyKnob.style.transform = "translate(-50%, -50%)";
});

let jumpPressed = false;
$("jump-btn").addEventListener("click", () => { jumpPressed = true; });
$("action-btn").addEventListener("click", () => doAction());

$("mute-btn").addEventListener("click", () => {
  muted = !muted;
  $("mute-btn").textContent = muted ? "🔇" : "🔊";
});

$("control-mode-btn").addEventListener("click", async () => {
  if (controlMode === "gyro") setTouchMode();
  else await tryEnableGyro();
});
$("calibrate-btn").addEventListener("click", recalibrateGyro);
updateControlModeUI();

// =================================================================
// Dialogue
// =================================================================
let dlgQueue = [], dlgOnDone = null;
function openDialogue(name, lines, onDone) {
  dlgQueue = lines.slice();
  dlgOnDone = onDone || null;
  dlgName.textContent = name;
  dlgBox.classList.remove("hidden");
  advanceDialogue();
}
function advanceDialogue() {
  if (dlgQueue.length === 0) {
    dlgBox.classList.add("hidden");
    if (dlgOnDone) { const fn = dlgOnDone; dlgOnDone = null; fn(); }
    return;
  }
  dlgText.textContent = dlgQueue.shift();
  playTone(440, 0.05);
}
dlgBox.addEventListener("click", advanceDialogue);

function inDialogue() { return !dlgBox.classList.contains("hidden"); }
function inPuzzle() { return !puzzleOverlay.classList.contains("hidden"); }

let currentTarget = null;
function doAction() {
  if (inPuzzle()) return;
  if (inDialogue()) { advanceDialogue(); return; }
  if (currentTarget) {
    const npc = currentTarget;
    const lines = npc.getLines(state);
    openDialogue(npc.name, lines, () => npc.onComplete && npc.onComplete(state));
  }
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key.toLowerCase() === "e" || e.key === " ") {
    if (e.key === " ") jumpPressed = true;
    if (!inPuzzle()) { e.preventDefault(); doAction(); }
  }
});

// =================================================================
// Puzzle (Simon-says)
// =================================================================
const puzzleCells = Array.from(document.querySelectorAll(".puzzle-cell"));
let puzzleSeq = [], puzzleInput = [], puzzlePlaying = false, puzzleTriggered = false;

function openPuzzle() {
  puzzleOverlay.classList.remove("hidden");
  startPuzzleRound();
}
function startPuzzleRound() {
  puzzleSeq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
  puzzleInput = [];
  puzzleStatus.textContent = "Perhatikan urutannya...";
  playSequence();
}
function playSequence() {
  puzzlePlaying = true;
  let i = 0;
  const tick = () => {
    if (i >= puzzleSeq.length) { puzzlePlaying = false; puzzleStatus.textContent = "Giliranmu! Ulangi urutannya."; return; }
    const cell = puzzleCells[puzzleSeq[i]];
    cell.classList.add("lit");
    playTone(330 + puzzleSeq[i] * 110, 0.25);
    setTimeout(() => cell.classList.remove("lit"), 380);
    i++;
    setTimeout(tick, 620);
  };
  setTimeout(tick, 500);
}
puzzleCells.forEach((cell) => {
  cell.addEventListener("click", () => {
    if (puzzlePlaying) return;
    const idx = Number(cell.dataset.i);
    cell.classList.add("lit");
    setTimeout(() => cell.classList.remove("lit"), 200);
    playTone(330 + idx * 110, 0.15);
    puzzleInput.push(idx);
    const pos = puzzleInput.length - 1;
    if (puzzleInput[pos] !== puzzleSeq[pos]) {
      puzzleStatus.textContent = "Ups, coba lagi!";
      playTone(180, 0.25);
      setTimeout(startPuzzleRound, 900);
      return;
    }
    if (puzzleInput.length === puzzleSeq.length) {
      puzzleStatus.textContent = "Benar sekali! ✨";
      playTone(990, 0.3);
      state.flags[altar.flag] = true;
      setTimeout(() => {
        puzzleOverlay.classList.add("hidden");
        altarGem.visible = false;
        crystal3 = makeCrystal("crystal3", altar.x, altar.z + 2, MOUNTAIN_Y + 1.6);
        crystals.push(crystal3);
        saveGame();
      }, 900);
    }
  });
});
$("puzzle-close").addEventListener("click", () => puzzleOverlay.classList.add("hidden"));

// =================================================================
// HUD / timer
// =================================================================
function updateHud() { crystalCountEl.textContent = `💎 ${state.crystalCount}/3`; }
function updateHpBar() {
  const pct = Math.max(0, state.hp / state.maxHp) * 100;
  hpFillEl.style.width = pct + "%";
  hpFillEl.style.background = pct > 50
    ? "linear-gradient(90deg,#5be1a4,#33b6ff)"
    : pct > 20 ? "linear-gradient(90deg,#ffd76a,#ff9a5a)" : "linear-gradient(90deg,#ff3d3d,#ff6b6b)";
}
function updateManaBar() {
  const pct = Math.max(0, state.mana / state.maxMana) * 100;
  manaFillEl.style.width = pct + "%";
}
function updateBossBar() {
  const pct = Math.max(0, boss.hp / boss.maxHp) * 100;
  bossHpFillEl.style.width = pct + "%";
}
function defeatBoss() {
  boss.alive = false;
  playTone(120, 0.4);
  bossBarEl.classList.add("hidden");
  const startScale = boss.mesh.scale.x || 1;
  const t0 = performance.now();
  const shrink = () => {
    const p = Math.min(1, (performance.now() - t0) / 900);
    boss.mesh.scale.setScalar(startScale * (1 - p));
    boss.mesh.position.y += 0.05;
    if (p < 1) requestAnimationFrame(shrink);
    else boss.mesh.visible = false;
  };
  shrink();
  state.stageDone[4] = true;
  setTimeout(() => endGame(), 1000);
}

// -------- 5-stage progression --------
const STAGE_TRANSITIONS = [
  { z: ZONES.VILLAGE_END - 8 },
  { z: ZONES.FOREST_END - 8 },
  { z: ZONES.RAMP_END - 8 },
  { z: ZONES.MOUNTAIN_END - 8 },
];
function showStageComplete(n, onDone) {
  stageOverlayTitle.textContent = `🌟 Tahap ${n} Selesai! 🌟`;
  stageOverlaySub.textContent = n < 5 ? "Bersiap ke tahap berikutnya..." : "Petualangan selesai!";
  stageOverlayEl.classList.remove("hidden");
  requestAnimationFrame(() => stageOverlayEl.classList.add("show"));
  playTone(880, 0.15);
  setTimeout(() => playTone(1100, 0.2), 180);
  setTimeout(() => {
    stageOverlayEl.classList.remove("show");
    setTimeout(() => stageOverlayEl.classList.add("hidden"), 400);
    if (onDone) onDone();
  }, 2000);
}
function checkStageProgress() {
  const stageNow = stageOfZ(state.z);
  if (!state.stageDone[0] && state.flags.metKekTua && state.inventory.has("torch")) {
    state.stageDone[0] = true;
    showStageComplete(1, () => {
      state.x = 0; state.z = STAGE_TRANSITIONS[0].z; state.y = groundHeightAt(state.z);
    });
  } else if (!state.stageDone[1] && state.inventory.has("crystal1") && !monsters[0].alive && !monsters[1].alive) {
    state.stageDone[1] = true;
    showStageComplete(2, () => {
      state.x = 0; state.z = STAGE_TRANSITIONS[1].z; state.y = groundHeightAt(state.z);
    });
  } else if (!state.stageDone[2] && state.inventory.has("crystal2") && state.inventory.has("key") && !monsters[2].alive && !monsters[3].alive) {
    state.stageDone[2] = true;
    showStageComplete(3, () => {
      state.x = 0; state.z = STAGE_TRANSITIONS[2].z; state.y = groundHeightAt(state.z);
    });
  } else if (!state.stageDone[3] && state.flags.puzzleSolved && !monsters[4].alive && !monsters[5].alive) {
    state.stageDone[3] = true;
    showStageComplete(4, () => {
      state.x = 0; state.z = STAGE_TRANSITIONS[3].z; state.y = groundHeightAt(state.z);
    });
  }
}
setInterval(() => {
  if (!state.startTime) return;
  const s = Math.floor((Date.now() - state.startTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  timerEl.textContent = `⏱ ${mm}:${ss}`;
}, 1000);

// =================================================================
// Save / load
// =================================================================
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      playerName: state.playerName, x: state.x, y: state.y, z: state.z,
      inventory: Array.from(state.inventory), crystalCount: state.crystalCount,
      flags: state.flags, startTime: state.startTime,
    }));
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.playerName = d.playerName || "";
    state.x = d.x ?? 0; state.y = d.y ?? 0; state.z = d.z ?? 5;
    state.inventory = new Set(d.inventory || []);
    state.crystalCount = d.crystalCount || 0;
    state.startTime = d.startTime || Date.now();
    state.flags = d.flags || {};
    return true;
  } catch (e) { return false; }
}

// =================================================================
// Supabase leaderboard
// =================================================================
async function submitScore(name, crystalsN, seconds) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/game_scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: "return=minimal",
      },
      body: JSON.stringify({ player_name: name, crystals_collected: crystalsN, time_seconds: seconds, completed: true }),
    });
  } catch (e) { /* offline or blocked */ }
}
async function loadLeaderboard() {
  const el = $("leaderboard");
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/game_scores?select=player_name,time_seconds,crystals_collected&completed=eq.true&order=time_seconds.asc&limit=10`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) { el.innerHTML = "<em>Jadilah yang pertama di papan peringkat!</em>"; return; }
    el.innerHTML = "<strong>🏆 Tercepat</strong><ol>" + rows.map((r) => {
      const m = String(Math.floor(r.time_seconds / 60)).padStart(2, "0");
      const s = String(r.time_seconds % 60).padStart(2, "0");
      return `<li>${escapeHtml(r.player_name)} — ${m}:${s} (💎${r.crystals_collected})</li>`;
    }).join("") + "</ol>";
  } catch (e) { el.innerHTML = "<em>Papan peringkat tidak tersedia saat ini.</em>"; }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function spawnConfetti() {
  const emojis = ["🎉", "✨", "💎", "🎊", "⭐"];
  for (let i = 0; i < 24; i++) {
    const s = document.createElement("span");
    s.className = "confetti-emoji";
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = Math.random() * 100 + "%";
    s.style.animationDuration = 2 + Math.random() * 2 + "s";
    s.style.animationDelay = Math.random() * 0.6 + "s";
    endScreen.appendChild(s);
    setTimeout(() => s.remove(), 4500);
  }
}
function endGame() {
  const seconds = Math.floor((Date.now() - state.startTime) / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  $("end-summary").textContent = `${state.playerName}, kamu menemukan 3 Kristal Ajaib dalam ${mm}:${ss}! 🎉`;
  gameScreen.classList.add("hidden");
  endScreen.classList.remove("hidden");
  spawnConfetti();
  submitScore(state.playerName, state.crystalCount, seconds).then(loadLeaderboard);
  localStorage.removeItem(SAVE_KEY);
}

// =================================================================
// Main loop
// =================================================================
const clock = new THREE.Clock();
const GRAVITY = 30, JUMP_SPEED = 9, MOVE_SPEED = 7;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!startScreen.classList.contains("hidden")) { renderer.render(scene, camera); return; }
  if (endScreen && !endScreen.classList.contains("hidden")) { renderer.render(scene, camera); return; }

  // -------- gyro smoothing --------
  if (controlMode === "gyro" && gyroBaseline) {
    const smooth = Math.min(1, dt * GYRO_SMOOTH);
    let diffYaw = gyroTargetYaw - cameraYaw;
    diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
    cameraYaw += diffYaw * smooth;
    cameraPitch += (gyroTargetPitch - cameraPitch) * smooth;
  }

  // -------- movement input --------
  let ix = 0, iz = 0;
  if (!inDialogue() && !inPuzzle()) {
    if (keys["w"] || keys["arrowup"]) iz -= 1;
    if (keys["s"] || keys["arrowdown"]) iz += 1;
    if (keys["a"] || keys["arrowleft"]) ix -= 1;
    if (keys["d"] || keys["arrowright"]) ix += 1;
    if (Math.abs(joyVec.x) > 0.08 || Math.abs(joyVec.y) > 0.08) { ix = joyVec.x; iz = joyVec.y; }
  }
  const inputLen = Math.hypot(ix, iz);
  if (inputLen > 1) { ix /= inputLen; iz /= inputLen; }

  const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
  let moveX = fx * -iz + rx * ix;
  let moveZ = fz * -iz + rz * ix;
  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen > 0.001) {
    moveX /= moveLen; moveZ /= moveLen;
    let nx = state.x + moveX * MOVE_SPEED * dt;
    let nz = state.z + moveZ * MOVE_SPEED * dt;

    // gates — each zone unlocks once the previous stage's objective is complete
    if (nz < ZONES.VILLAGE_END && state.z >= ZONES.VILLAGE_END && !state.stageDone[0]) {
      nz = ZONES.VILLAGE_END + 0.6;
      showToast("🔒 Bicaralah dulu dengan Kek Tua dan ambil obor dari Bibi Api!");
    }
    if (nz < ZONES.FOREST_END && state.z >= ZONES.FOREST_END && !state.stageDone[1]) {
      nz = ZONES.FOREST_END + 0.6;
      showToast("🔒 Kalahkan monster hutan dan ambil kristalnya dulu!");
    }
    if (nz < ZONES.RAMP_END && state.z >= ZONES.RAMP_END && !state.stageDone[2]) {
      nz = ZONES.RAMP_END + 0.6;
      showToast("🔒 Kalahkan monster gua, ambil kristal & kunci dulu!");
    }
    if (nz < ZONES.MOUNTAIN_END && state.z >= ZONES.MOUNTAIN_END && !state.stageDone[3]) {
      nz = ZONES.MOUNTAIN_END + 0.6;
      showToast("🔒 Selesaikan altar sihir dan kalahkan monster gunung dulu!");
    }

    // lane bounds
    const half = laneHalfWidth(nz) - 1.2;
    nx = Math.min(half, Math.max(-half, nx));
    nz = Math.min(6.5, Math.max(ZONES.LAIR_END + 4, nz));

    // obstacle collision
    for (const ob of obstacles) {
      const dx = nx - ob.x, dz = nz - ob.z;
      const dist = Math.hypot(dx, dz);
      const minDist = ob.radius + 0.6;
      if (dist < minDist && dist > 0.0001) {
        nx = ob.x + (dx / dist) * minDist;
        nz = ob.z + (dz / dist) * minDist;
      }
    }

    state.x = nx; state.z = nz;
    const targetFacing = Math.atan2(moveX, moveZ);
    let diff = targetFacing - state.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    state.facing += diff * Math.min(1, dt * 10);
  }

  // -------- gravity / jump --------
  if (jumpPressed && state.grounded && !inDialogue() && !inPuzzle()) {
    state.velY = JUMP_SPEED; state.grounded = false;
  }
  jumpPressed = false;
  state.velY -= GRAVITY * dt;
  state.y += state.velY * dt;
  const gh = groundHeightAt(state.z);
  if (state.y <= gh) { state.y = gh; state.velY = 0; state.grounded = true; }

  player.position.set(state.x, state.y, state.z);
  player.rotation.y = state.facing;

  // walk / jump animation (moving and jumping work together)
  const parts = player.userData.parts;
  const moving = moveLen > 0.001;
  const baseScale = player.userData.baseScale || 1;
  if (state.grounded) {
    const swing = moving ? Math.sin(t * 9) * 0.55 : 0;
    parts.legL.rotation.x = swing; parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8; parts.armR.rotation.x = swing * 0.8;
    player.scale.y += (baseScale - player.scale.y) * Math.min(1, dt * 10);
  } else {
    parts.legL.rotation.x += (-0.5 - parts.legL.rotation.x) * Math.min(1, dt * 8);
    parts.legR.rotation.x += (-0.5 - parts.legR.rotation.x) * Math.min(1, dt * 8);
    parts.armL.rotation.x += (-0.4 - parts.armL.rotation.x) * Math.min(1, dt * 8);
    parts.armR.rotation.x += (-0.4 - parts.armR.rotation.x) * Math.min(1, dt * 8);
    const stretchFactor = 1 + Math.min(0.18, Math.abs(state.velY) * 0.012);
    player.scale.y += (baseScale * stretchFactor - player.scale.y) * Math.min(1, dt * 10);
  }

  // -------- camera --------
  const camX = state.x + Math.sin(cameraYaw) * cameraDist * Math.cos(cameraPitch);
  const camZ = state.z + Math.cos(cameraYaw) * cameraDist * Math.cos(cameraPitch);
  const camY = state.y + 2.2 + cameraDist * Math.sin(cameraPitch);
  camera.position.set(camX, camY, camZ);
  camera.lookAt(state.x, state.y + 1.6, state.z);

  // -------- crystals --------
  for (const c of crystals) {
    if (c.collected) continue;
    c.mesh.rotation.y += dt * 1.5;
    c.mesh.position.y = c.baseY + Math.sin(t * 2 + c.x) * 0.2;
    const d = Math.hypot(state.x - c.x, state.z - c.z);
    if (d < 2.2) {
      c.collected = true;
      c.mesh.visible = false;
      state.inventory.add(c.id);
      state.crystalCount++;
      updateHud();
      playTone(880, 0.15);
      showToast("💎 Kristal Ajaib ditemukan!");
      saveGame();
    }
  }

  // -------- puzzle proximity --------
  if (!state.flags[altar.flag]) {
    const d = Math.hypot(state.x - altar.x, state.z - altar.z);
    altarGem.rotation.y += dt;
    if (d < altar.radius && !puzzleTriggered && !inDialogue() && !inPuzzle()) {
      puzzleTriggered = true;
      openPuzzle();
    } else if (d >= altar.radius) {
      puzzleTriggered = false;
    }
  }

  // -------- gate barrier visibility --------
  stage1Barrier.visible = !state.stageDone[0];
  caveBarrier.visible = !state.stageDone[1];
  mountainBarrier.visible = !state.stageDone[2];
  lairBarrier.visible = !state.stageDone[3];

  // -------- stage progression --------
  checkStageProgress();
  const now = performance.now();

  // -------- energy orbs (mana pickups) --------
  for (const orb of energyOrbs) {
    if (!orb.collected) {
      orb.mesh.rotation.y += dt * 2;
      orb.mesh.position.y = orb.baseY + Math.sin(t * 3 + orb.x) * 0.15;
      const d = Math.hypot(state.x - orb.x, state.z - orb.z);
      if (d < 2) {
        orb.collected = true;
        orb.mesh.visible = false;
        orb.respawnAt = performance.now() + 12000;
        state.mana = Math.min(state.maxMana, state.mana + 35);
        updateManaBar();
        playTone(700, 0.12);
        showToast("💡 Energi sihir bertambah!");
      }
    } else if (performance.now() > orb.respawnAt) {
      orb.collected = false;
      orb.mesh.visible = true;
    }
  }

  // -------- boss (Naga Penjaga, stage 5) --------
  if (boss.alive) {
    const dBoss = Math.hypot(state.x - boss.x, state.z - boss.z);
    boss.mesh.position.y = MOUNTAIN_Y + Math.sin(t * 1.2) * 0.3;
    if (dBoss < 30 && !boss.introShown) {
      boss.introShown = true;
      bossBarEl.classList.remove("hidden");
      updateBossBar();
      openDialogue("Naga Penjaga", [
        "GRAOOO! Siapa yang berani memasuki sarangku?",
        "Buktikan sihirmu, wahai petualang kecil!",
      ], null);
    }
    if (dBoss < 40) {
      boss.mesh.lookAt(state.x, boss.mesh.position.y, state.z);
      if (dBoss < BOSS_ATTACK_RANGE && now > boss.lastAttackTime + BOSS_ATTACK_COOLDOWN && now > state.invulnerableUntil) {
        boss.lastAttackTime = now;
        state.hp -= BOSS_DAMAGE;
        state.invulnerableUntil = now + INVULN_TIME;
        flashDamage();
        playTone(110, 0.3);
        updateHpBar();
        if (state.hp <= 0) respawnPlayer();
      }
    }
  }

  // -------- monsters --------
  monsterTarget = null;
  let bestMonsterDist = Infinity;
  for (const m of monsters) {
    if (!m.alive) continue;
    m.mesh.position.y = groundHeightAt(m.z) + Math.sin(t * 2 + m.bobOffset) * 0.12;
    m.mesh.rotation.y += dt * 0.6;
    const d = Math.hypot(state.x - m.x, state.z - m.z);
    if (d < ENGAGE_RANGE && d < bestMonsterDist) { bestMonsterDist = d; monsterTarget = m; }
    if (d < ATTACK_RANGE && now > m.lastAttackTime + MONSTER_ATTACK_COOLDOWN && now > state.invulnerableUntil) {
      m.lastAttackTime = now;
      state.hp -= MONSTER_DAMAGE;
      state.invulnerableUntil = now + INVULN_TIME;
      flashDamage();
      playTone(160, 0.2);
      updateHpBar();
      if (state.hp <= 0) respawnPlayer();
    }
  }
  const bossInRange = boss.alive && Math.hypot(state.x - boss.x, state.z - boss.z) < ENGAGE_RANGE + 3;

  // -------- NPC proximity + prompt --------
  currentTarget = null;
  let bestDist = Infinity;
  for (const npc of npcs) {
    const d = Math.hypot(state.x - npc.x, state.z - npc.z);
    if (d < npc.radius && d < bestDist) { bestDist = d; currentTarget = npc; }
  }
  if (currentTarget && !inDialogue() && !inPuzzle()) {
    promptEl.textContent = `✅ Bicara dengan ${currentTarget.name}`;
    promptEl.classList.remove("hidden");
  } else if (bossInRange && !inDialogue() && !inPuzzle()) {
    promptEl.textContent = `✨ Naga di dekatmu! Tekan Sihir`;
    promptEl.classList.remove("hidden");
  } else if (monsterTarget && !inDialogue() && !inPuzzle()) {
    promptEl.textContent = `✨ Monster di dekatmu! Tekan Sihir`;
    promptEl.classList.remove("hidden");
  } else {
    promptEl.classList.add("hidden");
  }

  updateRemotePlayers(dt);

  renderer.render(scene, camera);
}
animate();

// =================================================================
// Boot
// =================================================================
function startNewGame(name, characterType) {
  state.playerName = name;
  state.character = characterType;
  state.x = 0; state.y = 0; state.z = 5; state.facing = 0;
  state.inventory = new Set(); state.crystalCount = 0; state.flags = {};
  state.startTime = Date.now();
  state.hp = state.maxHp; state.mana = state.maxMana; state.invulnerableUntil = 0;
  state.stageDone = [false, false, false, false, false];
  spawnPlayer(characterType);
  beginGameUI();
  connectMultiplayer();
}
function beginGameUI() {
  startScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  bossBarEl.classList.add("hidden");
  document.querySelectorAll(".confetti-emoji").forEach((n) => n.remove());
  gameScreen.classList.remove("hidden");
  updateHud();
  updateHpBar();
  updateManaBar();
}

setInterval(() => {
  areaNameEl.textContent = `Tahap ${stageOfZ(state.z)} — ${zoneName(state.z)}`;
}, 400);

let selectedCharacter = "ayah";
document.querySelectorAll(".char-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".char-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedCharacter = btn.dataset.char;
  });
});

$("start-btn").addEventListener("click", () => {
  const name = ($("player-name").value || "Petualang").trim().slice(0, 20) || "Petualang";
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouch) tryEnableGyro().finally(() => startNewGame(name, selectedCharacter));
  else startNewGame(name, selectedCharacter);
});
$("player-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("start-btn").click(); });
$("replay-btn").addEventListener("click", () => {
  endScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
  $("player-name").value = state.playerName;
});

if (loadGame() && state.crystalCount < 3) {
  $("player-name").value = state.playerName;
}
