import { build, context } from "esbuild";
import { mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const distDirectory = resolve(projectRoot, "dist");
const watchMode = process.argv.includes("--watch");

const sharedOptions = {
  bundle: true,
  target: "es2020",
  logLevel: "info"
};

const codeOptions = {
  ...sharedOptions,
  entryPoints: [resolve(projectRoot, "src/code.ts")],
  format: "iife",
  outfile: resolve(distDirectory, "code.js")
};

const uiOptions = {
  ...sharedOptions,
  entryPoints: [resolve(projectRoot, "src/ui.ts")],
  format: "iife",
  outfile: resolve(distDirectory, "ui.js")
};

function prepareDist() {
  rmSync(distDirectory, { recursive: true, force: true });
  mkdirSync(distDirectory, { recursive: true });
}

function inlineUiScript() {
  const html = readFileSync(resolve(projectRoot, "src/ui.html"), "utf8");
  const javascript = readFileSync(resolve(distDirectory, "ui.js"), "utf8").replace(
    /<\/script/gi,
    "<\\/script"
  );
  const output = html.replace(
    /<script[^>]*src=["']\.\/ui\.js["'][^>]*><\/script>/i,
    `<script>\n${javascript}\n</script>`
  );
  writeFileSync(resolve(distDirectory, "ui.html"), output, "utf8");
}

async function buildAll() {
  await build(codeOptions);
  await build(uiOptions);
  inlineUiScript();
}

async function run() {
  prepareDist();

  if (!watchMode) {
    await buildAll();
    return;
  }

  const codeContext = await context(codeOptions);
  const uiContext = await context(uiOptions);
  await codeContext.watch();
  await uiContext.watch();
  inlineUiScript();

  watch(resolve(projectRoot, "src/ui.html"), () => {
    try {
      inlineUiScript();
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    }
  });

  process.stdout.write("正在监听源码变化…\n");
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
