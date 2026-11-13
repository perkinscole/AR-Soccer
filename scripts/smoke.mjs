// Headless check: play AI-vs-AI matches and make sure the sim stays sane.
import { Sim, HL, HW, GOAL_DEPTH } from '../src/sim.js';

let seed = 12345;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

let totalGoals = 0;
const counts = {};
for (let match = 0; match < 5; match++) {
  const sim = new Sim({ humans: [false, false], matchLength: 240, rng });
  let steps = 0;
  while (sim.phase !== 'fulltime') {
    sim.step(1 / 60);
    for (const e of sim.events) counts[e.type] = (counts[e.type] || 0) + 1;
    sim.events.length = 0;
    const b = sim.ball;
    const nums = [b.x, b.y, b.z, b.vx, b.vy, b.vz, ...sim.players.flatMap((p) => [p.x, p.z, p.vx, p.vz, p.facing])];
    if (nums.some((n) => !Number.isFinite(n))) throw new Error(`non-finite value at step ${steps}`);
    if (Math.abs(b.x) > HL + GOAL_DEPTH + 0.01 || Math.abs(b.z) > HW + 0.01 || b.y < 0) {
      throw new Error(`ball escaped at step ${steps}: ${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}`);
    }
    if (++steps > 60 * 600) throw new Error('match never ended');
  }
  console.log(`match ${match + 1}: ${sim.teams[0].score} - ${sim.teams[1].score}`);
  totalGoals += sim.teams[0].score + sim.teams[1].score;
}
console.log('events:', counts);
if (totalGoals === 0) throw new Error('no goals in 5 matches: AI is not finishing');
console.log('smoke OK');
