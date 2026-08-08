// A small, dependency-free boids simulation. Every particle is in one of
// four modes:
//   fly   - normal separation/alignment/cohesion + gentle wander
//   seek  - flocking (softened) + a strong pull toward a chosen cell
//   land  - hovering just above the cell with a light jitter, "glowing"
//   leave - a short outward puff before rejoining the flock
//
// Positions are baked out frame-by-frame so the renderer can turn them into
// plain SMIL <animate> keyframes -- no runtime JS is needed in the SVG.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function vec(x = 0, y = 0) {
  return { x, y };
}
function add(a, b) {
  return vec(a.x + b.x, a.y + b.y);
}
function sub(a, b) {
  return vec(a.x - b.x, a.y - b.y);
}
function scale(a, s) {
  return vec(a.x * s, a.y * s);
}
function len(a) {
  return Math.hypot(a.x, a.y);
}
function limit(a, max) {
  const l = len(a);
  return l > max ? scale(a, max / l) : a;
}

export function runSimulation(layout, opts = {}) {
  const {
    particleCount = 14,
    steps = 200,
    seed = 1,
    maxSpeed = 2.1,
    maxForce = 0.14,
    perception = 34,
    separationRadius = 14,
    landDuration = 10,
    leaveDuration = 6,
    seekChance = 0.03, // per-particle, per-step chance of starting a new landing while flying
    seekTimeout = 90, // give up cleanly (no teleporting) if a seek drags on this long
    maxConcurrentSeekers = Math.max(3, Math.round(particleCount / 2)),
  } = opts;

  const rand = mulberry32(seed);
  const activeCells = layout.cells.filter((c) => c.level > 0);
  // weight selection toward more-active days so brighter days light up more often
  const weightedCells = activeCells.flatMap((c) => Array(c.level).fill(c));

  if (weightedCells.length === 0) {
    weightedCells.push(...layout.cells); // no contributions at all -- land anywhere, still pretty
  }

  const bounds = {
    minX: 4,
    maxX: layout.width - 4,
    minY: 4,
    maxY: layout.height - 4,
  };

  const particles = Array.from({ length: particleCount }, (_, i) => ({
    id: i,
    pos: vec(bounds.minX + rand() * (bounds.maxX - bounds.minX), bounds.minY + rand() * (bounds.maxY - bounds.minY)),
    vel: vec((rand() - 0.5) * maxSpeed, (rand() - 0.5) * maxSpeed),
    mode: "fly",
    timer: 0,
    targetCell: null,
    wanderAngle: rand() * Math.PI * 2,
  }));

  const positions = particles.map(() => []);
  const landEvents = []; // { cellIndex, startStep, endStep, particleId }
  const usedCellDates = new Set();

  function pickTarget() {
    // Prefer a cell nobody is currently sitting on, so the light spreads out
      for (let tries = 0; tries < 6; tries++) {
        const c = weightedCells[Math.floor(rand() * weightedCells.length)];
        if (!usedCellDates.has(c.date)) return c;
      }
    return weightedCells[Math.floor(rand() * weightedCells.length)];
  }

  for (let step = 0; step < steps; step++) {
    const seekingCount = particles.filter((p) => p.mode === "seek" || p.mode === "land").length;

    for (const p of particles) {
      // --- flocking forces (skipped/softened while landed) ---
      let sep = vec(),
        ali = vec(),
        coh = vec();
      let sepCount = 0,
        aliCount = 0,
        cohCount = 0;
      // while beelining for a cell, flocking pull is softened so the swarm
      // doesn't drag the seeker back toward the group
      const flockWeight = p.mode === "seek" ? 0.25 : 1;

      if (p.mode !== "land") {
        for (const o of particles) {
          if (o === p) continue;
          const d = len(sub(p.pos, o.pos));
          if (d < separationRadius && d > 0) {
            sep = add(sep, scale(sub(p.pos, o.pos), 1 / d));
            sepCount++;
          }
          if (d < perception) {
            ali = add(ali, o.vel);
            aliCount++;
            coh = add(coh, o.pos);
            cohCount++;
          }
        }
      }

      let steer = vec();
      if (sepCount > 0) steer = add(steer, scale(limit(scale(sep, 1 / sepCount), maxForce), 1.6 * flockWeight));
      if (aliCount > 0) {
        const desired = limit(scale(ali, 1 / aliCount), maxSpeed);
        steer = add(steer, scale(limit(sub(desired, p.vel), maxForce), 1.0 * flockWeight));
      }
      if (cohCount > 0) {
        const center = scale(coh, 1 / cohCount);
        const desired = limit(sub(center, p.pos), maxSpeed);
        steer = add(steer, scale(limit(sub(desired, p.vel), maxForce), 0.9 * flockWeight));
      }

      // gentle wander so flight paths feel organic, not perfectly averaged
      p.wanderAngle += (rand() - 0.5) * 0.5;
      steer = add(steer, vec(Math.cos(p.wanderAngle) * maxForce * 0.5, Math.sin(p.wanderAngle) * maxForce * 0.5));

      // soft bounds: steer back inward near the edges instead of hard clamping
      const margin = 24;
      if (p.pos.x < bounds.minX + margin) steer = add(steer, vec(maxForce * 1.5, 0));
      if (p.pos.x > bounds.maxX - margin) steer = add(steer, vec(-maxForce * 1.5, 0));
      if (p.pos.y < bounds.minY + margin) steer = add(steer, vec(0, maxForce * 1.5));
      if (p.pos.y > bounds.maxY - margin) steer = add(steer, vec(0, -maxForce * 1.5));

      // --- mode-specific behavior ---
      if (p.mode === "fly") {
        if (seekingCount < maxConcurrentSeekers && rand() < seekChance) {
          p.targetCell = pickTarget();
          usedCellDates.add(p.targetCell.date);
          p.mode = "seek";
          p.seekTimer = 0;
        }
      } else if (p.mode === "seek") {
        const target = vec(p.targetCell.cx, p.targetCell.cy);
        const toTarget = sub(target, p.pos);
        const desired = limit(toTarget, maxSpeed);
        steer = add(steer, scale(limit(sub(desired, p.vel), maxForce), 3.2));

        p.seekTimer++;
        const d = len(toTarget);
        if (d < 6) {
          p.mode = "land";
          p.timer = landDuration;
          p.vel = vec(0, 0);
          const cellIndex = layout.cells.indexOf(p.targetCell);
          landEvents.push({ cellIndex, startStep: step, endStep: step + landDuration, particleId: p.id });
        } else if (p.seekTimer > seekTimeout) {
          // taking too long (flock drag, edge bouncing, bad luck) -- give up
          // cleanly and rejoin the flock rather than teleporting to the cell
          usedCellDates.delete(p.targetCell.date);
          p.targetCell = null;
          p.mode = "fly";
        }
      } else if (p.mode === "land") {
        // tiny hover jitter right above the cell
        const target = vec(p.targetCell.cx, p.targetCell.cy - 2);
        p.pos = add(scale(p.pos, 0.7), scale(target, 0.3));
        p.pos.x += (rand() - 0.5) * 0.4;
        p.pos.y += (rand() - 0.5) * 0.4;
        p.timer--;
        if (p.timer <= 0) {
          p.mode = "leave";
          p.timer = leaveDuration;
          const away = Math.atan2(p.pos.y - layout.height / 2, p.pos.x - layout.width / 2);
          p.vel = vec(Math.cos(away) * maxSpeed, Math.sin(away) * maxSpeed);
        }
        positions[p.id].push({ x: p.pos.x, y: p.pos.y });
        continue; // skip the generic integration step below
      } else if (p.mode === "leave") {
        p.timer--;
        if (p.timer <= 0) {
          usedCellDates.delete(p.targetCell.date);
          p.targetCell = null;
          p.mode = "fly";
        }
      }

      p.vel = limit(add(p.vel, steer), maxSpeed);
      p.pos = add(p.pos, p.vel);
      p.pos.x = Math.min(bounds.maxX, Math.max(bounds.minX, p.pos.x));
      p.pos.y = Math.min(bounds.maxY, Math.max(bounds.minY, p.pos.y));

      positions[p.id].push({ x: p.pos.x, y: p.pos.y });
    }
  }

  return { positions, landEvents, steps, particleCount };
}
