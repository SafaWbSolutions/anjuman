// Runs before `next build` (npm prebuild) and writes deploy metadata.
// The client compares this stamp with the last one it saw: when a new
// deployment goes live, an already-open tab (especially on mobile,
// where tabs can stay alive for days) reloads itself once.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = `${Date.now()}`;
const out = {
  version,
  builtAt: new Date().toISOString(),
};

mkdirSync("public", { recursive: true });
writeFileSync(join("public", "version.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`version.json -> ${version} (${out.builtAt})`);
