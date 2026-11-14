import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ================= CONFIGURACIÓN  ================= */
const CFG = {
  weapons: [
    
    { name: 'Pistola', file: 'models/pistola.glb', size: 0.45, pos: [0.28, -0.26, -0.55], rot: [0, Math.PI / 2, 0], ammo: 12, pickup: 8,  color: 0x777777 },
    { name: 'Rifle',   file: 'models/rifle.glb',   size: 0.95, pos: [0.28, -0.30, -0.65], rot: [0, Math.PI / 2, 0], ammo: 20, pickup: 10, color: 0x444444 },
  ],
  zombie: { file: 'models/zombie.glb', height: 1.8, yawOffset: 0, hp: 2, detect: 22, speed: 2.6, fastSpeed: 4.0, touch: 0.9 },
  ammo: { file: 'models/municion.glb', size: 0.5 },   // modelo de las cajas de munición 
  floorTexture: 'textures/floor.jpg',   
  playerSpeed: 6, fireDelay: 0.18,
};

/* ================= ESCENA ================= */
const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);
scene.fog = new THREE.Fog(0x0b0d10, 6, 60);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
const moon = new THREE.DirectionalLight(0x9fb4d0, 0.8); moon.position.set(20, 40, 10); scene.add(moon);
const torch = new THREE.SpotLight(0xfff0d0, 90, 45, 0.55, 0.5, 1.2);
camera.add(torch); camera.add(torch.target); torch.target.position.set(0, 0, -5);

/* ================= MUNDO ================= */
const colliders = [];  
const blockers = [];    
const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 1 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }),
};
function addBox(x, z, w, d, h, mat = mats.crate) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, h / 2, z); scene.add(m); blockers.push(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}
const floorMat = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 1 });
new THREE.TextureLoader().load(CFG.floorTexture, t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 110); floorMat.map = t; floorMat.color.set(0xffffff); floorMat.needsUpdate = true;
}, undefined, () => {});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 230), floorMat);
floor.rotation.x = -Math.PI / 2; scene.add(floor);

const START_Z = 105, END_Z = -102;
// Muros perimetrales
addBox(-16.5, 0, 1, 230, 6, mats.wall); addBox(16.5, 0, 1, 230, 6, mats.wall);
addBox(0, 115.5, 34, 1, 6, mats.wall); addBox(0, -115.5, 34, 1, 6, mats.wall);
// Barreras con una abertura: obligan a un recorrido estructurado
[[60, -4], [20, 6], [-20, -6], [-60, 4]].forEach(([z, gx]) => {
  const gw = 3.5;
  addBox((-16 + gx - gw) / 2, z, (gx - gw) + 16, 1.5, 4, mats.wall);
  addBox((16 + gx + gw) / 2, z, 16 - (gx + gw), 1.5, 4, mats.wall);
});
// Zona de inicio y de extracción
const ring = (color, z) => {
  const r = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }));
  r.position.set(0, 0.06, z); scene.add(r);
  const l = new THREE.PointLight(color, 40, 25); l.position.set(0, 3, z); scene.add(l);
  return r;
};
ring(0x4aa3ff, START_Z);
const extraction = ring(0x3ddc97, END_Z);

const ZOMBIE_SPAWNS = [[-5,82,0],[7,78,0],[-9,66,0],[3,54,0],[-3,48,1],[9,40,0],[-8,34,0],[2,26,0],[-6,10,1],[8,6,0],
  [0,-8,0],[-9,-14,0],[6,-30,1],[-4,-42,0],[10,-50,0],[-2,-66,1],[7,-74,0],[-8,-84,0],[3,-90,1]];
