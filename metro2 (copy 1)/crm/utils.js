import fs from "fs";
import { loadMetro2Violations } from "../../shared/violations.js";

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

export { loadMetro2Violations };
