import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";
import { readFileSync } from "fs";

const prod = process.argv[2] === "production";
const manifest = JSON.parse(readFileSync("./manifest.json", "utf8"));

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  banner: {
    js: `/* Visual Notes v${manifest.version} — bundled file, do not edit. Source: https://github.com/danderson1988/visual-notes */`,
  },
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  // Bundled UI images live in assets/ and get imported directly in source
  // (e.g. `import icon from '../assets/icon.png'`) — esbuild inlines them as
  // base64 data URIs right into main.js, so they ship with the plugin
  // regardless of install method (community browser, manual 3-file copy,
  // etc.) rather than needing a separate assets folder to be present.
  loader: {
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".gif": "dataurl",
    ".svg": "dataurl",
    ".webp": "dataurl",
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
