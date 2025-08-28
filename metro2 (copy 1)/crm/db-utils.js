import fs from "fs";

export function readJson(filePath, defaultObj){
  try{
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }catch{
    return JSON.parse(JSON.stringify(defaultObj));
  }
}

export function writeJson(filePath, data){
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
