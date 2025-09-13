import fs from "fs";
import { fetchFn } from "./fetchUtil.js";

export async function sendCertifiedMail({ filePath, toName = "", toAddress = "", toCity = "", toState = "", toZip = "" }) {
  const apiKey = process.env.SCM_API_KEY;
  if(!apiKey) throw new Error("SCM_API_KEY not configured");
  const pdf = await fs.promises.readFile(filePath);
  const body = {
    toName,
    toAddress,
    toCity,
    toState,
    toZip,
    file: pdf.toString("base64")
  };
  const resp = await fetchFn("https://api.simplecertifiedmail.com/v1/letters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const text = await resp.text().catch(()=>"");
    throw new Error(`SimpleCertifiedMail error ${resp.status}: ${text}`);
  }
  return resp.json();
}
