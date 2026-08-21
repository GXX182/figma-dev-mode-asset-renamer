import { build, context } from "esbuild";
import { existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const distDirectory = resolve(projectRoot, "dist");
const watchMode = process.argv.includes("--watch");
const manifestPath = resolve(projectRoot, "manifest.json");
const packagePath = resolve(projectRoot, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

function safeDirectorySegment(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]+$/u.test(value)) {
    throw new Error(`${label} 只能包含字母、数字、点、下划线或短横线`);
  }
  return value;
}

const pluginId = safeDirectorySegment(manifest.id, "manifest.id");
const packageVersion = safeDirectorySegment(packageJson.version, "package.json version");
const releaseName = `${pluginId}_${packageVersion}`;
const releaseDirectory = resolve(distDirectory, releaseName);
const releaseAssetsDirectory = resolve(releaseDirectory, "dist");
const buildAssetsDirectory = watchMode ? distDirectory : releaseAssetsDirectory;

const sharedOptions = {
  bundle: true,
  target: "es2020",
  logLevel: "info"
};

const codeOptions = {
  ...sharedOptions,
  entryPoints: [resolve(projectRoot, "src/code.ts")],
  format: "iife",
  outfile: resolve(buildAssetsDirectory, "code.js")
};

const uiOptions = {
  ...sharedOptions,
  entryPoints: [resolve(projectRoot, "src/ui.ts")],
  format: "iife",
  outfile: resolve(buildAssetsDirectory, "ui.js")
};

function prepareDist() {
  rmSync(distDirectory, { recursive: true, force: true });
  mkdirSync(buildAssetsDirectory, { recursive: true });
}

function inlineUiScript() {
  const html = readFileSync(resolve(projectRoot, "src/ui.html"), "utf8");
  const uiScriptPath = resolve(buildAssetsDirectory, "ui.js");
  const javascript = readFileSync(uiScriptPath, "utf8").replace(
    /<\/script/gi,
    "<\\/script"
  );
  const output = html.replace(
    /<script[^>]*src=["']\.\/ui\.js["'][^>]*><\/script>/i,
    `<script>\n${javascript}\n</script>`
  );
  writeFileSync(resolve(buildAssetsDirectory, "ui.html"), output, "utf8");
  if (!watchMode) {
    rmSync(uiScriptPath, { force: true });
  }
}

function writeReleasePackage() {
  const codePath = resolve(releaseAssetsDirectory, "code.js");
  const uiPath = resolve(releaseAssetsDirectory, "ui.html");
  if (!existsSync(codePath) || !existsSync(uiPath)) {
    throw new Error("发布包生成失败：版本目录中缺少 dist/code.js 或 dist/ui.html");
  }

  const releaseManifest = {
    ...manifest,
    main: "dist/code.js",
    ui: "dist/ui.html"
  };
  writeFileSync(
    resolve(releaseDirectory, "manifest.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8"
  );

  const declaredFiles = [releaseManifest.main, releaseManifest.ui]
    .map((relativePath) => resolve(releaseDirectory, relativePath));
  if (declaredFiles.some((filePath) => !existsSync(filePath))) {
    throw new Error("发布包校验失败：manifest.json 引用的构建文件不存在");
  }
  process.stdout.write(`发布包已生成：${releaseDirectory}\n`);
}

async function buildAll() {
  await build(codeOptions);
  await build(uiOptions);
  inlineUiScript();
  writeReleasePackage();
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
