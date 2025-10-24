#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

async function readStdin(){
  const chunks = [];
  for await (const chunk of process.stdin){
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(){
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const crmDir = path.resolve(__dirname, '../metro2 (copy 1)/crm');
  const requireFromCrm = createRequire(path.join(crmDir, 'package.json'));
  const cheerio = requireFromCrm('cheerio');
  const { parseCreditReportHTML } = await import(path.join(crmDir, 'parser.js'));

  const inputArg = process.argv[2];
  let html = '';
  if(inputArg && inputArg !== '-'){
    html = await fs.promises.readFile(inputArg, 'utf-8');
  } else {
    html = await readStdin();
  }

  const $ = cheerio.load(html || '', { decodeEntities: false });
  const parsed = parseCreditReportHTML($) || {};
  process.stdout.write(JSON.stringify(parsed));
}

main().catch((error) => {
  console.error('[metro2-parser-bridge] %s', error && error.stack ? error.stack : error);
  process.stdout.write('{}');
});
