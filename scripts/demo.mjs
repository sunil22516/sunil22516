// Generates dist/firefly-{dark,light}.svg from made-up contribution data,
// so you can see the effect immediately without hitting the GitHub API.
//
// Usage: node scripts/demo.mjs [--username name] [--out dist]

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeLayout } from "../src/layout.js";
import { runSimulation, seedFromString } from "../src/boids.js";
import { renderSvg } from "../src/renderSvg.js";
import { themes } from "../src/theme.js";

function parseArgs(argv) {
  const args = { username: "demo-user", out: "dist" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username") args.username = argv[++i];
    if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function makeFakeContributions(seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const weekCount = 53;
  const cells = [];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - weekCount * 7);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // snap to Sunday

  for (let x = 0; x < weekCount; x++) {
    for (let y = 0; y < 7; y++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + x * 7 + y);
      const skip = rnd() < 0.35;
      const count = skip ? 0 : Math.floor(rnd() * 12);
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 9 ? 3 : 4;
      cells.push({ x, y, date: d.toISOString().slice(0, 10), count, level });
    }
  }
  return { cells, weekCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = seedFromString(args.username);
  const { cells, weekCount } = makeFakeContributions(seed);
  const totalContributions = cells.reduce((sum, c) => sum + c.count, 0);

  const layout = computeLayout(cells, weekCount);
  const sim = runSimulation(layout, { particleCount: 14, steps: 200, seed });
  const config = { stepDuration: 0.16, tails: true, caption: true, seed };

  await mkdir(args.out, { recursive: true });
  for (const themeName of Object.keys(themes)) {
    const svg = renderSvg({ layout, sim, theme: themes[themeName], username: args.username, totalContributions, config });
    const filePath = path.join(args.out, `firefly-${themeName}.svg`);
    await writeFile(filePath, svg, "utf8");
    console.log(`Wrote ${filePath} (${(svg.length / 1024).toFixed(1)} KB, ${sim.landEvents.length} landing events)`);
  }
}

main();