const AMMO_SPAWNS = [[5,92,0],[-10,56,1],[8,30,0],[-5,-5,1],[10,-35,0],[-8,-70,1]];
// Obstáculos 
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 50; i++) {
  const x = (rnd() - 0.5) * 26, z = 95 - rnd() * 190, w = 1.5 + rnd() * 2, d = 1.5 + rnd() * 2;
  if (z > 96 || z < -96) continue;
  if ([60, 20, -20, -60].some(bz => Math.abs(z - bz) < 5)) continue;
  if ([...ZOMBIE_SPAWNS, ...AMMO_SPAWNS].some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 4)) continue;
  addBox(x, z, w, d, 1 + rnd() * 1.5);
}

/* ================= CARGA DE MODELOS GLB ================= */
const loader = new GLTFLoader();
const loadGLB = f => new Promise(res => loader.load(f, g => res(g), undefined, () => { console.warn('No se pudo cargar', f); res(null); }));
const missing = [];

function fitModel(gltf, size, byHeight) {
  const model = gltf.scene, box = new THREE.Box3().setFromObject(model), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = size / (byHeight ? sz.y : Math.max(sz.x, sz.y, sz.z));
  model.scale.multiplyScalar(s);
  model.position.set(-c.x * s, byHeight ? -box.min.y * s : -c.y * s, -c.z * s);
  return model;
}
function fallbackGun(color, len) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, len), m);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), m); grip.position.set(0, -0.1, len / 2 - 0.05);
  g.add(body, grip); return g;
}
function fallbackZombie() {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0x5f7a4d }), cloth = new THREE.MeshStandardMaterial({ color: 0x3b3f55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), cloth); body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin); head.position.y = 1.65;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.35), cloth); legs.position.y = 0.3;
  const arms = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.2), skin); arms.position.set(0, 1.2, 0.35);
  g.add(body, head, legs, arms); return g;
}

/* ================= ARMAS (en primera persona) ================= */
const holder = new THREE.Group(); camera.add(holder);
const weapons = CFG.weapons.map(w => ({ ...w, ammo: w.ammo, obj: null }));
let current = 0, recoil = 0, lastShot = 0;
function setWeapon(i) {
  current = i; weapons.forEach((w, k) => w.obj && (w.obj.visible = k === i)); updateHUD();
}

/* ================= ZOMBIS ================= */
let zombieGLTF = null;
const zombies = [], hitboxes = [];
function spawnZombie(x, z, fast) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; root.position.set(x, 0, z);
  let model, mixer = null, action = null;
  if (zombieGLTF) {
    model = SkeletonUtils.clone(zombieGLTF.scene);
    const box = new THREE.Box3().setFromObject(zombieGLTF.scene), s = CFG.zombie.height / box.getSize(new THREE.Vector3()).y, c = box.getCenter(new THREE.Vector3());
    model.scale.multiplyScalar(s); model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    if (zombieGLTF.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const clip = zombieGLTF.animations.find(a => /walk|run|caminar/i.test(a.name)) || zombieGLTF.animations[0];
      action = mixer.clipAction(clip);
    }
  } else model = fallbackZombie();
  const pivot = new THREE.Group(); pivot.rotation.y = CFG.zombie.yawOffset; pivot.add(model); root.add(pivot);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, CFG.zombie.height, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = CFG.zombie.height / 2; root.add(hit);
  const zb = { root, hit, mixer, action, hp: CFG.zombie.hp, pivot, walk: Math.random() * 6, active: false, alive: true, speed: fast ? CFG.zombie.fastSpeed : CFG.zombie.speed, fall: 0 };
  hit.userData.zombie = zb; scene.add(root); zombies.push(zb); hitboxes.push(hit);
}

