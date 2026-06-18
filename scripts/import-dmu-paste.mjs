/**
 * 貼り付け用タイムライン（P2〜）を raw 形式に変換して P1 末尾以降を差し替える。
 * 使い方: node scripts/import-dmu-paste.mjs scripts/dmu-paste-p2p5.txt
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastePath = process.argv[2];
if (!pastePath) {
  console.error("Usage: node scripts/import-dmu-paste.mjs <paste-file>");
  process.exit(1);
}

const paste = readFileSync(pastePath, "utf8");
const rawPath = path.join(root, "scripts/dmu-timeline-raw.txt");
const existing = readFileSync(rawPath, "utf8");
const p1End = existing.indexOf("P2\n");
if (p1End < 0) {
  console.error("P2 section not found in raw file");
  process.exit(1);
}
const p1Part = existing.slice(0, p1End);

function normalizeLine(line) {
  let s = line.replace(/\t+/g, "\t").trim();
  if (!s) return null;
  if (/^p[1-5]$/i.test(s)) return s.toUpperCase();
  // 先頭タブや機制名を除去してパース
  s = s.replace(/^\t+/, "");
  const parts = s.split("\t").map((p) => p.trim()).filter((p, i, arr) => !(p === "" && i >= 4));
  if (parts.length < 3) return null;

  const timeRe = /^\d{2}:\d{2}$/;
  let mechanism;
  let globalTime;
  let phaseTime;
  let rest;

  if (timeRe.test(parts[0]) && timeRe.test(parts[1])) {
    [globalTime, phaseTime, ...rest] = parts;
  } else if (parts.length >= 4 && timeRe.test(parts[1]) && timeRe.test(parts[2])) {
    mechanism = parts[0];
    globalTime = parts[1];
    phaseTime = parts[2];
    rest = parts.slice(3);
  } else {
    return null;
  }

  const name = rest[0] ?? "";
  if (!name) return null;

  const elem = rest[1] ?? "";
  const damage = rest[2] ?? "";

  const out = [globalTime, phaseTime, name];
  if (elem) out.push(elem);
  if (damage) out.push(damage.replace(/\s+/g, ""));
  return out.join("\t");
}

const lines = paste.split(/\r?\n/).map(normalizeLine).filter(Boolean);
const body = lines.join("\n") + "\n";
writeFileSync(rawPath, p1Part + body, "utf8");
console.log(`Updated ${rawPath} (${lines.length} lines)`);
