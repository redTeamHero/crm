import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawnSync } from 'child_process';

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

export async function htmlToPdfBuffer(html){
  if(!html || !html.trim()) throw new Error('No HTML content provided');
  html = stripAngularMarkup(html);
  let browser;
  try{
    try{
      browser = await launchBrowser();
    }catch(err){
      throw new Error(
        `Chromium failed to launch. Install system deps (libnss3, libnspr4) via 'npm run setup:chrome' or set PUPPETEER_EXECUTABLE_PATH.\nOriginal error: ${err.message}`
      );
    }
    const page = await browser.newPage();
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
    await page.close();
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if(!pdfBuffer || pdfBuffer.length === 0){
      throw new Error('Generated PDF is empty');
    }
    return pdfBuffer;
  }finally{
    try{ await browser?.close(); }catch{}
  }
}
