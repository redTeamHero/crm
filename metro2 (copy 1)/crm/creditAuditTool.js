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

// Normalize report into array of accounts with balances/statuses/issues
export function normalizeReport(raw, selections = null){
  const accounts = [];
  if(Array.isArray(selections) && selections.length){
    selections.forEach(sel=>{
      const tl = raw.tradelines?.[sel.tradelineIndex];
      if(!tl) return;
      const bureaus = {};
      (sel.bureaus||[]).forEach(b=>{
        if(tl.per_bureau?.[b]) bureaus[b] = tl.per_bureau[b];
      });
      const issues = (tl.violations||[]).filter((_,i)=> sel.violationIdxs?.includes(i))
        .map(v=>({ title:v.title, detail:v.detail }));
      accounts.push({ creditor: tl.meta?.creditor, bureaus, issues });
    });
  } else {
    raw.tradelines.forEach(tl=>{
      const bureaus = {};
      for(const [bureau, data] of Object.entries(tl.per_bureau||{})){
        bureaus[bureau] = data;
      }
      const issues = (tl.violations||[]).map(v=>({ title:v.title, detail:v.detail }));
      accounts.push({ creditor: tl.meta?.creditor, bureaus, issues });
    });
  }
  return { generatedAt: new Date().toISOString(), accounts };
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

// Build HTML report mimicking uploaded audit structure with bureau comparison
export function renderHtml(report, consumerName = "Consumer"){
  const accountSections = report.accounts.map(acc => {
    const bureaus = Object.keys(acc.bureaus || {});
    const fields = [
      ["account_number", "Account #"],
      ["account_type", "Account Type"],
      ["payment_status", "Account Payment Status"],
      ["balance_raw", "Balance"],
      ["past_due_raw", "Past Due"],
      ["high_credit_raw", "High Credit"],
      ["date_opened_raw", "Date Opened"],
      ["last_reported_raw", "Last Reported"],
      ["date_last_payment_raw", "Date of Last Payment"],
      ["comments", "Comments"],
    ];

    const rows = fields.map(([field, label]) => {
      const values = bureaus.map(b => {
        const info = acc.bureaus[b] || {};
        return info[field] ?? "";
      });
      const diff = new Set(values.filter(v => v !== "")).size > 1 ? " diff" : "";
      const cells = values.map(v => {
        const neg = isNegative(field, v) ? ' class="neg"' : '';
        return `<td${neg}>${escapeHtml(v)}</td>`;
      }).join('');
      return `<tr class="row${diff}"><th>${escapeHtml(label)}</th>${cells}</tr>`;
    }).join('');

    const issues = (acc.issues || []).map(i => {
      const action = recommendAction(i.title);
      return `<li>${escapeHtml(i.title)} - ${escapeHtml(i.detail)} ${escapeHtml(action)}</li>`;
    }).join('');
    const issueBlock = issues ? `<p><strong>Audit Reasons:</strong></p><ul>${issues}</ul>` : "";
    return `
      <h2>${escapeHtml(acc.creditor)}</h2>
      <h3>Comparison (All Available Bureaus)</h3>
      <table>
        <thead><tr><th>Field</th>${bureaus.map(b=>`<th class="bureau">${escapeHtml(b)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${issueBlock}
    `;
  }).join("\n");

  const dateStr = new Date(report.generatedAt).toLocaleString();
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"/><style>
  body{font-family:Arial, sans-serif;margin:20px;}
  h1{text-align:center;}
  table{width:100%;margin-top:10px;border-collapse:collapse;}
  th,td{border:1px solid #ccc;padding:4px;}
  th.bureau{text-align:center;background:#f5f5f5;}
  tr.diff td{background:#fff3cd;}
  .neg{background:#fee2e2;color:#b91c1c;}
  footer{margin-top:40px;font-size:0.8em;color:#555;}
  </style></head>
  <body>
  <h1>Credit Repair Audit</h1>
  <h1>Request for Correction of Inaccurate/Incomplete Information</h1>
  <p>Generated for ${escapeHtml(consumerName)} on ${escapeHtml(dateStr)}</p>
  ${accountSections}
  <footer>
    <hr/>
    <p>This report is for informational purposes only and is not legal advice.</p>
  </footer>
  </body></html>`;
}

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function isNegative(k,v){
  const val = String(v||'').toLowerCase();
  if(k.toLowerCase().includes('past') && parseFloat(val.replace(/[^0-9.-]/g,''))>0) return true;
  return ['collection','late','charge','delinquent','derog'].some(w=> val.includes(w));
}

// Save HTML as PDF under public/reports and return shareable link
export async function savePdf(html){
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'public', 'reports');
  await fs.mkdir(outDir, { recursive: true });
  const filename = `credit-repair-audit-${Date.now()}.pdf`;
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
if(fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const raw = await fetchCreditReport();
  const normalized = normalizeReport(raw);
  const html = renderHtml(normalized);
  const result = await savePdf(html);
  console.log('PDF saved to', result.path);
  console.log('Shareable link (when served):', result.url);
}
