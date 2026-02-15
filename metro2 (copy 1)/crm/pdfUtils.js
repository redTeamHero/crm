import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let PdfKit = null;
let loggedFallbackWarning = false;

function stripAngularMarkup(markup){
  if(!markup) return markup;
  return markup
    // remove Angular-specific HTML comments like <!-- ngRepeat: ... -->
    .replace(/<!--[^>]*ng[^>]*-->/gi,'')
    // unwrap any <td class="ng-binding"> so nested cells don't break layout
    .replace(/<td[^>]*class="[^"]*ng-binding[^"]*"[^>]*>([\s\S]*?)<\/td>/gi,'$1')
    // drop <ng-*> elements while keeping their inner content
    .replace(/<\/?ng-[^>]*>/gi,'')
    // drop generic <ng> elements like <ng>...</ng>
    .replace(/<\/?ng[^->][^>]*>/gi,'')

    // remove ng-* attributes on regular elements
    .replace(/\sng-[a-z-]+="[^"]*"/gi,'')
    // strip the ng-binding class but retain other classes
    .replace(/class="([^"]*)ng-binding([^"]*)"/gi,(m,pre,post)=>{
      const classes = `${pre} ${post}`.trim().replace(/\s+/g,' ');
      return classes ? `class="${classes}"` : '';
    });
} // end stripAngularMarkup

function shouldForceFallback(){
  const val = String(process.env.FORCE_PDF_FALLBACK || '').toLowerCase();
  return val === 'true' || val === '1';
}

function shouldFallbackForError(err){
  if (shouldForceFallback()) return true;
  const message = String(err?.message || '').toLowerCase();
  if (!message) return false;
  if (message.includes('failed to launch the browser process')) return true;
  if (message.includes('chromium failed to launch')) return true;
  if (message.includes('could not find expected browser')) return true;
  if (message.includes('could not find chrome')) return true;
  if (message.includes('no usable sandbox')) return true;
  if (message.includes('executable doesn')) return true;
  if (message.includes('is not a valid linux executable')) return true;
  if (message.includes('.so: cannot open shared object file')) return true;
  if (message.includes('generated pdf is empty')) return true;
  return false;
}

