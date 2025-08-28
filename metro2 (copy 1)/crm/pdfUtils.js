import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawnSync } from 'child_process';

async function detectChromium(){
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

export async function htmlToPdfBuffer(html){
  if(!html || !html.trim()) throw new Error('No HTML content provided');
  let browser;
  try{
    const execPath = await detectChromium();
    const opts = { headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process'] };
    if(execPath) opts.executablePath = execPath;
    browser = await puppeteer.launch(opts);
    const page = await browser.newPage();
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await page.goto(dataUrl,{ waitUntil:'load', timeout:60000 });
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
