import * as cheerio from "cheerio";
import { parseReport as parseContext } from "../../metro2-core/src/index.js";

export function parseReport(html){
  const isString = typeof html === "string";
  const isBuffer = typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(html);

  if(isString || isBuffer){
    const markup = isBuffer ? html.toString() : html;
    return parseContext(cheerio.load(markup));
  }

  return parseContext(html);
}

