// No raw colours in component CSS (v3 D1, #71; DESIGN.md "The No Raw Hex
// Rule"). Every colour comes from styles/tokens.css. Files that still had
// raw hex when the rule started are listed in tests/raw-hex-allowlist.json
// with how many they may keep; D2–D6 bring those counts to zero. A count
// may only go down: when you remove some, lower (or delete) the entry.
// Run: node tests/no-raw-hex.mjs (part of `npm run lint`).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const allow = JSON.parse(readFileSync(join(root, "tests/raw-hex-allowlist.json"), "utf8"));
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const SKIP = new Set(["node_modules", ".vinext", "dist", ".wrangler", "tests"]);

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* cssFiles(path);
    else if (name.endsWith(".css")) yield path;
  }
}

const problems = [];
const lower = [];
for (const path of cssFiles(root)) {
  const file = relative(root, path);
  if (file === "styles/tokens.css") continue;
  // Comments may mention a colour (e.g. a contrast note); only code counts.
  const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const found = code.match(HEX) ?? [];
  const allowed = allow[file] ?? 0;
  if (found.length > allowed)
    problems.push(`${file}: ${found.length} raw colour(s), allowed ${allowed} (${found.join(" ")}). Use a token from styles/tokens.css.`);
  else if (found.length < allowed) lower.push(`${file}: ${found.length} now, allowlist says ${allowed}`);
}
for (const file of Object.keys(allow)) {
  try {
    statSync(join(root, file));
  } catch {
    lower.push(`${file}: no longer exists`);
  }
}
if (lower.length) problems.push(...lower.map((l) => `${l}. Lower its entry in tests/raw-hex-allowlist.json.`));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("no-raw-hex: ok");
