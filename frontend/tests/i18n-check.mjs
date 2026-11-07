// Static i18n checks, run in CI:
//  1. every literal key passed to t("...") has a Chinese translation;
//  2. no hard-coded Chinese text remains in components outside src/i18n.
// Keys that reach t() through variables are covered at runtime by the browser test.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const zhSource = await fs.readFile(path.join(src, "i18n", "zh.ts"), "utf8");
const translated = new Set(
  [...zhSource.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((match) =>
    JSON.parse(match[1]),
  ),
);

// Intentional non-English text outside the dictionaries.
const allowedChinese = [
  /`\$\{\(amount \/ 10000\)\.toFixed\(1\)\}万`/,
  /\? "EN" : "中文"/,
];

async function* files(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "i18n") yield* files(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

const problems = [];
let keys = 0;
for await (const file of files(src)) {
  const text = await fs.readFile(file, "utf8");
  const relative = path.relative(src, file);
  for (const match of text.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
    keys += 1;
    const key = JSON.parse(match[1]);
    if (!translated.has(key)) problems.push(`${relative}: missing zh for ${match[1]}`);
  }
  text.split("\n").forEach((line, index) => {
    if (/[一-鿿]/.test(line) && !allowedChinese.some((rule) => rule.test(line)))
      problems.push(`${relative}:${index + 1}: hard-coded Chinese: ${line.trim()}`);
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n: ${keys} literal t() calls translated, no hard-coded Chinese.`);
