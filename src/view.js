import * as THREE from 'three';
import { HL, HW, GOAL_HALF, GOAL_H, GOAL_DEPTH, BALL_R } from './sim.js';

export const TABLE_SCALE = 0.02; // 60-unit pitch -> 1.2 m table
export const TABLE_HEIGHT = 0.75;

const TEAM_COLORS = [0xe5483a, 0x2f74e6];
const GK_COLORS = [0xf2c230, 0x35c26b];

function pitchTexture() {
  const S = 24; // px per unit
  const c = document.createElement('canvas');
  c.width = HL * 2 * S;
  c.height = HW * 2 * S;
  const g = c.getContext('2d');
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#2f8f3e' : '#37a047';
    g.fillRect(i * 6 * S, 0, 6 * S, c.height);
  }
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.28 * S;
  const X = (x) => (x + HL) * S;
  const Z = (z) => (z + HW) * S;
  const m = 0.14;
  g.strokeRect(X(-HL + m), Z(-HW + m), (HL - m) * 2 * S, (HW - m) * 2 * S);
  g.beginPath(); g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 6 * S, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(X(0), Z(0), 0.35 * S, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    const boxX = s < 0 ? X(-HL + m) : X(HL - m - 10);
    g.strokeRect(boxX, Z(-11), 10 * S, 22 * S);
    const sixX = s < 0 ? X(-HL + m) : X(HL - m - 4);
    g.strokeRect(sixX, Z(-6.5), 4 * S, 13 * S);
    g.beginPath(); g.arc(X(s * (HL - 7.5)), Z(0), 0.3 * S, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.arc(X(s * (HL - 7.5)), Z(0), 5 * S, s < 0 ? -0.93 : Math.PI - 0.93, s < 0 ? 0.93 : Math.PI + 0.93);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildGoal(side, net) {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const post = new THREE.CylinderGeometry(0.16, 0.16, GOAL_H, 10);
  for (const z of [-GOAL_HALF, GOAL_HALF]) {
    const p = new THREE.Mesh(post, white);
    p.position.set(0, GOAL_H / 2, z);
    g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, GOAL_HALF * 2 + 0.32, 10), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.y = GOAL_H;
  g.add(bar);
  const mk = (w, h, rx, ry, x, y, z) => {
    const tex = net.clone();
    tex.repeat.set(w / 0.6, h / 0.6);
    tex.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.set(rx, ry, 0);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  mk(GOAL_HALF * 2, GOAL_H, 0, Math.PI / 2, GOAL_DEPTH, GOAL_H / 2, 0); // back
  mk(GOAL_DEPTH, GOAL_H, 0, 0, GOAL_DEPTH / 2, GOAL_H / 2, -GOAL_HALF);
  mk(GOAL_DEPTH, GOAL_H, 0, 0, GOAL_DEPTH / 2, GOAL_H / 2, GOAL_HALF);
  mk(GOAL_DEPTH, GOAL_HALF * 2, Math.PI / 2, 0, GOAL_DEPTH / 2, GOAL_H, 0); // roof
  g.position.x = side * HL;
  if (side < 0) g.rotation.y = Math.PI;
  return g;
}

function buildFigure(team, isGK) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = new THREE.MeshLambertMaterial({ color: isGK ? GK_COLORS[team] : TEAM_COLORS[team] });
  const dark = new THREE.MeshLambertMaterial({ color: team === 0 ? 0xffffff : 0x14213d });
  const skin = new THREE.MeshLambertMaterial({ color: [0xf1c9a5, 0xc68e63, 0x8d5a3b][Math.floor(Math.random() * 3)] });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.86, 0.14, 20), shirt);
  base.position.y = 0.07;
  root.add(base);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.75, 12), dark);
  legs.position.y = 0.5;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.55, 4, 12), shirt);
  torso.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), skin);
  head.position.y = 2.2;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  visor.position.set(0.3, 2.25, 0); // shows which way the figure faces
  body.add(legs, torso, head, visor);
  root.userData.body = body;
  return root;
}

