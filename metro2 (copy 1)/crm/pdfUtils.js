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
  if (message.includes('no usable sandbox')) return true;
  if (message.includes('executable doesn')) return true;
  if (message.includes('is not a valid linux executable')) return true;
  if (message.includes('.so: cannot open shared object file')) return true;
  if (message.includes('generated pdf is empty')) return true;
  return false;
}

function htmlToPlainText(markup = ''){
  return String(markup)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|section|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
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

      doc.font('Helvetica-Bold').fontSize(14).text(title, { align: 'center' });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11);

      const plain = htmlToPlainText(html) || 'No content provided.';
      const paragraphs = plain.split(/\n{2,}/);
      for(const para of paragraphs){
        const text = para.trim();
        if(!text) continue;
        doc.text(text);
        doc.moveDown(0.35);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
