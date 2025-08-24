import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

// ----- Data Source -----
// Simulate pulling credit-report JSON from internal API/scrape
export async function fetchCreditReport(){
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const reportPath = path.join(__dirname, 'data', 'report.json');
  const raw = await fs.readFile(reportPath, 'utf-8');
  return JSON.parse(raw);
}


  const accounts = raw.tradelines.map(tl => {
    const bureauData = {};
    for(const [bureau, data] of Object.entries(tl.per_bureau)){
      bureauData[bureau] = {
        balance: data.balance,
        status: data.account_status || data.payment_status,
        past_due: data.past_due,
        dispute_reason: data.comments || ''
      };
    }
    return {
      creditor: tl.meta.creditor,
      bureaus: bureauData,

}

// ----- Consumer friendly translations -----
const STATUS_MAP = {
  'Collection/Chargeoff': 'Past due and sent to collections',
  'Charge-off': 'Past due, more than 120 days',
  'Derogatory': 'Negative status',
  'Pays as agreed': 'Pays as agreed',
  'Open': 'Open and active',
  'Closed': 'Closed'
};

function friendlyStatus(status){
  return STATUS_MAP[status] || status;
}

function recommendAction(issueTitle){
  return `Consider disputing "${issueTitle}" with the credit bureau or contacting the creditor for correction.`;
}


// Build HTML report with plain language and recommendations
export function renderHtml(report){
  const rows = report.accounts.map(acc => {
    const bureauRows = Object.entries(acc.bureaus).map(([b, info]) => `
      <tr>
        <td>${b}</td>
        <td>${info.balance ?? ''}</td>
        <td>${friendlyStatus(info.status || '')}</td>
      </tr>`).join('\n');

    return `
      <h2>${acc.creditor}</h2>
      <table border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th>Bureau</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>${bureauRows}</tbody>
      </table>
      ${issues ? `<p>Issues:</p><ul>${issues}</ul>` : '<p>No issues found.</p>'}
    `;
  }).join('\n');
  const dateStr = new Date(report.generatedAt).toLocaleString();
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><style>

  </body></html>`;
}

// Save HTML as PDF under public/reports and return shareable link
export async function savePdf(html){
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'public', 'reports');
  await fs.mkdir(outDir, { recursive: true });
  const filename = `audit-${Date.now()}.pdf`;
  const outPath = path.join(outDir, filename);

  try{
    const execPath = await detectChromium();
    const browser = await puppeteer.launch({
      headless:true,
      args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
      executablePath: execPath || undefined
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format:'Letter', printBackground:true, margin:{top:'1in',bottom:'1in',left:'1in',right:'1in'} });
    await browser.close();
    return { path: outPath, url: `/reports/${filename}` };
  }catch(err){
    const htmlPath = outPath.replace(/\.pdf$/, '.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
    return { path: htmlPath, url: `/reports/${path.basename(htmlPath)}`, warning: err.message };
  }
}

async function detectChromium(){
  if(process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for(const p of ['/usr/bin/chromium','/usr/bin/chromium-browser','/snap/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable']){
    try{ await fs.access(p); return p; }catch{}
  }
  return null;
}

// CLI usage

  const html = renderHtml(normalized);
  const result = await savePdf(html);
  console.log('PDF saved to', result.path);
  console.log('Shareable link (when served):', result.url);
}
