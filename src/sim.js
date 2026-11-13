// Pure match simulation: no rendering, no DOM. Units are "pitch units"
// (the pitch is 60 x 40). Team 0 attacks +x, team 1 attacks -x.

export const HL = 30; // half length
export const HW = 20; // half width
export const GOAL_HALF = 4.5;
export const GOAL_H = 3;
export const GOAL_DEPTH = 2.5;
export const BALL_R = 0.35;

const RUN = 7.6;
const SPRINT = 10.4;
const AI_RUN = 7.2;
const AI_CHASE = 8.4;
const GK_RUN = 6.5;
const GK_DIVE = 10;
const GK_REACTION = 0.12;
const GK_REACH = 1.35;
const ACCEL = 45;
const BODY = 1.5; // minimum distance between two players
const GRAVITY = 20;

const FORMATION = [
  { role: 'GK', x: -28.4, z: 0 },
  { role: 'DL', x: -17, z: -9 },
  { role: 'DR', x: -17, z: 9 },
  { role: 'CM', x: -6, z: 0 },
  { role: 'LM', x: -1, z: -13 },
  { role: 'RM', x: -1, z: 13 },
  { role: 'ST', x: 10, z: 0 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export class Sim {
  constructor({ humans = [true, false], matchLength = 240, rng = Math.random } = {}) {
    this.humans = humans;
    this.matchLength = matchLength;
    this.rng = rng;
    this.events = [];
    this.teams = [0, 1].map((idx) => {
      const team = { idx, dir: idx === 0 ? 1 : -1, score: 0, players: [], controlled: null, human: !!humans[idx] };
      team.players = FORMATION.map((f, i) => ({
        team: idx, i, role: f.role, isGK: f.role === 'GK', base: { x: f.x, z: f.z },
        x: 0, z: 0, vx: 0, vz: 0, facing: 0,
        stun: 0, tackleCd: 0, lungeT: 0, lungeX: 0, lungeZ: 0,
        charge: 0, charging: false, aiT: 0, holdT: 0, reactT: 0,
      }));
      return team;
    });
    this.players = [...this.teams[0].players, ...this.teams[1].players];
    this.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, passTarget: null, noPickup: null, noPickupT: 0 };
    this.reset();
  }

  reset() {
    this.teams[0].score = 0;
    this.teams[1].score = 0;
    this.time = this.matchLength;
    this.kickoff(0);
    this.events.push({ type: 'whistle' });
  }

  kickoff(k) {
    const b = this.ball;
    for (const t of this.teams) {
      for (const p of t.players) {
        let x = p.base.x;
        let z = p.base.z;
        if (!p.isGK) x = Math.min(x, -2);
        if (p.role === 'ST') {
          if (t.idx === k) { x = -0.9; z = 0; } else { x = -7.5; z = 3; }
        }
        p.x = x * t.dir;
        p.z = z * t.dir;
        p.vx = p.vz = 0;
        p.facing = t.dir > 0 ? 0 : Math.PI;
        p.stun = p.tackleCd = p.lungeT = p.charge = p.holdT = 0;
        p.charging = false;
        p.aiT = 0.6;
      }
    }
    const st = this.teams[k].players.find((p) => p.role === 'ST');
    Object.assign(b, { vx: 0, vy: 0, vz: 0, y: BALL_R, owner: st, passTarget: null, noPickup: null, noPickupT: 0 });
    this._carry(st);
    for (const t of this.teams) t.controlled = t.human ? (t.idx === k ? st : this._closest(t, null)) : null;
    this.phase = 'kickoff';
    this.phaseT = 1.4;
  }

  // ---- main step -----------------------------------------------------

  step(dt, inputs = []) {
    if (this.phase === 'fulltime') {
      if (inputs.some((i) => i && (i.pass || i.start))) this.reset();
      return;
    }
    if (this.phase === 'kickoff') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'goal') {
      this.phaseT -= dt;
      this._ballPhysics(dt, true);
      for (const p of this.players) { p.vx *= Math.exp(-5 * dt); p.vz *= Math.exp(-5 * dt); p.x += p.vx * dt; p.z += p.vz * dt; }
      if (this.phaseT <= 0) this.kickoff(this.kickoffTeam);
      return;
    }

    this.time -= dt;
    if (this.time <= 0) {
      this.time = 0;
      this.phase = 'fulltime';
      this.events.push({ type: 'whistle', final: true });
      return;
    }

    const b = this.ball;
    if (b.noPickupT > 0) b.noPickupT -= dt;

    // team context
    for (const t of this.teams) {
      t.hasBall = !!b.owner && b.owner.team === t.idx;
      t.oppHas = !!b.owner && b.owner.team !== t.idx;
      const ranked = t.players
        .filter((p) => !p.isGK && p !== t.controlled)
        .sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      t.chaser = null;
      t.cover = null;
      if (!t.hasBall) {
        if (t.human) {
          if (!b.owner && ranked[0] && Math.hypot(ranked[0].x - b.x, ranked[0].z - b.z) < 7) t.chaser = ranked[0];
          t.cover = t.oppHas ? ranked[0] : null;
        } else {
          t.chaser = ranked[0];
          t.cover = t.oppHas ? ranked[1] : null;
        }
      }
    }

    // decide what every player wants to do
    for (const t of this.teams) {
      const inp = t.human ? inputs[t.idx] || {} : null;
      if (inp && inp.switch) this.switchPlayer(t);
      for (const p of t.players) {
        p.stun = Math.max(0, p.stun - dt);
        p.tackleCd = Math.max(0, p.tackleCd - dt);
        let want;
        if (p.stun > 0) want = { x: 0, z: 0 };
        else if (p === t.controlled) want = this._human(p, t, inp, dt);
        else if (p.isGK) want = this._keeper(p, t, dt);
        else want = this._ai(p, t, dt);
        this._move(p, want, dt);
      }
    }

    // keep bodies apart
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], c = ps[j];
        let dx = c.x - a.x, dz = c.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < BODY && d > 1e-4) {
          const push = (BODY - d) / 2 / d;
          dx *= push; dz *= push;
          a.x -= dx; a.z -= dz; c.x += dx; c.z += dz;
        }
      }
    }
    for (const p of ps) {
      p.x = clamp(p.x, -HL + 0.6, HL - 0.6);
      p.z = clamp(p.z, -HW + 0.6, HW - 0.6);
    }

    if (b.owner) this._carry(b.owner);
    else this._ballPhysics(dt, false);

    this._possession();
    this._checkGoal();
  }

  // ---- player control ------------------------------------------------

  switchPlayer(t) {
    const next = this._closest(t, t.controlled);
    if (next) {
      if (t.controlled) { t.controlled.charge = 0; t.controlled.charging = false; }
      t.controlled = next;
    }
  }

  _closest(t, except) {
    const b = this.ball;
    let best = null, bd = Infinity;
    for (const p of t.players) {
      if (p.isGK || p === except) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _human(p, t, inp, dt) {
    const b = this.ball;
    const owns = b.owner === p;
    let mx = inp.mx || 0, mz = inp.mz || 0;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const aimX = m > 0.2 ? mx / m : Math.cos(p.facing);
    const aimZ = m > 0.2 ? mz / m : Math.sin(p.facing);

    if (p.lungeT > 0) {
      p.lungeT -= dt;
      if (p.lungeT <= 0 && !owns) p.stun = 0.3;
      return { x: p.lungeX * 15, z: p.lungeZ * 15, boost: 4 };
    }

    if (owns) {
      if (inp.shoot) {
        p.charging = true;
        p.charge = Math.min(1, p.charge + dt / 0.8);
      } else if (p.charging) {
        this._shoot(p, t, aimX, aimZ, Math.max(0.25, p.charge));
        p.charge = 0; p.charging = false;
      }
      if (inp.pass && b.owner === p) this._humanPass(p, t, aimX, aimZ);
    } else {
      p.charge = 0; p.charging = false;
      if (inp.pass && p.tackleCd <= 0) {
        p.lungeT = 0.22; p.lungeX = aimX; p.lungeZ = aimZ;
      }
    }
    const speed = (inp.sprint ? SPRINT : RUN) * (owns ? 0.93 : 1);
    if (m > 0.2) p.facingWant = Math.atan2(mz, mx);
    return { x: mx * speed, z: mz * speed };
  }

  _ai(p, t, dt) {
    const b = this.ball;
    if (b.owner === p) return this._carrier(p, t, dt);
    if (!b.owner && b.passTarget === p) return this._goto(p, b.x + b.vx * 0.25, b.z + b.vz * 0.25, AI_CHASE);
    if (p === t.chaser) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      const lead = b.owner ? 0.15 : Math.min(0.4, d / 15);
      return this._goto(p, b.x + b.vx * lead, b.z + b.vz * lead, AI_CHASE);
    }
    if (p === t.cover) {
      const gx = -t.dir * HL;
      const dx = gx - b.x, dz = -b.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(6, d * 0.5);
      return this._goto(p, b.x + (dx / d) * k, b.z + (dz / d) * k, AI_RUN);
    }
    let x = p.base.x * t.dir + b.x * 0.5 + (t.hasBall ? 6 : -3) * t.dir;
    let z = p.base.z * t.dir;
    z += (b.z - z) * 0.25;
    return this._goto(p, clamp(x, -HL + 3, HL - 3), clamp(z, -HW + 2, HW - 2), AI_RUN * 0.9);
  }

  _carrier(p, t, dt) {
    const opp = this.teams[1 - t.idx];
    const gx = t.dir * HL;
    const dGoal = Math.hypot(gx - p.x, p.z);
    const near = this._nearest(opp.players, p.x, p.z);
    p.aiT -= dt;
    if (p.aiT <= 0) {
      p.aiT = 0.25 + this.rng() * 0.2;
      if ((dGoal < 16 && Math.abs(p.z) < 11) || (dGoal < 21 && near.d < 3)) {
        this._aiShoot(p, t);
        return { x: 0, z: 0 };
      }
      const pressured = near.d < 3.4;
      if (pressured || this.rng() < 0.12) {
        const mate = this._bestPass(p, t, pressured);
        if (mate) { this._passTo(p, t, mate); return { x: 0, z: 0 }; }
      }
    }
    let dx = gx - p.x, dz = clamp(p.z * 0.5, -5, 5) - p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (near.pl && near.d < 5.5) {
      const ox = near.pl.x - p.x, oz = near.pl.z - p.z;
      if (ox * dx + oz * dz > 0) {
        const side = dx * oz - dz * ox > 0 ? -1 : 1;
        const sx = -dz * side * 0.9, sz = dx * side * 0.9;
        dx += sx; dz += sz;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n; dz /= n;
      }
    }
    const sp = AI_RUN * 0.93;
    p.facingWant = Math.atan2(dz, dx);
    return { x: dx * sp, z: dz * sp };
  }

  _keeper(p, t, dt) {
    const b = this.ball;
    const gx = -t.dir * HL;
    const homeX = gx + t.dir * 1.6;
    if (b.owner === p) {
      p.holdT += dt;
      if (p.holdT > 0.8) {
        p.holdT = 0;
        const mate = this._bestPass(p, t, true) || this._nearest(t.players.filter((q) => !q.isGK), p.x, p.z).pl;
        this._passTo(p, t, mate);
      }
      p.facingWant = t.dir > 0 ? 0 : Math.PI;
      return this._goto(p, homeX + t.dir * 2, p.z, GK_RUN * 0.5);
    }
    p.holdT = 0;
    let tx = homeX, tz = clamp(b.z * 0.45, -GOAL_HALF + 0.5, GOAL_HALF - 0.5), speed = GK_RUN;
    const toward = b.vx * -t.dir;
    let incoming = false;
    if (!b.owner && toward > 4) {
      const tt = (homeX - b.x) / b.vx;
      if (tt > 0 && tt < 1.5) {
        const zc = b.z + b.vz * tt;
        if (Math.abs(zc) < GOAL_HALF + 2) {
          incoming = true;
          // keepers need a moment to read the shot, so corners beat them
          if (p.reactT >= GK_REACTION) { tz = clamp(zc, -GOAL_HALF, GOAL_HALF); speed = GK_DIVE; }
        }
      }
    }
    p.reactT = incoming ? p.reactT + dt : 0;
    if (incoming) {
      // handled above
    } else if (!b.owner && Math.hypot(b.x - gx, b.z) < 9 && Math.hypot(b.vx, b.vz) < 8) {
      tx = b.x; tz = b.z; speed = GK_RUN + 2;
    }
    return this._goto(p, tx, tz, speed);
  }

  _goto(p, tx, tz, speed) {
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return { x: 0, z: 0 };
    const s = Math.min(speed, d * 5) / d;
    return { x: dx * s, z: dz * s };
  }

  _move(p, want, dt) {
    const ax = want.x - p.vx, az = want.z - p.vz;
    const a = Math.hypot(ax, az);
    const maxA = ACCEL * (want.boost || 1) * dt;
    const k = a > maxA ? maxA / a : 1;
    p.vx += ax * k; p.vz += az * k;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const sp = Math.hypot(p.vx, p.vz);
    let target = p.facingWant;
    if (target === undefined || target === null) target = sp > 0.6 ? Math.atan2(p.vz, p.vx) : p.facing;
    p.facingWant = null;
    let diff = target - p.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.facing += diff * (1 - Math.exp(-14 * dt));
  }

  _nearest(list, x, z) {
    let pl = null, d = Infinity;
    for (const q of list) {
      const dd = Math.hypot(q.x - x, q.z - z);
      if (dd < d) { d = dd; pl = q; }
    }
    return { pl, d };
  }

  // ---- kicking -------------------------------------------------------

  _kick(p, vx, vy, vz, power) {
    const b = this.ball;
    const n = Math.hypot(vx, vz) || 1;
    b.owner = null;
    b.x = clamp(p.x + (vx / n) * 1.15, -HL + BALL_R, HL - BALL_R);
    b.z = clamp(p.z + (vz / n) * 1.15, -HW + BALL_R, HW - BALL_R);
    b.y = BALL_R;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.noPickup = p; b.noPickupT = 0.3;
    b.passTarget = null;
    p.facing = Math.atan2(vz, vx);
    p.charge = 0; p.charging = false;
    this.events.push({ type: 'kick', power });
  }

  _passTo(p, t, mate) {
    if (!mate) return;
    const lx = mate.x + mate.vx * 0.35, lz = mate.z + mate.vz * 0.35;
    const dx = lx - p.x, dz = lz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = clamp(0.9 * d + 9, 12, 34);
    this._kick(p, (dx / d) * speed, d > 22 ? 4 : 0, (dz / d) * speed, 0.4);
    this.ball.passTarget = mate;
    if (t.human && !mate.isGK) t.controlled = mate;
  }

  _humanPass(p, t, ax, az) {
    let best = null, bestScore = -Infinity;
    for (const m of t.players) {
      if (m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5) continue;
      const cos = (dx * ax + dz * az) / d;
      if (cos < 0.6) continue;
      const score = cos * 30 - d * 0.35 - (m.isGK ? 8 : 0);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (best) this._passTo(p, t, best);
    else this._kick(p, ax * 20, 0, az * 20, 0.4);
  }

  _bestPass(p, t, pressured) {
    const opp = this.teams[1 - t.idx];
    let best = null, bestScore = -Infinity;
    for (const m of t.players) {
      if (m === p || m.isGK) continue;
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d < 5 || d > 32) continue;
      const fwd = (m.x - p.x) * t.dir;
      if (!pressured && fwd < 6) continue;
      if (pressured && fwd < -10) continue;
      if (opp.players.some((o) => distToSegment(o.x, o.z, p.x, p.z, m.x, m.z) < 2.2)) continue;
      const score = fwd - Math.abs(d - 14) * 0.3 + this._nearest(opp.players, m.x, m.z).d * 0.8;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  _shoot(p, t, ax, az, power) {
    const b = this.ball;
    const gx = t.dir * HL;
    let dx = ax, dz = az;
    if (ax * t.dir > 0.25) {
      // aim assist: if the shot is roughly on goal, pull it inside the posts
      const tt = (gx - b.x) / ax;
      const zHit = b.z + az * tt;
      if (Math.abs(zHit) < GOAL_HALF + 5) {
        const tz = clamp(zHit, -(GOAL_HALF - 0.8), GOAL_HALF - 0.8) + (this.rng() - 0.5) * (1.2 + 2 * power);
        dx = gx - b.x; dz = tz - b.z;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n; dz /= n;
      }
    }
    const speed = 20 + 18 * power;
    this._kick(p, dx * speed, 2 + 8 * power, dz * speed, power);
  }

  _aiShoot(p, t) {
    const opp = this.teams[1 - t.idx];
    const gk = opp.players[0];
    const gx = t.dir * HL;
    const tz = (gk.z > 0 ? -1 : 1) * (GOAL_HALF - 1) + (this.rng() - 0.5) * 3.5;
    let dx = gx - p.x, dz = tz - p.z;
    const n = Math.hypot(dx, dz) || 1;
    const power = 0.55 + this.rng() * 0.4;
    const speed = 20 + 18 * power;
    this._kick(p, (dx / n) * speed, 2 + 8 * power, (dz / n) * speed, power);
  }

  // ---- ball ----------------------------------------------------------

  _carry(o) {
    const b = this.ball;
    b.x = o.x + Math.cos(o.facing) * 1.05;
    b.z = o.z + Math.sin(o.facing) * 1.05;
    b.y = BALL_R;
    b.vx = o.vx; b.vy = 0; b.vz = o.vz;
    b.z = clamp(b.z, -HW + BALL_R, HW - BALL_R);
    if (Math.abs(b.z) > GOAL_HALF - BALL_R) b.x = clamp(b.x, -HL + BALL_R, HL - BALL_R);
  }

  _ballPhysics(dt, inNet) {
    const b = this.ball;
    b.vy -= GRAVITY * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < BALL_R) {
      b.y = BALL_R;
      b.vy = b.vy < -2 ? -b.vy * 0.5 : 0;
    }
    const grounded = b.y <= BALL_R + 0.02;
    const f = Math.exp(-(inNet ? 6 : grounded ? 0.9 : 0.12) * dt);
    b.vx *= f; b.vz *= f;

    if (Math.abs(b.z) > HW - BALL_R) {
      b.z = Math.sign(b.z) * (HW - BALL_R);
      b.vz = -b.vz * 0.7;
    }
    if (Math.abs(b.x) > HL - BALL_R) {
      const inMouth = Math.abs(b.z) < GOAL_HALF && b.y < GOAL_H;
      if (inMouth || inNet) {
        const sx = Math.sign(b.x);
        if (Math.abs(b.x) > HL + GOAL_DEPTH - BALL_R) { b.x = sx * (HL + GOAL_DEPTH - BALL_R); b.vx = -b.vx * 0.2; }
        b.z = clamp(b.z, -GOAL_HALF + BALL_R, GOAL_HALF - BALL_R);
        if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy = -Math.abs(b.vy) * 0.3; }
      } else {
        b.x = Math.sign(b.x) * (HL - BALL_R);
        b.vx = -b.vx * 0.7;
      }
    }
  }

  _setOwner(p) {
    const b = this.ball;
    b.owner = p;
    b.passTarget = null;
    p.holdT = 0;
    p.aiT = 0.3;
    const t = this.teams[p.team];
    if (t.human && !p.isGK) t.controlled = p;
    const o = this.teams[1 - p.team];
    if (o.human && o.controlled) {
      const c = this._closest(o, null);
      const dc = Math.hypot(c.x - b.x, c.z - b.z);
      const dn = Math.hypot(o.controlled.x - b.x, o.controlled.z - b.z);
      if (dn > dc + 6) this.switchPlayer(o);
    }
  }

  _possession() {
    const b = this.ball;
    if (!b.owner) {
      let cand = null, cd = Infinity;
      for (const p of this.players) {
        if (p.stun > 0 || (p === b.noPickup && b.noPickupT > 0)) continue;
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < (p.isGK ? GK_REACH : 1.25) && b.y < (p.isGK ? 2.8 : 1.9) && d < cd) { cd = d; cand = p; }
      }
      if (!cand) return;
      const rel = Math.hypot(b.vx - cand.vx, b.vz - cand.vz);
      if (cand.isGK) {
        if (rel < 24 || this.rng() < 0.35) this._setOwner(cand);
        else {
          b.vx = -b.vx * 0.35; b.vz = b.vz * 0.4 + (this.rng() - 0.5) * 12; b.vy = 3;
          b.noPickup = cand; b.noPickupT = 0.4;
        }
        if (rel > 12) this.events.push({ type: 'save' });
      } else if (rel > 27) {
        b.vx *= -0.3; b.vz = b.vz * 0.4 + (this.rng() - 0.5) * 6;
        b.noPickup = cand; b.noPickupT = 0.3;
        this.events.push({ type: 'kick', power: 0.2 });
      } else this._setOwner(cand);
      return;
    }
    const o = b.owner;
    if (o.isGK) return;
    for (const q of this.teams[1 - o.team].players) {
      if (q.isGK || q.tackleCd > 0 || q.stun > 0) continue;
      if (Math.hypot(q.x - b.x, q.z - b.z) > 1.15) continue;
      const human = this.teams[q.team].human && q === this.teams[q.team].controlled;
      const chance = q.lungeT > 0 ? 0.9 : human ? 0.55 : 0.4;
      if (this.rng() < chance) {
        o.stun = 0.45; o.tackleCd = 1; o.charge = 0; o.charging = false;
        q.lungeT = 0;
        this._setOwner(q);
        this.events.push({ type: 'tackle' });
        return;
      }
      q.tackleCd = 0.7; q.stun = 0.3;
    }
  }

  _checkGoal() {
    const b = this.ball;
    if (Math.abs(b.x) <= HL + BALL_R || Math.abs(b.z) >= GOAL_HALF || b.y >= GOAL_H) return;
    const scorer = b.x > 0 ? 0 : 1;
    this.teams[scorer].score++;
    if (b.owner) { b.vx = b.owner.vx; b.vz = b.owner.vz; b.owner = null; }
    b.passTarget = null;
    this.phase = 'goal';
    this.phaseT = 2.6;
    this.kickoffTeam = 1 - scorer;
    this.events.push({ type: 'goal', team: scorer });
  }
}
