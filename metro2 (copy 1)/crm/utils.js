import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function ensureBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export function readJson(filePath, fallback){
  try{
    return JSON.parse(fs.readFileSync(filePath,"utf-8"));
  }catch{
    return fallback;
  }
}

export function writeJson(filePath, data){
  fs.writeFileSync(filePath, JSON.stringify(data,null,2));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRO2_VIOLATIONS_PATH = path.join(
  __dirname,
  "data",
  "metro2Violations.json"
);

export function loadMetro2Violations() {
  return readJson(METRO2_VIOLATIONS_PATH, {});
}

export function loadMetro2Violations() {
  return readJson(METRO2_VIOLATIONS_PATH, {});
}

