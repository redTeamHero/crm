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
    div.className = "glass card tl-card";
    div.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="font-semibold">${escapeHtml(L.creditor || "Unknown Creditor")}</div>
          <div class="text-sm muted">${escapeHtml(L.bureau)} &nbsp;•&nbsp; ${escapeHtml(L.filename)}</div>
        </div>
        <div class="flex gap-2">
          <a class="btn text-sm open-html" href="${L.htmlUrl}" target="_blank" data-tip="Open HTML (H)">Open HTML</a>
          <button class="btn text-sm do-print" data-tip="Print (P)">Print</button>
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
  $("#pvTitle").textContent = L.filename;
  $("#pvMeta").textContent  = `${L.bureau} • ${L.creditor || "Unknown Creditor"}`;
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

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])); }

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
  showErr("Missing job parameter.");
} else {
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