export class View {
  constructor(scene, sim) {
    this.sim = sim;
    this.table = new THREE.Group();
    this.table.position.set(0, TABLE_HEIGHT, 0);
    this.table.scale.setScalar(TABLE_SCALE);
    scene.add(this.table);

    // pitch + apron
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(HL * 2 + 8, 1.2, HW * 2 + 6),
      new THREE.MeshLambertMaterial({ color: 0x1d5a2a }),
    );
    apron.position.y = -0.62;
    this.table.add(apron);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(HL * 2, HW * 2),
      new THREE.MeshLambertMaterial({ map: pitchTexture() }),
    );
    pitch.rotation.x = -Math.PI / 2;
    this.table.add(pitch);

    // boards (the ball bounces off them; there are no throw-ins)
    const boardMat = new THREE.MeshLambertMaterial({ color: 0xf2f4f7 });
    const board = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), boardMat);
      b.position.set(x, 0.5, z);
      this.table.add(b);
    };
    board(HL * 2 + 1, 0.5, 0, -HW - 0.25);
    board(HL * 2 + 1, 0.5, 0, HW + 0.25);
    const endLen = HW - GOAL_HALF;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) board(0.5, endLen, sx * (HL + 0.25), sz * (GOAL_HALF + endLen / 2));

    const net = netTexture();
    this.table.add(buildGoal(1, net), buildGoal(-1, net));

    // players
    const blob = blobTexture();
    const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
    this.figures = sim.players.map((p) => {
      const f = buildFigure(p.team, p.isGK);
      this.table.add(f);
      return f;
    });

    // ball + its shadow (the shadow is what makes height readable)
    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(BALL_R * 1.25, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    );
    this.table.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.03;
    this.table.add(this.ballShadow);

    // controlled-player marker
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.28, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 3.4;
    this.marker.add(ring, arrow);
    this.arrow = arrow;
    this.table.add(this.marker);

    this.power = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff7a1a, depthTest: false }));
    this.power.center.set(0, 0.5);
    this.power.visible = false;
    this.table.add(this.power);

    // floating scoreboard
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = 1024;
    this.boardCanvas.height = 256;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boardTex, transparent: true, depthTest: false }));
    this.board.scale.set(24, 6, 1);
    this.board.position.set(0, 14, -HW * 0.2);
    this.board.renderOrder = 10;
    this.table.add(this.board);
    this.boardKey = '';
    this.t = 0;
  }

  drawBoard(message) {
    const s = this.sim;
    const secs = Math.ceil(s.time);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const key = `${s.teams[0].score}|${s.teams[1].score}|${clock}|${message}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const g = this.boardCanvas.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(12,16,24,0.82)';
    g.beginPath();
    g.roundRect(112, 8, 800, 150, 28);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 54px system-ui, sans-serif';
    g.fillStyle = '#ff6a5c';
    g.fillText('RED', 230, 84);
    g.fillStyle = '#6aa5ff';
    g.fillText('BLUE', 794, 84);
    g.fillStyle = '#fff';
    g.font = '800 100px system-ui, sans-serif';
    g.fillText(`${s.teams[0].score} – ${s.teams[1].score}`, 512, 70);
    g.font = '600 34px system-ui, sans-serif';
    g.fillStyle = '#c9d2e0';
    g.fillText(clock, 512, 134);
    if (message) {
      g.font = '800 58px system-ui, sans-serif';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(message, 512, 212);
      g.fillStyle = '#ffe14a';
      g.fillText(message, 512, 212);
    }
    this.boardTex.needsUpdate = true;
  }

  update(dt) {
    const s = this.sim;
    this.t += dt;
    s.players.forEach((p, i) => {
      const f = this.figures[i];
      const sp = Math.hypot(p.vx, p.vz);
      f.position.set(p.x, 0, p.z);
      f.rotation.y = -p.facing;
      const body = f.userData.body;
      body.position.y = Math.abs(Math.sin(this.t * 14 + i)) * Math.min(0.22, sp * 0.03);
      body.rotation.z = -Math.min(0.3, sp * 0.028) - (p.stun > 0 ? 0.5 : 0);
    });
    const b = s.ball;
    this.ball.position.set(b.x, b.y + BALL_R * 0.25, b.z);
    const roll = Math.hypot(b.vx, b.vz) * dt * 2;
    this.ball.rotation.z -= roll;
    this.ball.rotation.x += roll * 0.4;
    this.ballShadow.position.x = b.x;
    this.ballShadow.position.z = b.z;
    this.ballShadow.scale.setScalar(1 + b.y * 0.35);

    const c = s.teams.find((t) => t.human && t.controlled)?.controlled;
    this.marker.visible = !!c;
    if (c) {
      this.marker.position.set(c.x, 0, c.z);
      this.arrow.position.y = 3.4 + Math.sin(this.t * 6) * 0.15;
      this.power.visible = c.charge > 0;
      if (c.charge > 0) {
        this.power.position.set(c.x, 4.3, c.z);
        this.power.scale.set(0.2 + c.charge * 3, 0.35, 1);
        this.power.material.color.setHSL(0.14 - c.charge * 0.14, 1, 0.55);
      }
    } else this.power.visible = false;
  }
}

export function buildRoom() {
  // Everything that should disappear in AR passthrough.
  const room = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.2), wood);
  top.position.y = TABLE_HEIGHT - 0.05;
  room.add(top);
  for (const x of [-0.75, 0.75]) for (const z of [-0.5, 0.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, TABLE_HEIGHT - 0.07, 0.07), wood);
    leg.position.set(x, (TABLE_HEIGHT - 0.07) / 2, z);
    room.add(leg);
  }
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#3a4354');
  grad.addColorStop(1, '#141a24');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshBasicMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  return room;
}
