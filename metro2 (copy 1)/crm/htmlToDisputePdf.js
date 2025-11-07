import fs from 'fs/promises';
import path from 'path';
import { generateLetters } from './letterEngine.js';
import { htmlToPdfBuffer } from './pdfUtils.js';

/**
 * Convert raw credit-report HTML into dispute letter PDFs.
 * @param {string} html raw report markup
 * @param {object} consumer {firstName,lastName,address1,city,state,zip}
 * @returns {Promise<Array<{filename:string,pdf:Buffer}>>}
 */
export async function htmlReportToDisputePdfs(html, consumer){
  throw new Error('Credit report parser has been removed pending a manual rewrite.');
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [input, outDir='.'] = process.argv.slice(2);
  if(!input){
    console.error('Usage: node htmlToDisputePdf.js <report.html> [outDir]');
    process.exit(1);
  }
  const html = await fs.readFile(input,'utf-8');
  const consumer = { firstName:'John', lastName:'Doe', address1:'123 Main St', city:'Anytown', state:'CA', zip:'00000' };
  const pdfs = await htmlReportToDisputePdfs(html, consumer);
  await fs.mkdir(outDir,{ recursive:true });
  await Promise.all(pdfs.map(async ({filename,pdf})=>{
    await fs.writeFile(path.join(outDir, filename), pdf);
    console.log('saved', filename);
  }));
}
