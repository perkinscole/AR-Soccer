import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sim } from './sim.js';
import { View, buildRoom, TABLE_HEIGHT } from './view.js';
import { Input } from './input.js';
import { XR } from './xr.js';
import { play, unlockAudio } from './audio.js';
import './style.css';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const background = new THREE.Color(0x141a24);
scene.background = background;
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1, 3, 2);
scene.add(sun);

const aspect = () => (innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : 16 / 9);
const camera = new THREE.PerspectiveCamera(50, aspect(), 0.02, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, TABLE_HEIGHT, 0.04);
controls.enablePan = false;
controls.minDistance = 0.5;
controls.maxDistance = 3.5;
controls.maxPolarAngle = Math.PI * 0.46;

let userMovedCamera = false;
controls.addEventListener('start', () => { userMovedCamera = true; });

function frameCamera() {
  userMovedCamera = false;
  // back off far enough that the whole pitch fits, whatever the aspect ratio
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(1.15, 0.84 / (half * camera.aspect));
  camera.position.set(0, TABLE_HEIGHT + dist * 0.62, 0.04 + dist * 0.78);
  controls.update();
}
frameCamera();

const sim = new Sim({ humans: [true, false] });
const view = new View(scene, sim);
const room = buildRoom();
scene.add(room);
const input = new Input();
const xr = new XR(renderer, scene, view.table, room, background);

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = aspect();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (!userMovedCamera) frameCamera();
});
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlockAudio);

const fwd = new THREE.Vector3();
const move = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

// Turn "stick up" into "away from the viewer" on the table, wherever the
// viewer is standing and however the table is rotated.
function stickToPitch(x, y) {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) {
    cam.getWorldQuaternion(quat);
    fwd.set(0, 1, 0).applyQuaternion(quat);
    fwd.y = 0;
  }
  fwd.normalize();
  move.set(-fwd.z * x + fwd.x * y, 0, fwd.x * x + fwd.z * y);
  move.applyAxisAngle(up, -view.table.rotation.y);
  return move;
}

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let goalFlash = 0;
const latched = { pass: false, switch: false, start: false };
const hint = document.getElementById('hint');

renderer.setAnimationLoop((now, frame) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const s = input.poll(xr.session);
  if (s.any && hint) hint.classList.add('faded');
  if (s.recenter) {
    if (xr.mode) xr.recenter();
    else frameCamera();
  }
  xr.update(frame, s, dt);

  const m = stickToPitch(s.x, s.y);
  // Presses are latched until a sim step consumes them: at 120 Hz some
  // frames run no sim step at all, and the press must not be lost.
  for (const name of ['pass', 'switch', 'start']) latched[name] ||= s[name];
  const cmd = { mx: m.x, mz: m.z, sprint: s.sprint, shoot: s.shootDown, ...latched };
  acc += dt;
  while (acc >= STEP) {
    sim.step(STEP, [cmd]);
    cmd.pass = cmd.switch = cmd.start = false; // edges fire once
    latched.pass = latched.switch = latched.start = false;
    acc -= STEP;
  }
  for (const e of sim.events) {
    play(e);
    if (e.type === 'goal') goalFlash = e.team === 0 ? 1 : 2;
  }
  sim.events.length = 0;

  let message = '';
  if (sim.phase === 'goal') message = goalFlash === 1 ? 'GOAL!' : 'BLUE SCORE';
  else if (sim.phase === 'kickoff') message = 'KICK OFF';
  else if (sim.phase === 'fulltime') message = 'FULL TIME · pass to replay';
  view.drawBoard(message);
  view.update(dt);

  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

// handy for poking at the game from the console
window.game = { sim, view, xr, camera };
