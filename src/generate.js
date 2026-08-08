import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getContributions } from "./fetchContributions.js";
import { computeLayout } from "./layout.js";
import { runSimulation, seedFromString } from "./boids.js";
import { renderSvg } from "./renderSvg.js";
import { themes } from "./theme.js";

function parseArgs(argv) {
  const args = { out: "dist", particles: 14, steps: 200, stepDuration: 0.16, tails: true, caption: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [key, inlineVal] = a.slice(2).split("=");
    const val = inlineVal ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
    args[key] = val;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.user || process.env.GITHUB_REPOSITORY_OWNER || process.env.USER;
  if (!username) {
    console.error("Usage: node src/generate.js --user <github-username> [--token <gh-token>] [options]");
    process.exit(1);
  }

  const token = args.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  const outDir = args.out;
  const particleCount = Number(args.particles);
  const steps = Number(args.steps);
  const stepDuration = Number(args.stepDuration);
  const tails = args.tails !== "false";
  const caption = args.caption !== "false";
  const seed = args.seed ? Number(args.seed) : seedFromString(username);

  console.log(`Fetching contributions for @${username}${token ? " (authenticated)" : " (public API, no token)"}...`);
  const { cells, weekCount } = await getContributions(username, token);
  const totalContributions = cells.reduce((sum, c) => sum + c.count, 0);

  console.log(`Got ${cells.length} days across ${weekCount} weeks, ${totalContributions} total contributions.`);
  const layout = computeLayout(cells, weekCount);

  console.log(`Running boids simulation: ${particleCount} fireflies x ${steps} steps (seed ${seed})...`);
  const sim = runSimulation(layout, { particleCount, steps, seed });
  console.log(`${sim.landEvents.length} landing events baked into the animation.`);

  const config = { stepDuration, tails, caption, seed };

  await mkdir(outDir, { recursive: true });
  for (const themeName of Object.keys(themes)) {
    const svg = renderSvg({ layout, sim, theme: themes[themeName], username, totalContributions, config });
    const filePath = path.join(outDir, `firefly-${themeName}.svg`);
    await writeFile(filePath, svg, "utf8");
    console.log(`Wrote ${filePath} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
