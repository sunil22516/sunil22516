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

    const sortedEvents = [...events].sort((a, b) => a.startStep - b.startStep);

    let fillKeyTimes = [0];
    let fillValues = [base];

    for (const ev of sortedEvents) {
      const colorFamily = theme.fireworkColors[ev.colorIndex % theme.fireworkColors.length];
      const evColor = colorFamily[0];
      const tStart = ev.startStep / steps;

      if (tStart > fillKeyTimes[fillKeyTimes.length - 1] + 0.001) {
        fillKeyTimes.push(round(tStart - 0.001, 4));
        fillValues.push(fillValues[fillValues.length - 1]);
      }
      
      fillKeyTimes.push(round(tStart + 0.02, 4));
      fillValues.push(evColor);
    }
    
    fillKeyTimes.push(1);
    fillValues.push(fillValues[fillValues.length - 1]);

    const fillAnim = {
      keyTimes: fillKeyTimes.join(";"),
      values: fillValues.join(";")
    };

    rects.push(
      `<rect x="${round(cell.px)}" y="${round(cell.py)}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2.5" fill="${base}">` +
        `<animate attributeName="fill" values="${fillAnim.values}" keyTimes="${fillAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `</rect>`
    );

    events.forEach(ev => {
      const colorFamily = theme.fireworkColors[ev.colorIndex % theme.fireworkColors.length];
      const evColor = colorFamily[0];
      const startFrac = ev.startStep / steps;
      const peakFrac = (ev.startStep + (ev.endStep - ev.startStep) * 0.5) / steps;
      const endFrac = ev.endStep / steps;
      
      const rAnim = buildPulses(steps, [{startFrac, peakFrac, endFrac}], 0, 9, (v) => round(v, 2));
      const opAnim = buildPulses(steps, [{startFrac, peakFrac, endFrac}], 0, 0.45, (v) => round(v, 2));
      
      halos.push(
        `<circle cx="${round(cell.cx)}" cy="${round(cell.cy)}" r="0" fill="none" stroke="${evColor}" stroke-width="1">` +
          `<animate attributeName="r" values="${rAnim.values}" keyTimes="${rAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="${opAnim.values}" keyTimes="${opAnim.keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
          `</circle>`
      );
    });
  });

  return rects.join("") + halos.join("");
}

function rotateArray(arr, by) {
  const n = arr.length;
  const k = ((by % n) + n) % n;
  return arr.slice(k).concat(arr.slice(0, k));
}

function renderFireworks(layout, sim, theme, totalDur) {
  const { steps, fireworks } = sim;
  const keyTimes = Array.from({ length: steps }, (_, i) => round(i / (steps - 1), 4)).join(";");

  let out = "";
  for (const fw of fireworks) {
    const colorFamily = theme.fireworkColors[fw.colorIndex % theme.fireworkColors.length];
    const rocketColor = colorFamily[0];

    const launchXs = new Array(steps).fill(fw.launchPath[0].x);
    const launchYs = new Array(steps).fill(fw.launchPath[0].y);
    const launchOps = new Array(steps).fill(0);

    for (let s = 0; s < steps; s++) {
      if (s >= fw.startStep && s <= fw.explodeStep) {
        const p = fw.launchPath[s - fw.startStep];
        launchXs[s] = p.x;
        launchYs[s] = p.y;
        launchOps[s] = 1;
      } else if (s > fw.explodeStep) {
        const p = fw.launchPath[fw.launchPath.length - 1];
        launchXs[s] = p.x;
        launchYs[s] = p.y;
        launchOps[s] = 0;
      }
    }

    out += `<circle r="1.5" fill="${rocketColor}" filter="url(#glow)">` +
      `<animate attributeName="cx" values="${launchXs.map(v => round(v)).join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cy" values="${launchYs.map(v => round(v)).join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="${launchOps.join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
      `</circle>`;

    for (let i = 0; i < fw.sparks.length; i++) {
      const sparkPath = fw.sparks[i];
      const sparkColor = colorFamily[i % colorFamily.length];

      const sparkXs = new Array(steps).fill(sparkPath[0].x);
      const sparkYs = new Array(steps).fill(sparkPath[0].y);
      const sparkOps = new Array(steps).fill(0);

      for (let s = 0; s < steps; s++) {
        if (s >= fw.explodeStep && s <= fw.endStep) {
          const p = sparkPath[s - fw.explodeStep];
          sparkXs[s] = p.x;
          sparkYs[s] = p.y;
          const t = (s - fw.explodeStep) / (fw.endStep - fw.explodeStep);
          sparkOps[s] = 1 - t;
        } else if (s > fw.endStep) {
          const p = sparkPath[sparkPath.length - 1];
          sparkXs[s] = p.x;
          sparkYs[s] = p.y;
          sparkOps[s] = 0;
        }
      }

      out += `<circle r="3" fill="${sparkColor}">` +
        `<animate attributeName="cx" values="${sparkXs.map(v => round(v)).join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${sparkYs.map(v => round(v)).join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${sparkOps.map(v => round(v, 2)).join(";")}" keyTimes="${keyTimes}" dur="${totalDur}s" repeatCount="indefinite"/>` +
        `</circle>`;
    }
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
  const fireworks = renderFireworks(layout, sim, theme, totalDur);

  const caption = config.caption !== false
    ? `<text x="${layout.width - 8}" y="${layout.height - 10}" text-anchor="end" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="9" fill="${theme.caption}">@${username} \u00b7 ${totalContributions} contributions \u00b7 fireworks</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}${background}${stars}${grid}${fireworks}${caption}</svg>`;
}