/* ================= COLECCIONABLES ================= */
const pickups = [];
let ammoGLTF = null;
function spawnPickup(x, z, wi) {
  const col = wi ? 0xe0a030 : 0x4aa3ff, g = new THREE.Group();
  g.position.set(x, 0.6, z);
  if (ammoGLTF) {
    const m = SkeletonUtils.clone(ammoGLTF.scene), box = new THREE.Box3().setFromObject(ammoGLTF.scene);
    const s = CFG.ammo.size / Math.max(...box.getSize(new THREE.Vector3()).toArray()), c = box.getCenter(new THREE.Vector3());
    m.scale.multiplyScalar(s); m.position.set(-c.x * s, -c.y * s, -c.z * s); g.add(m);
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 })));
  }
  // aro de color en el suelo: indica para qué arma sirve (azul = arma 1, naranja = arma 2)
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }));
  ring.position.y = -0.58; g.add(ring);
  scene.add(g); pickups.push({ mesh: g, wi, taken: false });
}

/* ================= ESTADO / HUD ================= */
let state = 'loading', yaw = 0, pitch = 0;
const player = { x: 0, z: START_Z };
const keys = {};
let msgTimer;
function say(t) { const m = $('msg'); m.textContent = t; m.classList.add('on'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('on'), 1800); }
function updateHUD() {
  const w = weapons[current];
  $('ammo').textContent = w.ammo; $('ammo').classList.toggle('empty', w.ammo === 0);
  $('wname').textContent = `${current + 1} · ${w.name}`;
  $('zleft').textContent = `Zombis: ${zombies.filter(z => z.alive).length}`;
}
function collide(p, r) {
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { p.x += r; }
    }
  }
}
function beep() {
  try {
    const a = beep.ctx || (beep.ctx = new AudioContext()), o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(180, a.currentTime); o.frequency.exponentialRampToValueAtTime(40, a.currentTime + 0.12);
    g.gain.setValueAtTime(0.15, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.12);
  } catch (e) {}
}

/* ================= DISPARO (raycasting) ================= */
const ray = new THREE.Raycaster();
function shoot() {
  const now = performance.now() / 1000;
  if (now - lastShot < CFG.fireDelay) return;
  const w = weapons[current];
  if (w.ammo <= 0) { say('Sin munición — busca una caja'); return; }
  lastShot = now; w.ammo--; recoil = 0.08; beep(); updateHUD();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const alive = hitboxes.filter(h => h.userData.zombie.alive);
  const zh = ray.intersectObjects(alive, false)[0];
  const wh = ray.intersectObjects(blockers, false)[0];
  if (zh && (!wh || zh.distance < wh.distance)) {
    const z = zh.object.userData.zombie;
    z.hp--; z.active = true;
    $('cross').classList.add('hit'); setTimeout(() => $('cross').classList.remove('hit'), 120);
    if (z.hp <= 0) { z.alive = false; z.action && z.action.stop(); updateHUD(); }
  }
}

/* ================= CONTROLES ================= */
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'Digit1') setWeapon(0);
  if (e.code === 'Digit2') setWeapon(1);
  if (e.code === 'KeyR') location.reload();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || state !== 'play') return;
  yaw -= e.movementX * 0.0022; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * 0.0022));
});

addEventListener('mousedown', e => { if (e.button === 0 && state === 'play' && document.pointerLockElement) shoot(); });
$('play').onclick = () => renderer.domElement.requestPointerLock();
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && state === 'ready') state = 'play';
  $('start').classList.toggle('on', !locked && (state === 'play' || state === 'ready'));
  if (!locked && state === 'play') $('play').textContent = 'Continuar';
});

