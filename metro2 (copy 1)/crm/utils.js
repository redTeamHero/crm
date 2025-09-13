import fs from "fs";

export function ensureBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function readJson(filePath, fallback){
  try{
    const data = await fs.promises.readFile(filePath,"utf-8");
    return JSON.parse(data);
  }catch(err){
    console.error(`Failed to read ${filePath}:`, err);
    return fallback;
  }
}

export async function writeJson(filePath, data){
  try{
    await fs.promises.writeFile(filePath, JSON.stringify(data,null,2));
  }catch(err){
    console.error(`Failed to write ${filePath}:`, err);
    throw err;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRO2_VIOLATIONS_PATH = path.join(
  __dirname,
  "data",
  "metro2Violations.json"
);


