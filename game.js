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
};
const MOUNTAIN_Y = 15;

function zoneName(z) {
  if (z > ZONES.VILLAGE_END) return "Desa Damai";
  if (z > ZONES.FOREST_END) return "Hutan Bisikan";
  if (z > ZONES.RAMP_END) return "Gua Kunang-Kunang";
  return "Puncak Awan";
}
function laneHalfWidth(z) {
  if (z <= ZONES.FOREST_END && z > ZONES.RAMP_END) return 8; // cave + ramp corridor
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
scene.background = new THREE.Color("#8ec9ff");
scene.fog = new THREE.Fog("#8ec9ff", 40, 130);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasWrap.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight("#bfe3ff", "#5fb84e", 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff6d8", 1.1);
sun.position.set(30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 150;
scene.add(sun);
scene.add(new THREE.AmbientLight("#ffffff", 0.25));

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
function buildHumanoid({ skin = "#f2c197", shirt = "#4a9eff", pants = "#3b3b55", hair = "#5b3a29", scale = 1, hat = null } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.6), mat(shirt));
  torso.position.y = 1.55; torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat(skin));
  head.position.y = 2.65; head.castShadow = true;
  g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: "#241a12" });
  [-0.2, 0.2].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye.position.set(ex, 2.68, 0.44);
    g.add(eye);
  });

  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.9), mat(hair));
  hairMesh.position.y = 3.08;
  g.add(hairMesh);

  if (hat) {
    const hatMesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12), mat(hat));
    hatMesh.position.y = 3.5;
    hatMesh.castShadow = true;
    g.add(hatMesh);
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
  const legL = limb(0.4, 1.15, 0.4, pants, -0.32, 0.9);
  const legR = limb(0.4, 1.15, 0.4, pants, 0.32, 0.9);
  g.add(armL, armR, legL, legR);

  g.scale.setScalar(scale);
  g.userData.parts = { torso, head, armL, armR, legL, legR };
  return g;
}

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

