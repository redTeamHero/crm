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

function statuteRefs(title){
  const t = String(title || '').toLowerCase();
  if(t.includes('balance') || t.includes('past due')){
    return {
      fcra: '15 U.S.C. §1681s-2(a)(1)(A) - furnishers must report accurate balance information',
      fdcpa: '15 U.S.C. §1692e(2)(A) - prohibits false representation of the amount owed'
    };
  }
  if(t.includes('late') || t.includes('delinquent')){
    return {
      fcra: '15 U.S.C. §1681e(b) - agencies must ensure maximum possible accuracy of payment history',
      fdcpa: '15 U.S.C. §1692e(8) - bars communicating false credit information'
    };
  }
  return {
    fcra: '15 U.S.C. §1681s-2 - furnishers must provide accurate information and correct errors',
    fdcpa: '15 U.S.C. §1692e - prohibits false or misleading representations'
  };
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
      const idxs = Array.isArray(sel.violationIdxs) && sel.violationIdxs.length ? sel.violationIdxs : null;
      const issues = (tl.violations||[])
        .filter((_,i)=> !idxs || idxs.includes(i))
        .map(v=>{
          const legal = statuteRefs(v.title);
          return {
            title: v.title,
            detail: v.detail,
            bureau: v.evidence?.bureau || 'All Bureaus',
            fcra: legal.fcra,
            fdcpa: legal.fdcpa
          };
        });

      accounts.push({ creditor: tl.meta?.creditor, bureaus, issues });
    });
  } else {
    const tradelines = Array.isArray(raw.tradelines) ? raw.tradelines : [];
    tradelines.forEach(tl=>{
      const bureaus = {};
      for(const [bureau, data] of Object.entries(tl.per_bureau||{})){
        bureaus[bureau] = data;
      }
      const issues = (tl.violations||[]).map(v=>{
        const legal = statuteRefs(v.title);
        return {
          title: v.title,
          detail: v.detail,
          bureau: v.evidence?.bureau || 'All Bureaus',
          fcra: legal.fcra,
          fdcpa: legal.fdcpa
        };
      });

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
    const bureauData = acc.bureaus || {};
    const bureaus = Object.keys(bureauData);
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
      const rawValues = bureaus.map(b => {
        const info = acc.bureaus[b] || {};
        return info[field] ?? "";
      });
      const displayValues = rawValues.map(v => field === "payment_status" ? friendlyStatus(v) : v);
      const diff = new Set(displayValues.filter(v => v !== "")).size > 1 ? " diff" : "";
      const cells = rawValues.map((v, i) => {
        const displayVal = displayValues[i];
        const neg = isNegative(field, v) ? ' class="neg"' : '';
        return `<td${neg}>${escapeHtml(displayVal)}</td>`;
      }).join('');
      return `<tr class="row${diff}"><th>${escapeHtml(label)}</th>${cells}</tr>`;
    }).join('');

    const issueItems = (acc.issues || [])
      .sort((a,b)=> (a.bureau||'').localeCompare(b.bureau||''))
      .map(i => {
        if(!i || !i.title) return "";
        if(i.bureau !== 'All Bureaus'){
          const info = bureauData[i.bureau];
          const hasData = info && Object.values(info).some(v => v !== "" && v != null);
          if(!hasData) return "";
        }
        const action = recommendAction(i.title);
        return `<li><strong>${escapeHtml(i.bureau)}</strong>: ${escapeHtml(i.title)} - This violates Metro 2 standard because ${escapeHtml(i.detail || "")}. It also violates FCRA ${escapeHtml(i.fcra)} and FDCPA ${escapeHtml(i.fdcpa)}. ${escapeHtml(action)}</li>`;

      }).filter(Boolean).join('');
    const issueBlock = issueItems ? `<p><strong>Audit Reasons:</strong></p><ul>${issueItems}</ul>` : "";
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
  <h1>${escapeHtml(dateStr)}</h1>
  <h1>${escapeHtml(consumerName)}</h1>
  <h1>Credit Repair Audit</h1>
  <h1>Your First Steps To Financial Freedom!</h1>
  ${accountSections}
  <footer>
    <hr/>
    <p>This report is for informational purposes only and is not legal advice.</p>
  </footer>
  </body></html>`;
}

// Escape special characters for safe HTML output
function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function isNegative(k,v){
  const val = String(v||'').toLowerCase();
  if(k.toLowerCase().includes('past') && parseFloat(val.replace(/[^0-9.-]/g,''))>0) return true;
  return ['collection','late','charge','delinquent','derog'].some(w=> val.includes(w));
}

// Save HTML as PDF under public/reports and return shareable link
export async function savePdf(html){
  if(!html || !html.trim()){
    throw new Error("No HTML content provided");
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'public', 'reports');
  await fs.mkdir(outDir, { recursive: true });
  const filename = `credit-repair-audit-${Date.now()}.pdf`;
  const outPath = path.join(outDir, filename);
  let browser;
  try{
    const execPath = await detectChromium();
    console.log("Launching Chromium for PDF generation", execPath || "(default)");
    browser = await puppeteer.launch({
      headless:true,
      args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
      executablePath: execPath || undefined
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format:'Letter', printBackground:true, margin:{top:'1in',bottom:'1in',left:'1in',right:'1in'} });
    console.log("PDF generated at", outPath);
    return { path: outPath, url: `/reports/${filename}` };
  }catch(err){
    console.error("PDF generation failed, saving HTML instead:", err.message);
    const htmlPath = outPath.replace(/\.pdf$/, '.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
    console.log("HTML fallback saved to", htmlPath);
    return { path: htmlPath, url: `/reports/${path.basename(htmlPath)}`, warning: err.message };
  } finally {
    if (browser) await browser.close();
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
  if(result.warning){
    console.log('PDF generation failed:', result.warning);
    console.log('HTML saved to', result.path);
  }else{
    console.log('PDF saved to', result.path);
  }
  console.log('Shareable link (when served):', result.url);
}
