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

export function runSimulation(layout, opts = {}) {
  const {
    fireworkCount = 52, // number of fireworks
    steps = 200,
    seed = 1,
  } = opts;

  const rand = mulberry32(seed);
  const activeCells = layout.cells.filter((c) => c.level > 0);
  const weightedCells = activeCells.flatMap((c) => Array(c.level).fill(c));

  if (weightedCells.length === 0) {
    weightedCells.push(...layout.cells);
  }

  const fireworks = [];
  const landEvents = [];

  for (let i = 0; i < fireworkCount; i++) {
    const targetCell = weightedCells[Math.floor(rand() * weightedCells.length)];
    const cellIndex = layout.cells.indexOf(targetCell);

    const startStep = Math.floor(rand() * (steps - 40)); 
    const launchSteps = 12 + Math.floor(rand() * 8);
    const explodeStep = startStep + launchSteps;
    const explodeSteps = 20 + Math.floor(rand() * 10);
    const endStep = Math.min(steps - 1, explodeStep + explodeSteps);

    const startX = targetCell.cx + (rand() - 0.5) * 40;
    const startY = layout.height + 10;
    const targetX = targetCell.cx;
    const targetY = targetCell.cy;

    const launchPath = [];
    for (let s = startStep; s <= explodeStep; s++) {
      const t = (s - startStep) / launchSteps;
      const y = startY + (targetY - startY) * (1 - Math.pow(1 - t, 2));
      const x = startX + (targetX - startX) * t;
      launchPath.push({ step: s, x, y });
    }

    const colorIndex = Math.floor(rand() * 100);

    const sparkCount = 40 + Math.floor(rand() * 32); // 400% intensity
    const sparks = [];
    for (let sp = 0; sp < sparkCount; sp++) {
      const angle = rand() * Math.PI * 2;
      const speed = 2.0 + rand() * 4.5; // increased speed by 130%
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      const gravity = 0.08;
      const drag = 0.94;

      const sparkPath = [];
      let sx = targetX;
      let sy = targetY;
      for (let s = explodeStep; s <= endStep; s++) {
        sparkPath.push({ step: s, x: sx, y: sy });
        sx += vx;
        sy += vy;
        vy += gravity;
        vx *= drag;
        vy *= drag;
      }
      sparks.push(sparkPath);
    }

    fireworks.push({
      startStep,
      explodeStep,
      endStep,
      launchPath,
      sparks,
      colorIndex,
    });

    landEvents.push({
      cellIndex,
      startStep: explodeStep,
      endStep: Math.min(steps - 1, explodeStep + 15),
      particleId: i,
      colorIndex,
    });
  }

  return { fireworks, landEvents, steps, particleCount: fireworkCount };
}
