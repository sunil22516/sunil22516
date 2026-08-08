import { CELL_SIZE } from "./layout.js";

function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function seededRandom(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a strictly-increasing keyTimes/values pair that stays at `base`
// except for brief spikes to `peak` around each pulse window. Used for both
// the cell "lighting up" flash and the halo ring radius/opacity.
function buildPulses(steps, pulses, base, peak, fmt = (v) => v) {
  const points = [[0, base]];
  const eps = 1 / (steps * 4);

  const sorted = [...pulses].sort((a, b) => a.startFrac - b.startFrac);
  for (const p of sorted) {
    let { startFrac, peakFrac, endFrac } = p;
    const last = points[points.length - 1][0];
    startFrac = Math.max(startFrac, last + eps);
    peakFrac = Math.max(peakFrac, startFrac + eps);
    endFrac = Math.max(endFrac, peakFrac + eps);
    if (startFrac >= 1) break;
    points.push([Math.min(startFrac, 0.999), base]);
    points.push([Math.min(peakFrac, 0.9995), peak]);
    points.push([Math.min(endFrac, 0.9998), base]);
  }
  points.push([1, base]);

  // de-dupe / enforce strictly increasing times
  const clean = [];
  for (const [t, v] of points) {
    if (clean.length && t <= clean[clean.length - 1][0]) continue;
    clean.push([t, v]);
  }

  return {
    keyTimes: clean.map(([t]) => round(t, 4)).join(";"),
    values: clean.map(([, v]) => fmt(v)).join(";"),
  };
}

function renderStars(width, height, layout, theme, rand, count = 50) {
  const stars = [];
  let guard = 0;
  while (stars.length < count && guard < count * 20) {
    guard++;
    const x = rand() * width;
    const y = rand() * height;
    const insideGrid =
      x > layout.gridLeft - 6 && x < layout.gridRight + 6 && y > layout.gridTop - 6 && y < layout.gridBottom + 6;
    if (insideGrid) continue;
    const r = round(0.4 + rand() * 0.9, 2);
    const dur = round(2 + rand() * 3, 2);
    const delay = round(rand() * 3, 2);
    const baseOpacity = round(0.25 + rand() * 0.5, 2);
    stars.push(
      `<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${theme.star}" opacity="${baseOpacity}">` +
        `<animate attributeName="opacity" values="${baseOpacity};${round(baseOpacity * 0.25, 2)};${baseOpacity}" ` +
        `dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/></circle>`
    );
  }
  return stars.join("");
}

function renderGrid(layout, theme, sim, totalDur, steps) {
  const eventsByCell = new Map();
  for (const ev of sim.landEvents) {
    if (!eventsByCell.has(ev.cellIndex)) eventsByCell.set(ev.cellIndex, []);
    eventsByCell.get(ev.cellIndex).push(ev);
  }

  const rects = [];
  const halos = [];

  layout.cells.forEach((cell, i) => {
    const base = theme.cellLevels[cell.level] || theme.cellLevels[0];
    const events = eventsByCell.get(i);

    if (!events || events.length === 0) {
      rects.push(
        `<rect x="${round(cell.px)}" y="${round(cell.py)}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2.5" fill="${base}"/>`
      );
      return;
    }

    const pulses = events.map((ev) => ({
      startFrac: ev.startStep / steps,
      peakFrac: (ev.startStep + (ev.endStep - ev.startStep) * 0.5) / steps,
      endFrac: ev.endStep / steps,
    }));

    const fillAnim = buildPulses(steps, pulses, base, theme.cellLit);
    rects.push(
      `<rect x="${round(cell.px)}" y="${round(cell.py)}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2.5" fill="${base}">` +
        `<animate attributeName="fill" values="${fillAnim.values}" keyTimes="${fillAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `</rect>`
    );

    const rAnim = buildPulses(steps, pulses, 0, 9, (v) => round(v, 2));
    const opAnim = buildPulses(steps, pulses, 0, 0.45, (v) => round(v, 2));
    halos.push(
      `<circle cx="${round(cell.cx)}" cy="${round(cell.cy)}" r="0" fill="none" stroke="${theme.cellLit}" stroke-width="1">` +
        `<animate attributeName="r" values="${rAnim.values}" keyTimes="${rAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${opAnim.values}" keyTimes="${opAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `</circle>`
    );
  });

  return rects.join("") + halos.join("");
}

function rotateArray(arr, by) {
  const n = arr.length;
  const k = ((by % n) + n) % n;
  return arr.slice(k).concat(arr.slice(0, k));
}

function renderFireflies(layout, sim, theme, totalDur, opts) {
  const { steps } = sim;
  const keyTimes = Array.from({ length: steps }, (_, i) => round(i / (steps - 1), 4)).join(";");
  const tailLagSteps = Math.max(2, Math.round(steps * 0.03));

  let out = "";
  for (let p = 0; p < sim.particleCount; p++) {
    const pos = sim.positions[p];
    const xs = pos.map((v) => round(v.x)).join(";");
    const ys = pos.map((v) => round(v.y)).join(";");
    const color = theme.fireflyCore[p % theme.fireflyCore.length];

    if (opts.tails) {
      const tailPos = rotateArray(pos, -tailLagSteps);
      const txs = tailPos.map((v) => round(v.x)).join(";");
      const tys = tailPos.map((v) => round(v.y)).join(";");
      out +=
        `<circle cx="${round(tailPos[0].x)}" cy="${round(tailPos[0].y)}" r="1.1" fill="${color}" opacity="0.28" filter="url(#glow)">` +
        `<animate attributeName="cx" values="${txs}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${tys}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `</circle>`;
    }

    out +=
      `<circle cx="${round(pos[0].x)}" cy="${round(pos[0].y)}" r="1.6" fill="${color}" filter="url(#glow)">` +
      `<animate attributeName="cx" values="${xs}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cy" values="${ys}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="1;0.55;1" dur="${round(1.4 + (p % 5) * 0.3, 2)}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return out;
}

export function renderSvg({ layout, sim, theme, username, totalContributions, config }) {
  const { width, height } = layout;
  const totalDur = round(sim.steps * config.stepDuration, 2);
  const rand = seededRandom(config.seed + 777);

  const defs = `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.skyTop}"/>
        <stop offset="100%" stop-color="${theme.skyBottom}"/>
      </linearGradient>
      <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="1.6" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>`;

  const background = `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#sky)"/>`;
  const stars = renderStars(width, height, layout, theme, rand);
  const grid = renderGrid(layout, theme, sim, totalDur, sim.steps);
  const fireflies = renderFireflies(layout, sim, theme, totalDur, { tails: config.tails });

  const caption = config.caption !== false
    ? `<text x="${layout.width - 8}" y="${layout.height - 10}" text-anchor="end" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="9" fill="${theme.caption}">@${username} \u00b7 ${totalContributions} contributions \u00b7 fireflies</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}${background}${stars}${grid}${fireflies}${caption}</svg>`;
}
