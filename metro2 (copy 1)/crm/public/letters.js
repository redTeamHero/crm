// public/letters.js
const $ = (s) => document.querySelector(s);
const api = (u, o={}) => fetch(u, o).then(r => r.json());

function showErr(msg){
  const e=$("#err"); e.textContent=msg; e.classList.remove("hidden");
}
function clearErr(){ $("#err").classList.add("hidden"); $("#err").textContent=""; }

// Accept /letters?job=ID and /letters/ID
function getJobId(){
  const u = new URL(location.href);
  const qp = u.searchParams.get("job");
  if (qp) return qp;
  const m = location.pathname.match(/\/letters\/([^\/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

let LETTERS = [];          // [{ index, filename, bureau, creditor, htmlUrl }]
let page = 1;
const PER_PAGE = 10;
let lastPreview = null;    // currently previewed letter object

function paginate(){
  const total = Math.max(1, Math.ceil(LETTERS.length / PER_PAGE));
  if (page > total) page = total;
  const start = (page-1) * PER_PAGE;
  const slice = LETTERS.slice(start, start + PER_PAGE);
  $("#pnum").textContent = String(page);
  $("#ptotal").textContent = String(total);
  $("#count").textContent = `${LETTERS.length} letter(s) • showing ${slice.length} on this page`;
  return slice;
}

function renderCards(){
  const cont = $("#cards");
  cont.innerHTML = "";
  const items = paginate();
  if (!items.length) {
    cont.innerHTML = `<div class="muted">No letters found for this job.</div>`;
    return;
  }
  items.forEach((L) => {
    const div = document.createElement("div");
    div.className = "glass card tl-card w-full";
    div.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="font-semibold">${escapeHtml(L.creditor || "Unknown Creditor")}</div>
          <div class="text-sm muted">${escapeHtml(L.bureau)}</div>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <a class="btn text-xs open-html" href="${L.htmlUrl}" target="_blank" data-tip="Open HTML (H)">Open HTML</a>
          <a class="btn text-xs" href="/api/letters/${encodeURIComponent(JOB_ID)}/${L.index}.pdf" data-tip="Download PDF">Download PDF</a>
          <button class="btn text-xs do-print" data-tip="Print (P)">Print</button>
        </div>
      </div>
      <div class="text-xs muted mt-1">#${L.index+1}</div>
    `;

    div.querySelector(".do-print").addEventListener("click", async (e)=>{
      e.stopPropagation();
      await printLetter(L);
    });

    div.addEventListener("click", (e)=>{
      if (e.target.closest("a,button")) return;
      openPreview(L);
    });

    cont.appendChild(div);
  });
}

function openPreview(L){
  lastPreview = L;
  $("#pvTitle").textContent = L.creditor || "Letter";
  $("#pvMeta").textContent  = `${L.bureau}`;
  $("#pvOpen").href = L.htmlUrl;
  $("#pvFrame").src = L.htmlUrl;
  $("#previewModal").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closePreview(){
  $("#previewModal").style.display = "none";
  $("#pvFrame").src = "about:blank";
  document.body.style.overflow = "";
}
$("#pvClose").addEventListener("click", closePreview);
$("#previewModal").addEventListener("click", (e)=>{ if(e.target.id==="previewModal") closePreview(); });

$("#pvOpen").setAttribute("data-tip", "Open HTML (H)");
$("#pvPrint").setAttribute("data-tip", "Print (P)");
$("#btnBack").setAttribute("data-tip", "Back to CRM");

// Print from preview modal
$("#pvPrint").addEventListener("click", ()=>{
  const ifr = $("#pvFrame");
  if (!ifr || !ifr.contentWindow) return;
  ifr.contentWindow.focus();
  ifr.contentWindow.print();
});

// Direct print helper
async function printLetter(L){
  const ifr = document.createElement("iframe");
  ifr.style.position = "fixed";
  ifr.style.right = "0";
  ifr.style.bottom = "0";
  ifr.style.width = "0";
  ifr.style.height = "0";
  ifr.style.border = "0";
  document.body.appendChild(ifr);

  await new Promise((resolve) => {
    ifr.onload = resolve;
    ifr.src = L.htmlUrl;
  });

  try {
    ifr.contentWindow.focus();
    ifr.contentWindow.print();
    trackEvent('letter_generated', { jobId: JOB_ID, index: L.index });
  } finally {
    setTimeout(()=> document.body.removeChild(ifr), 1000);
  }
}

// paging
$("#prev").addEventListener("click", ()=>{ if (page>1){ page--; renderCards(); }});
$("#next").addEventListener("click", ()=>{
  const total = Math.max(1, Math.ceil(LETTERS.length / PER_PAGE));
  if (page < total){ page++; renderCards(); }
});

// back
$("#btnBack").addEventListener("click", ()=>{ location.href = "/"; });

$("#btnDownloadAll").addEventListener("click", async ()=>{
  if (!JOB_ID) return;
  const btn = $("#btnDownloadAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing...";
  try {
    const resp = await fetch(`/api/letters/${encodeURIComponent(JOB_ID)}/all.zip`);
    if(!resp.ok) throw new Error("Failed to download zip");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letters_${JOB_ID}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    trackEvent('letters_download_all', { jobId: JOB_ID, count: LETTERS.length });
  } catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

$("#btnPortalAll").addEventListener("click", async ()=>{
  if(!JOB_ID) return;
  const btn = $("#btnPortalAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const resp = await fetch(`/api/letters/${encodeURIComponent(JOB_ID)}/portal`, { method:"POST" });
    const data = await resp.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || "Failed to send to portal.");
    alert("Letters sent to client portal.");
  }catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }

});



$("#btnEmailAll").addEventListener("click", async ()=>{
  if (!JOB_ID) return;
  const to = prompt("Send to which email?");
  if (!to) return;
  const btn = $("#btnEmailAll");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try{
    const resp = await fetch(`/api/letters/${encodeURIComponent(JOB_ID)}/email`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ to })
    });
    const data = await resp.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || "Failed to email letters.");
    alert("Letters emailed.");
  }catch(e){ showErr(e.message || String(e)); }
  finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

async function loadJobs(){
  const list = $("#jobList");
  list.innerHTML = "";
  try {
    const resp = await api('/api/letters');
    (resp.jobs || []).forEach(j => {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between border rounded px-2 py-1';
      const date = new Date(j.createdAt).toLocaleString();
      div.innerHTML = `<div>
        <div class="font-medium">${escapeHtml(j.consumerName || j.consumerId)}</div>
        <div class="text-xs">${date} • ${j.count} letter(s)</div>
      </div>
      <a class="btn text-xs" href="/letters?job=${encodeURIComponent(j.jobId)}">Open</a>`;
      list.appendChild(div);
    });
    if(!resp.jobs || !resp.jobs.length){
      list.innerHTML = '<div class="muted text-sm">No letter jobs yet.</div>';
    }
  } catch (e) {
    list.innerHTML = '<div class="text-red-600">Failed to load letter jobs.</div>';
  }
}

async function loadLetters(jobId){
  clearErr();
  $("#jobId").textContent = jobId || "—";
  try {
    const resp = await api(`/api/letters/${encodeURIComponent(jobId)}`);
    if (!resp?.ok) throw new Error(resp?.error || "Failed to load letters for this job.");
    LETTERS = (resp.letters || []).map((x) => ({
      index: x.index,
      filename: x.filename,
      bureau: x.bureau,
      creditor: x.creditor,
      htmlUrl: `/api/letters/${encodeURIComponent(jobId)}/${x.index}.html`
    }));
    page = 1;
    renderCards();
  } catch (e) {
    showErr(e.message || String(e));
  }
}

const JOB_ID = getJobId();
if (!JOB_ID) {
  $("#lettersSection").classList.add('hidden');
  $("#jobsSection").classList.remove('hidden');
  loadJobs();
} else {
  $("#jobsSection").classList.add('hidden');
  loadLetters(JOB_ID);
}

// Hotkeys on letters page: P = print (preview/first), H = open HTML (preview/first)
document.addEventListener("keydown", (e)=>{
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const k = e.key.toLowerCase();

  if (k === "p"){
    e.preventDefault();
    if (lastPreview){
      const ifr = $("#pvFrame");
      if (ifr && ifr.contentWindow){
        ifr.contentWindow.focus();
        ifr.contentWindow.print();
        return;
      }
    }
    const first = paginate()[0];
    if (first) printLetter(first);
  }

  if (k === "h"){
    e.preventDefault();
    if (lastPreview){
      window.open(lastPreview.htmlUrl, "_blank");
      return;
    }
    const first = paginate()[0];
    if (first) window.open(first.htmlUrl, "_blank");
  }
});