function decodeEntities(str){
  return String(str)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(str){
  return decodeEntities(String(str).replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}

function extractTables(html){
  const tables = [];
  const tableRx = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while((m = tableRx.exec(html)) !== null){
    const rows = [];
    const trRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while((tr = trRx.exec(m[1])) !== null){
      const cells = [];
      const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let td;
      while((td = cellRx.exec(tr[1])) !== null){
        cells.push(stripTags(td[1]));
      }
      if(cells.length) rows.push(cells);
    }
    if(rows.length) tables.push({ start: m.index, end: m.index + m[0].length, rows });
  }
  return tables;
}

function htmlToStructuredBlocks(markup = ''){
  const blocks = [];
  let cleaned = String(markup)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const tables = extractTables(cleaned);
  let cursor = 0;
  for(const tbl of tables){
    if(tbl.start > cursor){
      const chunk = cleaned.slice(cursor, tbl.start);
      pushTextBlocks(blocks, chunk);
    }
    blocks.push({ type: 'table', rows: tbl.rows });
    cursor = tbl.end;
  }
  if(cursor < cleaned.length){
    pushTextBlocks(blocks, cleaned.slice(cursor));
  }
  return blocks;
}

function pushTextBlocks(blocks, html){
  let text = html
    .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, (_, inner) => '\n##HEADING##' + stripTags(inner) + '##/HEADING##\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, inner) => '##BOLD##' + stripTags(inner) + '##/BOLD##')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, inner) => '##BOLD##' + stripTags(inner) + '##/BOLD##')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => '\n##LI##' + inner + '##/LI##\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|section|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  const lines = text.split('\n');
  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    if(line.startsWith('##HEADING##')){
      blocks.push({ type: 'heading', text: line.replace(/##\/?HEADING##/g, '').trim() });
    } else if(line.startsWith('##LI##')){
      const inner = line.replace(/##\/?LI##/g, '').trim();
      const cleaned = inner.replace(/##\/?BOLD##/g, '');
      blocks.push({ type: 'listitem', text: cleaned });
    } else {
      const segments = [];
      const parts = line.split(/(##BOLD##[\s\S]*?##\/BOLD##)/);
      for(const part of parts){
        if(part.startsWith('##BOLD##')){
          segments.push({ bold: true, text: part.replace(/##\/?BOLD##/g, '').trim() });
        } else {
          const t = part.trim();
          if(t) segments.push({ bold: false, text: t });
        }
      }
      if(segments.length) blocks.push({ type: 'text', segments });
    }
  }
}

async function renderFallbackPdf(html, { title = 'Dispute Letter Preview' } = {}){
  if(!PdfKit){
    PdfKit = require('pdfkit');
  }
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PdfKit({ size: 'LETTER', margin: 54 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.font('Helvetica-Bold').fontSize(14).text(title, { align: 'center' });
      doc.moveDown(0.5);

      const blocks = htmlToStructuredBlocks(html);
      let listIdx = 0;

      for(const block of blocks){
        if(doc.y > doc.page.height - doc.page.margins.bottom - 40){
          doc.addPage();
        }

        if(block.type === 'heading'){
          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(12).text(block.text);
          doc.moveDown(0.2);
          doc.font('Helvetica').fontSize(10);
        } else if(block.type === 'listitem'){
          listIdx++;
          doc.font('Helvetica').fontSize(10);
          doc.text(`${listIdx}. ${block.text}`, { indent: 12 });
          doc.moveDown(0.2);
        } else if(block.type === 'text'){
          for(let si = 0; si < block.segments.length; si++){
            const seg = block.segments[si];
            const isLast = si === block.segments.length - 1;
            doc.font(seg.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
            if(!isLast){
              doc.text(seg.text + ' ', { continued: true });
            } else {
              doc.text(seg.text, { continued: false });
            }
          }
          doc.moveDown(0.15);
        } else if(block.type === 'table'){
          renderTable(doc, block.rows, pageWidth);
          doc.moveDown(0.3);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderTable(doc, rows, pageWidth){
  if(!rows.length) return;
  const numCols = Math.max(...rows.map(r => r.length));
  if(numCols === 0) return;
  const colWidth = pageWidth / numCols;
  const cellPadding = 4;
  const fontSize = 9;
  const startX = doc.page.margins.left;

  for(let ri = 0; ri < rows.length; ri++){
    const row = rows[ri];
    doc.font('Helvetica').fontSize(fontSize);
    const cellHeights = row.map((cell, ci) => {
      const w = colWidth - cellPadding * 2;
      return doc.heightOfString(cell || '', { width: w }) + cellPadding * 2;
    });
    const rowHeight = Math.max(16, ...cellHeights);

    if(doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 10){
      doc.addPage();
    }

    const y = doc.y;
    for(let ci = 0; ci < numCols; ci++){
      const x = startX + ci * colWidth;
      const cellText = (row[ci] || '').trim();
      const isLabel = ci === 0 && numCols >= 2;

      doc.save();
      if(isLabel){
        doc.rect(x, y, colWidth, rowHeight).fillAndStroke('#f5f5f5', '#cccccc');
      } else {
        doc.rect(x, y, colWidth, rowHeight).stroke('#cccccc');
      }
      doc.restore();

      doc.font(isLabel ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      doc.fillColor('#000000');
      doc.text(cellText, x + cellPadding, y + cellPadding, {
        width: colWidth - cellPadding * 2,
        height: rowHeight - cellPadding * 2,
        lineBreak: true,
      });
    }
    doc.y = y + rowHeight;
  }
}

async function renderWithBrowser(browser, html){
  const page = await browser.newPage();
  try{
    // Using setContent instead of navigating to a data URL ensures the
    // uploaded HTML is parsed directly. When navigating to a data URL,
    // Puppeteer sometimes produces a blank PDF because the page never
    // properly finishes loading. setContent reliably renders the provided
    // markup and allows relative asset URLs to resolve.
    await page.setContent(html,{ waitUntil:'load', timeout:60000 });
    await page.emulateMediaType('screen');
    try{ await page.waitForFunction(()=>document.readyState==='complete',{timeout:60000}); }catch{}
    try{ await page.evaluate(()=> (document.fonts && document.fonts.ready) || Promise.resolve()); }catch{}
    await page.evaluate(()=> new Promise(r=>setTimeout(r,80)));
    const pdf = await page.pdf({ format:'Letter', printBackground:true, margin:{top:'1in',right:'1in',bottom:'1in',left:'1in'} });
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if(!pdfBuffer || pdfBuffer.length === 0){
      throw new Error('Generated PDF is empty');
    }
    return pdfBuffer;
  }finally{
    try{ await page.close(); }catch{}
  }
}

function logFallback(err){
  if(loggedFallbackWarning) return;
  const summary = (err?.message || '').split('\n')[0] || String(err);
  console.warn('[pdfUtils] Falling back to PDFKit renderer:', summary);
  loggedFallbackWarning = true;
}

function chromiumLaunchError(err){
  const message = err?.message ? String(err.message) : 'Unknown error';
  return new Error(
    `Chromium failed to launch. Install system deps (libnss3, libnspr4) via 'npm run setup:chrome' or set PUPPETEER_EXECUTABLE_PATH.\nOriginal error: ${message}`
  );
}

export async function detectChromium(){
  if(process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];
  for(const p of candidates){
    try{
      await fs.promises.access(p, fs.constants.X_OK);
      const check = spawnSync(p, ['--version'], { stdio: 'ignore' });
      if(check.status === 0) return p;
    }catch{}
  }
  return null;
}

export async function launchBrowser(options = {}){
  const defaultArgs = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process'];
  const opts = {
    headless: true,
    args: defaultArgs,
    ...options,
  };
  opts.args = [...defaultArgs, ...(options.args || [])];
  if(!opts.executablePath){
    const execPath = await detectChromium();
    if(execPath) opts.executablePath = execPath;
  }
  return puppeteer.launch(opts);
}

export async function htmlToPdfBuffer(html, options = {}){
  if(!html || !html.trim()) throw new Error('No HTML content provided');
  const sanitized = stripAngularMarkup(html);
  const { browser: providedBrowser = null, allowBrowserLaunch = true, title } = options;
  const fallbackTitle = title || 'Dispute Letter Preview';

  if(providedBrowser){
    try{
      return await renderWithBrowser(providedBrowser, sanitized);
    }catch(err){
      if(shouldFallbackForError(err)){
        logFallback(err);
        return renderFallbackPdf(sanitized, { title: fallbackTitle });
      }
      throw err;
    }
  }

  if(!allowBrowserLaunch || shouldForceFallback()){
    logFallback(new Error('Browser launch disabled'));
    return renderFallbackPdf(sanitized, { title: fallbackTitle });
  }

  let browser;
  try{
    try{
      browser = await launchBrowser();
    }catch(err){
      if(shouldFallbackForError(err)){
        logFallback(err);
        return renderFallbackPdf(sanitized, { title: fallbackTitle });
      }
      throw chromiumLaunchError(err);
    }
    try{
      return await renderWithBrowser(browser, sanitized);
    }catch(err){
      if(shouldFallbackForError(err)){
        logFallback(err);
        return renderFallbackPdf(sanitized, { title: fallbackTitle });
      }
      throw err;
    }
  }finally{
    try{ await browser?.close(); }catch{}
  }
}