function groundSlab(x1, x2, z1, z2, y, color) {
  const w = x2 - x1, d = z1 - z2;
  const geo = new THREE.BoxGeometry(w, 1, d);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
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
groundSlab(-45, 45, 8, ZONES.VILLAGE_END, 0, "#7ec850");
house(-16, -12, "#e0b26b");
house(16, -18, "#d68e5b");
tree(-30, -5); tree(30, -8); tree(-28, -40); tree(28, -45); tree(-5, -55); tree(20, -60);
rock(35, -20); rock(-38, -30);

// Forest
groundSlab(-45, 45, ZONES.VILLAGE_END, ZONES.FOREST_END, 0, "#3f8a4f");
for (let i = 0; i < 22; i++) {
  const x = (Math.random() - 0.5) * 80;
  const z = ZONES.VILLAGE_END - 8 - Math.random() * 82;
  if (Math.abs(x) < 6) continue;
  tree(x, z);
}
rock(-6, -140, 1.3); rock(7, -175, 1.1);

// Cave (corridor)
groundSlab(-9, 9, ZONES.FOREST_END, ZONES.RAMP_END, 0, "#382048");
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
groundSlab(-45, 45, ZONES.RAMP_END, ZONES.MOUNTAIN_END, MOUNTAIN_Y, "#e7f3fa");
for (let i = 0; i < 10; i++) {
  const x = (Math.random() - 0.5) * 70;
  const z = ZONES.RAMP_END - 10 - Math.random() * 80;
  rock(x, z, 0.8 + Math.random() * 0.6);
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

// Torch / key pickups
function makeGlow(color, x, z, y) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

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

addNpc({
  id: "naga", name: "Naga Penjaga", x: 0, z: -370, radius: 6,
  build: () => buildDragon(),
  getLines(s) {
    if (s.crystalCount < 3) return ["Kembalilah setelah kau kumpulkan ketiga Kristal Ajaib!"];
    return ["Luar biasa! Kau berhasil menyelamatkan desa kita!"];
  },
  onComplete(s) { if (s.crystalCount >= 3) endGame(); },
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
function makeBarrier(z) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({ color: "#ff4a4a", transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  mesh.position.set(0, groundHeightAt(z) + 4, z);
  scene.add(mesh);
  return mesh;
}
const caveBarrier = makeBarrier(ZONES.FOREST_END - 1);
const mountainBarrier = makeBarrier(ZONES.RAMP_END + 1);

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

const ATTACK_RANGE = 2.6, ENGAGE_RANGE = 7, ATTACK_DAMAGE = 15, MONSTER_DAMAGE = 12;
const ATTACK_COOLDOWN = 450, MONSTER_ATTACK_COOLDOWN = 1400, INVULN_TIME = 900;
let monsterTarget = null;

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
  else { state.x = 0; state.z = ZONES.RAMP_END - 15; }
  state.y = groundHeightAt(state.z);
  state.velY = 0;
  updateHpBar();
  saveGame();
}

function performAttack() {
  const now = performance.now();
  if (now < state.attackCooldownUntil) return;
  state.attackCooldownUntil = now + ATTACK_COOLDOWN;
  playTone(220, 0.08);
  let hitAny = false;
  for (const m of monsters) {
    if (!m.alive) continue;
    const d = Math.hypot(state.x - m.x, state.z - m.z);
    if (d < ATTACK_RANGE) {
      hitAny = true;
      m.hp -= ATTACK_DAMAGE;
      const body = m.mesh.userData.body;
      body.material.emissive = new THREE.Color("#ff3333");
      body.material.emissiveIntensity = 0.8;
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
  if (!hitAny) playTone(180, 0.08);
}
attackBtn.addEventListener("click", performAttack);

// =================================================================
// Player
// =================================================================
const player = buildHumanoid({ shirt: "#4a9eff", pants: "#2d3450", hair: "#3a2a1c", skin: "#f2c197" });
player.position.set(0, 0, 5);
scene.add(player);

const state = {
  playerName: "", inventory: new Set(), crystalCount: 0, flags: {},
  startTime: 0, x: 0, y: 0, z: 5, velY: 0, grounded: true, facing: 0,
  hp: 100, maxHp: 100, invulnerableUntil: 0, attackCooldownUntil: 0,
};

// =================================================================
// Input
// =================================================================
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

let cameraYaw = 0, cameraPitch = 0.35, cameraDist = 9;
let dragging = false, lastPX = 0, lastPY = 0;
renderer.domElement.addEventListener("pointerdown", (e) => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; });
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
  cameraYaw -= dx * 0.006;
  cameraPitch = Math.min(0.95, Math.max(-0.2, cameraPitch - dy * 0.004));
  lastPX = e.clientX; lastPY = e.clientY;
});
window.addEventListener("pointerup", () => { dragging = false; });
renderer.domElement.addEventListener("wheel", (e) => {
  cameraDist = Math.min(16, Math.max(4, cameraDist + e.deltaY * 0.01));
}, { passive: true });

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

    // gates
    if (nz < ZONES.FOREST_END && state.z >= ZONES.FOREST_END && !state.inventory.has("torch")) {
      nz = ZONES.FOREST_END + 0.6;
      showToast("🔒 Gelap sekali! Aku butuh obor untuk masuk.");
    }
    if (nz < ZONES.RAMP_END && state.z >= ZONES.RAMP_END && !state.inventory.has("key")) {
      nz = ZONES.RAMP_END + 0.6;
      showToast("🔒 Jalan ke atas terkunci. Aku butuh kunci.");
    }

    // lane bounds
    const half = laneHalfWidth(nz) - 1.2;
    nx = Math.min(half, Math.max(-half, nx));
    nz = Math.min(6.5, Math.max(ZONES.MOUNTAIN_END + 4, nz));

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

  // walk animation
  const parts = player.userData.parts;
  const moving = moveLen > 0.001 && state.grounded;
  const swing = moving ? Math.sin(t * 9) * 0.55 : 0;
  parts.legL.rotation.x = swing; parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8; parts.armR.rotation.x = swing * 0.8;

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
  caveBarrier.visible = !state.inventory.has("torch");
  mountainBarrier.visible = !state.inventory.has("key");

  // -------- monsters --------
  monsterTarget = null;
  let bestMonsterDist = Infinity;
  const now = performance.now();
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
  attackBtn.classList.toggle("inactive", !monsterTarget || inDialogue() || inPuzzle());

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
  } else if (monsterTarget && !inDialogue() && !inPuzzle()) {
    promptEl.textContent = `⚔️ Monster di dekatmu! Tekan Serang`;
    promptEl.classList.remove("hidden");
  } else {
    promptEl.classList.add("hidden");
  }

  renderer.render(scene, camera);
}
animate();

// =================================================================
// Boot
// =================================================================
function startNewGame(name) {
  state.playerName = name;
  state.x = 0; state.y = 0; state.z = 5; state.facing = 0;
  state.inventory = new Set(); state.crystalCount = 0; state.flags = {};
  state.startTime = Date.now();
  state.hp = state.maxHp; state.invulnerableUntil = 0;
  beginGameUI();
}
function beginGameUI() {
  startScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  document.querySelectorAll(".confetti-emoji").forEach((n) => n.remove());
  gameScreen.classList.remove("hidden");
  updateHud();
  updateHpBar();
}

setInterval(() => { areaNameEl.textContent = zoneName(state.z); }, 400);

$("start-btn").addEventListener("click", () => {
  const name = ($("player-name").value || "Petualang").trim().slice(0, 20) || "Petualang";
  startNewGame(name);
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
