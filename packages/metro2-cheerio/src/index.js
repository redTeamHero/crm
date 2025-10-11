import * as cheerio from "cheerio";
import { parseReport as parseContext } from "../../metro2-core/src/index.js";

export function parseReport(html){
  const context = typeof html === "string" ? cheerio.load(html) : html;
  return parseContext(context);
}

