// No raw colours in CSS outside styles/tokens.css (v3 D1 #71, D6 #76;
// DESIGN.md "The No Raw Hex Rule"). Every colour comes from a token. Catches
// #hex, rgb()/rgba(), hsl()/hsla() and named colours (white, black, …);
// transparent, currentColor and inherit are fine.
// Run: node tests/no-raw-hex.mjs (part of `npm run lint`).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", ".vinext", "dist", ".wrangler", "tests"]);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTION = /\b(?:rgba?|hsla?)\s*\(/gi;
// CSS Color 4 named colours (https://www.w3.org/TR/css-color-4/#named-colors).
const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
  crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
  darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
  dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
  gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen`.split(/\s+/),
);

function* cssFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* cssFiles(path);
    else if (name.endsWith(".css")) yield path;
  }
}

/** Raw colours in one stylesheet's declaration values (not selectors, comments or var() names). */
export function rawColours(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [];
  // property: value; — the value up to ; or }. Skips custom-property names
  // and keeps strings out (content: "white").
  for (const [, value] of code.matchAll(/(?:^|[{;\s])[-a-zA-Z]+\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const v = value.replace(/"[^"]*"|'[^']*'/g, "").replace(/var\(\s*--[-\w]+/g, "var(");
    found.push(
      ...(v.match(HEX) ?? []),
      ...(v.match(FUNCTION) ?? []).map((f) => f.replace(/\s*\($/, "()")),
    );
    for (const word of v.match(/[a-zA-Z]+/g) ?? [])
      if (NAMED.has(word.toLowerCase())) found.push(word);
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = [];
  for (const path of cssFiles(root)) {
    const file = relative(root, path);
    if (file === "styles/tokens.css") continue;
    const found = rawColours(readFileSync(path, "utf8"));
    if (found.length)
      problems.push(
        `${file}: ${found.length} raw colour(s) (${found.join(" ")}). Use a token from styles/tokens.css.`,
      );
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("no-raw-hex: ok");
}