/* ================= BUCLE ================= */
function endGame(kind) {
  state = kind; document.exitPointerLock();
  $(kind === 'over' ? 'over' : 'win').classList.add('on');
}
const clock = new THREE.Clock(); let bob = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state === 'play') {
    // Movimiento del jugador
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (f || r) {
      const len = Math.hypot(f, r), sp = CFG.playerSpeed * dt / len;
      player.x += (-Math.sin(yaw) * f + Math.cos(yaw) * r) * sp;
      player.z += (-Math.cos(yaw) * f - Math.sin(yaw) * r) * sp;
      bob += dt * 9; collide(player, 0.4);
    }
    camera.position.set(player.x, 1.7 + Math.sin(bob) * ((f || r) ? 0.04 : 0), player.z);
    camera.rotation.set(pitch, yaw, 0);
    recoil = Math.max(0, recoil - dt * 0.6);
    holder.position.set(0, Math.sin(bob * 0.5) * ((f || r) ? 0.006 : 0), recoil);
    // Zombis
    for (const z of zombies) {
      if (z.mixer) z.mixer.update(dt);
      if (!z.alive) { if (z.fall < 1) { z.fall = Math.min(1, z.fall + dt * 2.5); z.root.rotation.x = -z.fall * Math.PI / 2; } continue; }
      const dx = player.x - z.root.position.x, dz = player.z - z.root.position.z, d = Math.hypot(dx, dz);
      if (!z.active && d < CFG.zombie.detect) { z.active = true; }
      if (!z.active) continue;               // inactivo: no se mueve
      if (z.action) { if (!z.action.isRunning()) z.action.play(); z.action.timeScale = z.speed / CFG.zombie.speed; }
      else { // sin clips en el GLB: caminata procedural (balanceo, rebote e inclinación)
        z.walk += dt * z.speed * 3;
        z.pivot.position.y = Math.abs(Math.sin(z.walk)) * 0.08;
        z.pivot.rotation.z = Math.sin(z.walk) * 0.09;
        z.pivot.rotation.x = 0.14;
      }
      z.root.rotation.y = Math.atan2(dx, dz);
      const p = z.root.position, step = Math.min(z.speed * dt, d);
      p.x += dx / d * step; p.z += dz / d * step;
      const tmp = { x: p.x, z: p.z }; collide(tmp, 0.4); p.x = tmp.x; p.z = tmp.z;
      if (d < CFG.zombie.touch) { endGame('over'); break; }
    }
    // Coleccionables de munición
    for (const k of pickups) {
      if (k.taken) continue;
      k.mesh.rotation.y += dt * 2;
      if (Math.hypot(k.mesh.position.x - player.x, k.mesh.position.z - player.z) < 1.3) {
        k.taken = true; scene.remove(k.mesh);
        const w = weapons[k.wi]; w.ammo += w.pickup; say(`+${w.pickup} munición · ${w.name}`); updateHUD();
      }
    }
    // Zona de extracción
    if (Math.hypot(player.x - extraction.position.x, player.z - extraction.position.z) < 5) endGame('win');
  }
  renderer.render(scene, camera);
}

/* ================= INICIO ================= */
async function init() {
  const [gz, ga, ...gw] = await Promise.all([CFG.zombie.file, CFG.ammo.file, ...CFG.weapons.map(w => w.file)].map(loadGLB));
  ammoGLTF = ga; if (!ga) missing.push(CFG.ammo.file);
  zombieGLTF = gz; if (!gz) missing.push(CFG.zombie.file);
  if (gz) console.log('Animaciones del zombi:', gz.animations.map(a => a.name));
  weapons.forEach((w, i) => {
    let model;
    if (gw[i]) model = fitModel(gw[i], w.size, false);
    else { missing.push(w.file); model = fallbackGun(w.color, w.size); }
    const pivot = new THREE.Group(); pivot.add(model);
    pivot.rotation.set(...w.rot); pivot.position.set(...w.pos);
    if (!gw[i]) pivot.rotation.set(0, 0, 0);
    holder.add(pivot); w.obj = pivot;
  });
  ZOMBIE_SPAWNS.forEach(([x, z, f]) => spawnZombie(x, z, f));
  AMMO_SPAWNS.forEach(([x, z, wi]) => spawnPickup(x, z, wi));
  if (missing.length) $('note').textContent = 'No se encontraron: ' + missing.join(', ') + ' (se usan modelos provisionales).';
  setWeapon(0); state = 'ready';
  camera.position.set(player.x, 1.7, player.z); camera.rotation.set(0, 0, 0);
  $('play').disabled = false; $('play').textContent = 'Jugar';
}
init(); loop();