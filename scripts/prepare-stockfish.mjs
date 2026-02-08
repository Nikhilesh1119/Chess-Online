import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const stockfishSrcDir = path.join(rootDir, "node_modules", "stockfish", "src");
const outputDir = path.join(rootDir, "public", "stockfish");
const stockfishPathModule = path.join(rootDir, "src", "stockfish-path.js");

function pickFirstSorted(files) {
  return [...files].sort()[0] || null;
}

async function main() {
  const entries = await fs.readdir(stockfishSrcDir);
  const jsFile = pickFirstSorted(entries.filter((name) => /^stockfish-.*-lite-single-.*\.js$/.test(name)));
  const wasmFile = pickFirstSorted(entries.filter((name) => /^stockfish-.*-lite-single-.*\.wasm$/.test(name)));

  if (!jsFile || !wasmFile) {
    throw new Error("Could not find Stockfish lite-single JS/WASM files.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.copyFile(path.join(stockfishSrcDir, jsFile), path.join(outputDir, jsFile));
  await fs.copyFile(path.join(stockfishSrcDir, wasmFile), path.join(outputDir, wasmFile));

  const moduleContents = `export const STOCKFISH_URL = "/stockfish/${jsFile}";\n`;
  await fs.writeFile(stockfishPathModule, moduleContents, "utf8");

  process.stdout.write(`Prepared Stockfish assets: ${jsFile}, ${wasmFile}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
