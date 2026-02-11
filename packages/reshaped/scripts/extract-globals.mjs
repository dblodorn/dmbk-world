/**
 * Post-build script: Extract global (non-module) CSS from JS imports.
 *
 * Next.js Pages Router only allows global CSS imports from _app.tsx.
 * Reshaped's compiled JS imports global CSS via side-effect imports like:
 *   import "./Reshaped.css";
 *
 * This script:
 * 1. Finds all JS files in dist/ that have side-effect imports of non-module CSS
 * 2. Concatenates those CSS files into dist/globals.css
 * 3. Removes the import lines from the JS and .d.ts files
 *
 * Consumers then import "reshaped/globals.css" in their _app.tsx.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

const DIST_DIR = resolve(new URL(".", import.meta.url).pathname, "../dist");

// Pattern: import "./something.css"; (but NOT .module.css)
const GLOBAL_CSS_IMPORT_RE = /^import\s+["'](\.[^"']+(?<!\.module)\.css)["'];?\s*$/;

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// Collect all global CSS content and the JS files that import them
const globalCssContents = [];
const cssFilesIncluded = new Set();
const jsFilesToPatch = [];

const allFiles = walkDir(DIST_DIR);
const jsFiles = allFiles.filter((f) => f.endsWith(".js"));

for (const jsFile of jsFiles) {
  const content = readFileSync(jsFile, "utf-8");
  const lines = content.split("\n");
  let hasGlobalImport = false;

  for (const line of lines) {
    const match = line.match(GLOBAL_CSS_IMPORT_RE);
    if (match) {
      hasGlobalImport = true;
      const cssRelPath = match[1];
      const cssAbsPath = resolve(dirname(jsFile), cssRelPath);

      if (!cssFilesIncluded.has(cssAbsPath) && existsSync(cssAbsPath)) {
        const cssContent = readFileSync(cssAbsPath, "utf-8");
        globalCssContents.push(`/* Source: ${cssAbsPath.replace(DIST_DIR + "/", "")} */`);
        globalCssContents.push(cssContent);
        cssFilesIncluded.add(cssAbsPath);
      }
    }
  }

  if (hasGlobalImport) {
    jsFilesToPatch.push(jsFile);
  }
}

if (globalCssContents.length === 0) {
  console.log("extract-globals: No global CSS imports found, nothing to do.");
  process.exit(0);
}

// Write combined globals.css
const globalsPath = join(DIST_DIR, "globals.css");
writeFileSync(globalsPath, globalCssContents.join("\n\n") + "\n");
console.log(`extract-globals: Created ${globalsPath} (${cssFilesIncluded.size} CSS files)`);

// Patch JS files: remove global CSS import lines
for (const jsFile of jsFilesToPatch) {
  const content = readFileSync(jsFile, "utf-8");
  const patched = content
    .split("\n")
    .filter((line) => !GLOBAL_CSS_IMPORT_RE.test(line))
    .join("\n");
  writeFileSync(jsFile, patched);
  console.log(`extract-globals: Patched ${jsFile.replace(DIST_DIR + "/", "")}`);
}

// Also patch .d.ts files that reference global CSS
const dtsFiles = allFiles.filter((f) => f.endsWith(".d.ts"));
for (const dtsFile of dtsFiles) {
  const content = readFileSync(dtsFile, "utf-8");
  const lines = content.split("\n");
  const hasGlobalImport = lines.some((line) => GLOBAL_CSS_IMPORT_RE.test(line));

  if (hasGlobalImport) {
    const patched = lines.filter((line) => !GLOBAL_CSS_IMPORT_RE.test(line)).join("\n");
    writeFileSync(dtsFile, patched);
    console.log(`extract-globals: Patched ${dtsFile.replace(DIST_DIR + "/", "")}`);
  }
}

console.log("extract-globals: Done.");
