/* public/index.js */

const $ = (s) => document.querySelector(s);
const api = (u, o = {}) => fetch(u, o).then(r => r.json()).catch(e => ({ ok:false, error:String(e) }));

let DB = { consumers: [] };
let currentConsumerId = null;
let currentReportId = null;
let CURRENT_REPORT = null;

// ----- UI helpers -----
function showErr(msg){
  const e = $("#err");
  if (!e) { alert(msg); return; }
  e.textContent = msg || "Something went wrong.";
  e.classList.remove("hidden");
  console.error("[UI][ERR]", msg);
}
function clearErr(){
  const e = $("#err");
  if (e) { e.textContent = ""; e.classList.add("hidden"); }
}
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ===================== Consumers (search + pagination) =====================
const PAGE_SIZE = 10;
let consQuery = "";
let consPage = 1;

function filteredConsumers(){
  const q = consQuery.trim().toLowerCase();
  if (!q) return DB.consumers.slice();
  return DB.consumers.filter(c=>{
    return [c.name,c.email,c.phone,c.addr1,c.city,c.state,c.zip].some(v=> (v||"").toLowerCase().includes(q));
  });
}
function totalPages(){ return Math.max(1, Math.ceil(filteredConsumers().length / PAGE_SIZE)); }
function currentPageItems(){
  const items = filteredConsumers();
  const tp = totalPages();
  if (consPage > tp) consPage = tp;
  const start = (consPage-1)*PAGE_SIZE;
  return items.slice(start, start+PAGE_SIZE);
}

async function loadConsumers(){
  clearErr();
  const data = await api("/api/consumers");
  if (!data || !data.consumers) { showErr("Could not load consumers."); return; }
  DB = data;
  renderConsumers();
}
function renderConsumers(){
  const wrap = $("#consumerList");
  wrap.innerHTML = "";
  const tpl = $("#consumerItem").content;

  currentPageItems().forEach(c=>{
    const n = tpl.cloneNode(true);
    n.querySelector(".name").textContent = c.name || "(no name)";
    n.querySelector(".email").textContent = c.email || "";
    n.querySelector(".select").addEventListener("click", ()=> selectConsumer(c.id));
    n.querySelector(".delete").addEventListener("click", async ()=>{
      if(!confirm(`Delete ${c.name}?`)) return;
      const res = await api(`/api/consumers/${c.id}`, { method:"DELETE" });
      if(!res?.ok) return showErr(res?.error || "Failed to delete consumer.");
      if(currentConsumerId === c.id){
        currentConsumerId = null;
        currentReportId = null;
        CURRENT_REPORT = null;
        $("#reportPicker").innerHTML = "";
        $("#tlList").innerHTML = "";
        $("#selConsumer").textContent = "—";
        $("#activityList").innerHTML = "";
      }
      loadConsumers();
    });
    wrap.appendChild(n);
  });
  $("#consPage").textContent = String(consPage);
  $("#consPages").textContent = String(totalPages());
}
$("#consumerSearch").addEventListener("input", (e)=>{
  consQuery = e.target.value || "";
  consPage = 1;
  renderConsumers();
});
$("#consPrev").addEventListener("click", ()=>{
  if (consPage>1){ consPage--; renderConsumers(); }
});
$("#consNext").addEventListener("click", ()=>{
  if (consPage<totalPages()){ consPage++; renderConsumers(); }
});

async function selectConsumer(id){
  currentConsumerId = id;
  const c = DB.consumers.find(x=>x.id===id);
  $("#selConsumer").textContent = c ? c.name : "—";
  await refreshReports();
  await loadConsumerState();
}

// ===================== Reports =====================
async function refreshReports(){
  clearErr();
  if(!currentConsumerId){ $("#reportPicker").innerHTML = ""; return; }
  const data = await api(`/api/consumers/${currentConsumerId}/reports`);
  if(!data?.ok) return showErr(data?.error || "Could not load reports.");

  const sel = $("#reportPicker");
  sel.innerHTML = "";
  (data.reports || []).forEach(r=>{
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.filename} (${r.summary.tradelines} TL) • ${new Date(r.uploadedAt).toLocaleString()}`;
    sel.appendChild(opt);
  });

  if (data.reports?.length) {
    currentReportId = data.reports[0].id;
    sel.value = currentReportId;
    await loadReportJSON();
  } else {
    currentReportId = null;
    CURRENT_REPORT = null;
    $("#tlList").innerHTML = `<div class="muted">No reports uploaded yet.</div>`;
  }
}
$("#reportPicker").addEventListener("change", async (e)=>{
  currentReportId = e.target.value || null;
  await loadReportJSON();
});

async function loadReportJSON(){
  clearErr();
  if(!currentConsumerId || !currentReportId) return;
  const data = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}`);
  if(!data?.ok) return showErr(data?.error || "Failed to load report JSON.");
  CURRENT_REPORT = data.report;
  renderFilterBar();
  renderTradelines(CURRENT_REPORT.tradelines || []);
}

// ===================== Filters (unchanged) =====================
const ALL_TAGS = ["Collections","Inquiries","Late Payments","Charge-Off","Student Loans","Medical Bills","Other"];
const activeFilters = new Set();
const hiddenTradelines = new Set();

function hasWord(s, w){ return (s||"").toLowerCase().includes(w.toLowerCase()); }
function maybeNum(x){ return typeof x === "number" ? x : null; }
function deriveTags(tl){
  const tags = new Set();
  const name = (tl.meta?.creditor || "");
  const per = tl.per_bureau || {};
  const bureaus = ["TransUnion","Experian","Equifax"];

  if (bureaus.some(b => hasWord(per[b]?.payment_status, "collection") || hasWord(per[b]?.account_status, "collection"))
      || hasWord(name, "collection")) tags.add("Collections");

  if ((tl.violations||[]).some(v => hasWord(v.title, "inquiry"))) tags.add("Inquiries");

  if (bureaus.some(b => hasWord(per[b]?.payment_status, "late") || hasWord(per[b]?.payment_status, "delinquent"))
      || bureaus.some(b => (maybeNum(per[b]?.past_due) || 0) > 0)) tags.add("Late Payments");

  if (bureaus.some(b => hasWord(per[b]?.payment_status, "charge") && hasWord(per[b]?.payment_status, "off"))) tags.add("Charge-Off");

  const student = ["navient","nelnet","mohela","sallie","aidvantage","department of education","dept of education","edfinancial","fedloan","great lakes","student"];
  if (student.some(k => hasWord(name, k))
      || bureaus.some(b => hasWord(per[b]?.account_type_detail, "student"))) tags.add("Student Loans");

  const medical = ["medical","hospital","clinic","physician","health","radiology","anesthesia","ambulance"];
  if (medical.some(k => hasWord(name, k))) tags.add("Medical Bills");

  if (tags.size === 0) tags.add("Other");
  return Array.from(tags);
}

function renderFilterBar(){
  const bar = $("#filterBar");
  bar.innerHTML = "";
  ALL_TAGS.forEach(tag=>{
    const btn = document.createElement("button");
    btn.className = "chip" + (activeFilters.has(tag) ? " active":"");
    btn.textContent = tag;
    btn.addEventListener("click", ()=>{
      if (activeFilters.has(tag)) activeFilters.delete(tag); else activeFilters.add(tag);
      renderFilterBar();
      renderTradelines(CURRENT_REPORT?.tradelines || []);
    });
    bar.appendChild(btn);
  });
  $("#btnClearFilters").onclick = () => {
    activeFilters.clear();
    renderFilterBar();
    renderTradelines(CURRENT_REPORT?.tradelines || []);
  };
}
function passesFilter(tags){ if (activeFilters.size === 0) return true; return tags.some(t => activeFilters.has(t)); }

// ===================== Tradelines + Zoom =====================
function setCardSelected(card, on){
  card.classList.toggle("selected", !!on);
  card.querySelectorAll('input.bureau').forEach(cb => { cb.checked = !!on; });
}

function renderTradelines(tradelines){
  const container = $("#tlList");
  container.innerHTML = "";
  const tpl = $("#tlTemplate").content;

  tradelines.forEach((tl, idx)=>{
    if (hiddenTradelines.has(idx)) return;
    const tags = deriveTags(tl);
    if (!passesFilter(tags)) return;

    const node = tpl.cloneNode(true);
    const card = node.querySelector(".tl-card");
    card.dataset.index = idx;

    node.querySelector(".tl-creditor").textContent = tl.meta?.creditor || "Unknown Creditor";
    node.querySelector(".tl-idx").textContent = idx;

    node.querySelector(".tl-tu-acct").textContent  = tl.per_bureau?.TransUnion?.account_number || "";
    node.querySelector(".tl-exp-acct").textContent = tl.per_bureau?.Experian?.account_number || "";
    node.querySelector(".tl-eqf-acct").textContent = tl.per_bureau?.Equifax?.account_number || "";

    const tagWrap = node.querySelector(".tl-tags");
    tagWrap.innerHTML = "";
    deriveTags(tl).forEach(t=>{
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      tagWrap.appendChild(chip);
    });

    // violations list (checkboxes for selection)
    const vWrap = node.querySelector(".tl-violations");
    const vs = tl.violations || [];
    vWrap.innerHTML = vs.length
      ? vs.map((v, vidx) => `
        <label class="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" class="violation" value="${vidx}"/>
          <div>
            <div class="font-medium text-sm wrap-anywhere">${escapeHtml(v.category || "")} – ${escapeHtml(v.title || "")}</div>
            ${v.detail ? `<div class="text-sm text-gray-600 wrap-anywhere">${escapeHtml(v.detail)}</div>` : ""}
          </div>
        </label>`).join("")
      : `<div class="text-sm muted">No auto-detected violations for this tradeline.</div>`;

    // Remove card
    node.querySelector(".tl-remove").addEventListener("click",(e)=>{
      e.stopPropagation();
      hiddenTradelines.add(idx);
      renderTradelines(tradelines);
    });

    // Open zoom only when clicking creditor name
    const nameEl = node.querySelector(".tl-creditor");
    if (nameEl) {
      nameEl.classList.add("cursor-pointer");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomModal(tl, idx);
      });
    }

    // keep selected class synced when user flips any checkbox
    card.querySelectorAll('input.bureau').forEach(cb=>{
      cb.addEventListener("change", ()=>{
        const any = Array.from(card.querySelectorAll('input.bureau')).some(x=>x.checked);
        card.classList.toggle("selected", any);
      });
    });

    container.appendChild(node);
  });

  if (!container.children.length){
    container.innerHTML = `<div class="muted">No tradelines match the current filters.</div>`;
  }

  // Let special-modes hook new cards
  window.__crm_helpers?.attachCardHandlers?.(container);
}

// Zoom modal builders
function renderPB(pb){
  if (!pb) return "<div class='text-sm muted'>No data.</div>";
  const get = (k) => escapeHtml(pb?.[k] ?? pb?.[`${k}_raw`] ?? "—");
  const row = (k,l) => `<tr><td class="bg-gray-50 border px-2 py-1">${l}</td><td class="border px-2 py-1">${get(k)}</td></tr>`;
  return `
    <table class="w-full text-sm border-collapse">
      <tbody class="[&_td]:border [&_th]:border">
        ${row("account_number","Account #")}
        ${row("account_status","Account Status")}
        ${row("payment_status","Payment Status")}
        ${row("balance","Balance")}
        ${row("past_due","Past Due")}
        ${row("credit_limit","Credit Limit")}
        ${row("high_credit","High Credit")}
        ${row("date_opened","Date Opened")}
        ${row("last_reported","Last Reported")}
        ${row("date_last_payment","Date Last Payment")}
        ${row("comments","Comments")}
      </tbody>
    </table>`;
}
function buildZoomHTML(tl){
  const per = tl.per_bureau || {};
  const vlist = (tl.violations||[]).map(v=>`
    <li class="mb-2">
      <div class="font-medium">${escapeHtml(v.category||"")} – ${escapeHtml(v.title||"")}</div>
      ${v.detail? `<div class="text-gray-600">${escapeHtml(v.detail)}</div>` : ""}
    </li>`).join("") || "<div class='text-sm muted'>No violations detected.</div>";

  return `
    <div class="space-y-3">
      <div class="text-lg font-semibold">${escapeHtml(tl.meta?.creditor || "Unknown Creditor")}</div>
      <div class="grid md:grid-cols-3 gap-3">
        <div class="glass card"><div class="font-medium mb-1">TransUnion</div>${renderPB(per.TransUnion)}</div>
        <div class="glass card"><div class="font-medium mb-1">Experian</div>${renderPB(per.Experian)}</div>
        <div class="glass card"><div class="font-medium mb-1">Equifax</div>${renderPB(per.Equifax)}</div>
      </div>
      <div class="glass card">
        <div class="font-medium mb-1">Violations</div>
        <ol class="list-decimal list-inside">${vlist}</ol>
      </div>
    </div>`;
}
function openZoomModal(tl, idx){
  const m = $("#zoomModal");
  $("#zoomBody").innerHTML = buildZoomHTML(tl);
  m.classList.remove("hidden"); m.classList.add("flex");
  document.body.style.overflow = "hidden";
}
function closeZoomModal(){
  const m = $("#zoomModal");
  m.classList.add("hidden"); m.classList.remove("flex");
  document.body.style.overflow = "";
}
$("#zoomClose").addEventListener("click", closeZoomModal);
$("#zoomModal").addEventListener("click", (e)=>{ if(e.target.id==="zoomModal") closeZoomModal(); });

// ===================== Selection → Generate =====================
function getRequestType(){
  const r = document.querySelector('input[name="rtype"]:checked');
  return r ? r.value : "correct";
}
function getSpecialModeForCard(card){
  if (card.classList.contains("mode-identity")) return "identity";
  if (card.classList.contains("mode-breach"))   return "breach";
  if (card.classList.contains("mode-assault"))  return "assault";
  return null;
}
function collectSelections(){
  const selections = [];
  document.querySelectorAll("#tlList > .tl-card").forEach(card=>{
    const tradelineIndex = Number(card.dataset.index);
    const bureaus = Array.from(card.querySelectorAll(".bureau:checked")).map(i=>i.value);
    if(!bureaus.length) return;
    const violationIdxs = Array.from(card.querySelectorAll(".violation:checked")).map(i=>Number(i.value));
    const specialMode = getSpecialModeForCard(card);
    selections.push({ tradelineIndex, bureaus, violationIdxs, specialMode });
  });
  return selections;
}

$("#btnGenerate").addEventListener("click", async ()=>{
  clearErr();
  try{
    if(!currentConsumerId || !currentReportId) throw new Error("Select a consumer and a report first.");
    const selections = collectSelections();
    if(!selections.length) throw new Error("Pick at least one tradeline, at least one bureau, and any violations you want.");
    const requestType = getRequestType();

    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ consumerId: currentConsumerId, reportId: currentReportId, selections, requestType })
    });
    if(!resp.ok){
      const txt = await resp.text().catch(()=> "");
      throw new Error(`HTTP ${resp.status} ${txt || ""}`.trim());
    }
    const data = await resp.json().catch(()=> ({}));
    if(!data?.ok || !data?.redirect) throw new Error(data?.error || "Server did not return a redirect.");
    window.location.assign(data.redirect);
    setTimeout(()=>{
      if (!/\/letters(\?|$)/.test(location.href)) window.location.href = data.redirect;
    }, 120);
  }catch(e){
    showErr(e.message || String(e));
  }
});

// ===================== Toolbar =====================
$("#btnNewConsumer").addEventListener("click", async ()=>{
  const name = prompt("Consumer name?");
  if(!name) return;
  const res = await api("/api/consumers", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name })
  });
  if(!res?.ok) return showErr(res?.error || "Failed to create consumer.");
  await loadConsumers();
  await selectConsumer(res.consumer.id);
});

$("#btnEditConsumer").addEventListener("click", ()=>{
  const m = $("#editModal");
  if(!currentConsumerId){ showErr("Select a consumer first."); return; }
  const c = DB.consumers.find(x=>x.id===currentConsumerId);
  if(!c){ showErr("Consumer not found."); return; }
  const f = $("#editForm");
  f.name.value = c.name || "";
  f.email.value = c.email || "";
  f.phone.value = c.phone || "";
  f.addr1.value = c.addr1 || "";
  f.addr2.value = c.addr2 || "";
  f.city.value = c.city || "";
  f.state.value = c.state || "";
  f.zip.value = c.zip || "";
  f.ssn_last4.value = c.ssn_last4 || "";
  f.dob.value = c.dob || "";
  m.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});
$("#editClose").addEventListener("click", ()=> closeEdit());
$("#editCancel").addEventListener("click", ()=> closeEdit());
function closeEdit(){
  $("#editModal").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#editForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const f = e.currentTarget;
  const payload = Object.fromEntries(new FormData(f).entries());
  const res = await api(`/api/consumers/${currentConsumerId}`, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(!res?.ok) return showErr(res?.error || "Failed to save.");
  closeEdit();
  await loadConsumers();
  const c = DB.consumers.find(x=>x.id===currentConsumerId);
  $("#selConsumer").textContent = c ? c.name : "—";
});

// Upload report
$("#btnUpload").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  $("#fileInput").value = "";
  $("#fileInput").click();
});
$("#fileInput").addEventListener("change", async (e)=>{
  clearErr();
  const file = e.target.files?.[0];
  if(!file) return;
  const btn = $("#btnUpload");
  const old = btn.textContent;
  btn.textContent = "Uploading…";
  btn.disabled = true;

  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`/api/consumers/${currentConsumerId}/upload`, { method:"POST", body: fd });
    const data = await res.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
    await refreshReports();
    await loadConsumerState();
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Audit report
$("#btnAuditReport").addEventListener("click", async ()=>{
  if(!currentConsumerId || !currentReportId) return showErr("Select a report first.");
  const btn = $("#btnAuditReport");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Auditing...";
  try{
    const res = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}/audit`, { method:"POST" });
    if(!res?.ok) return showErr(res?.error || "Failed to run audit.");
    if(res.url) window.open(res.url, "_blank");
    if(res.warning) showErr(res.warning);
  }catch(err){
    showErr(String(err));
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
});

// Delete report
$("#btnDeleteReport").addEventListener("click", async ()=>{
  if(!currentConsumerId || !currentReportId) return showErr("Select a report first.");
  if(!confirm("Delete this report?")) return;
  const res = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}`, { method:"DELETE" });
  if(!res?.ok) return showErr(res?.error || "Failed to delete report.");
  await refreshReports();
  await loadConsumerState();
});

// ===================== Files & Activity =====================
async function loadConsumerState(){
  if (!currentConsumerId){ $("#activityList").innerHTML = ""; return; }
  const resp = await api(`/api/consumers/${currentConsumerId}/state`);
  if (!resp?.ok){ $("#activityList").innerHTML = `<div class="muted">No activity.</div>`; return; }
  const { events=[], files=[] } = resp.state || {};
  const list = [];

  if (files.length){
    list.push(`<div class="font-medium mb-1">Files</div>`);
    files.forEach(f=>{
      list.push(`
        <div class="glass card flex items-center justify-between p-2">
          <div class="wrap-anywhere">
            <div>${escapeHtml(f.originalName)}</div>
            <div class="text-xs muted">${(f.mimetype||"").split("/").pop() || ""} • ${(f.size/1024).toFixed(1)} KB • ${new Date(f.uploadedAt).toLocaleString()}</div>
          </div>
          <a class="btn text-sm" href="/api/consumers/${currentConsumerId}/state/files/${encodeURIComponent(f.storedName)}" target="_blank">Open</a>
        </div>
      `);
    });
  }

  list.push(`<div class="font-medium mt-2 mb-1">Activity</div>`);
  if (!events.length){
    list.push(`<div class="muted">No recent events.</div>`);
  } else {
    events.forEach(ev=>{
      const when = new Date(ev.at).toLocaleString();
      list.push(`
        <div class="glass card p-2">
          <div class="flex items-center justify-between">
            <div class="font-medium">${escapeHtml(ev.type)}</div>
            <div class="text-xs muted">${when}</div>
          </div>
          ${ev.payload ? `<pre class="text-xs mt-1 overflow-auto">${escapeHtml(JSON.stringify(ev.payload, null, 2))}</pre>` : ""}
        </div>
      `);
    });
  }
  $("#activityList").innerHTML = list.join("");
}

$("#btnAddFile").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  $("#activityFile").value = "";
  $("#activityFile").click();
});
$("#activityFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`/api/consumers/${currentConsumerId}/state/upload`, { method:"POST", body: fd });
    const data = await res.json().catch(()=> ({}));
    if(!data?.ok) throw new Error(data?.error || `Upload failed`);
    await loadConsumerState();
  }catch(err){
    showErr(String(err));
  }
});

// ===================== Modes + Global Hotkeys =====================
// Minimal re-implementation here so we don't rely on inline scripts
const MODES = [
  { key: "identity", hotkey: "i", cardClass: "mode-identity", chip: "ID Theft" },
  { key: "breach",   hotkey: "d", cardClass: "mode-breach",   chip: "Breach"   },
  { key: "assault",  hotkey: "s", cardClass: "mode-assault",  chip: "Assault"  },
];
let activeMode = null;
function setMode(key){ activeMode = (activeMode===key)? null : key; updateModeButtons(); }
function updateModeButtons(){ document.querySelectorAll(".mode-btn").forEach(b=> b.classList.toggle("active", b.dataset.mode===activeMode)); }

(function initModesBar(){
  const bar = $("#modeBar"); if(!bar) return;
  bar.innerHTML = "";
  MODES.forEach(m=>{
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip mode-btn";
    btn.textContent = `${m.key[0].toUpperCase()+m.key.slice(1)}`;
    btn.dataset.mode = m.key;
    btn.addEventListener("click", ()=> setMode(m.key));
    bar.appendChild(btn);
  });
  updateModeButtons();
})();

function attachCardHandlers(root=document){
  root.querySelectorAll(".tl-card").forEach(card=>{
    if (card.__modesHooked) return;
    card.__modesHooked = true;

    // focus ring for hotkeys R/A
    card.addEventListener("pointerdown", ()=> focusCard(card));

    // main click behavior: toggle selection or special mode
    card.addEventListener("click", (e)=>{
      if (e.target.closest("input, label, button")) return;
      if (activeMode){
        toggleCardMode(card, activeMode);
      } else {
        toggleWholeCardSelection(card);
      }
    });

    // badge container safety
    if (!card.querySelector(".special-badges")) {
      const head = card.querySelector(".tl-head") || card.firstElementChild;
      const holder = document.createElement("div");
      holder.className = "special-badges flex gap-1";
      head.appendChild(holder);
    }

    // ensure badges match current classes
    updateCardBadges(card);
  });
}
let lastFocusedCard = null;
function focusCard(card){
  if (lastFocusedCard) lastFocusedCard.classList.remove("focus-ring");
  lastFocusedCard = card;
  card.classList.add("focus-ring");
}
function toggleWholeCardSelection(card){
  const any = Array.from(card.querySelectorAll('input.bureau')).some(cb=>cb.checked);
  setCardSelected(card, !any);
}

function toggleCardMode(card, modeKey){
  const info = MODES.find(m => m.key === modeKey);
  if (!info) return;
  // remove other mode classes before toggling desired one
  MODES.forEach(m => { if (m.cardClass !== info.cardClass) card.classList.remove(m.cardClass); });
  card.classList.toggle(info.cardClass);
  updateCardBadges(card);
}

function updateCardBadges(card){
  const wrap = card.querySelector(".special-badges");
  if (!wrap) return;
  wrap.innerHTML = "";
  const mode = MODES.find(m => card.classList.contains(m.cardClass));
  if (mode){
    const s = document.createElement("span");
    s.className = `chip chip-mini chip-${mode.key}`;
    s.textContent = mode.chip;
    wrap.appendChild(s);
  }
}
window.__crm_helpers = {
  attachCardHandlers,
  focusCardRef: ()=> lastFocusedCard,
  toggleWholeCardSelection,
  clearMode: ()=>{ activeMode=null; updateModeButtons(); }
};

const tlList = $("#tlList");
const obs = new MutationObserver(()=> attachCardHandlers(tlList));
obs.observe(tlList, { childList:true, subtree:true });

// Global hotkeys
function isTypingTarget(el){ return el && (el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.isContentEditable); }
document.addEventListener("keydown",(e)=>{
  if (isTypingTarget(document.activeElement)) return;
  const k = e.key.toLowerCase();

  if (k==="h"){ e.preventDefault(); openHelp(); return; }
  if (k==="n"){ e.preventDefault(); $("#btnNewConsumer")?.click(); return; }
  if (k==="u"){ e.preventDefault(); $("#btnUpload")?.click(); return; }
  if (k==="e"){ e.preventDefault(); $("#btnEditConsumer")?.click(); return; }
  if (k==="g"){ e.preventDefault(); $("#btnGenerate")?.click(); return; }

  if (k==="r"){ // remove focused card
    e.preventDefault();
    const card = window.__crm_helpers?.focusCardRef?.();
    if (card) card.querySelector(".tl-remove")?.click();
    return;
  }
  if (k==="a"){ // toggle all bureaus
    e.preventDefault();
    const card = window.__crm_helpers?.focusCardRef?.();
    if (card) window.__crm_helpers.toggleWholeCardSelection(card);
    return;
  }

  if (k==="c"){ // context clear
    e.preventDefault();
    if (!$("#editModal").classList.contains("hidden")){
      // clear edit form
      $("#editForm").querySelectorAll("input").forEach(i=> i.value="");
      return;
    }
    // clear filters + mode
    activeFilters.clear(); renderFilterBar(); renderTradelines(CURRENT_REPORT?.tradelines||[]);
    window.__crm_helpers?.clearMode?.();
    return;
  }

  // Modes (i/d/s)
  const m = MODES.find(x=>x.hotkey===k);
  if (m){ e.preventDefault(); setMode(m.key); return; }
});

// Help modal simple control
function openHelp(){
  const modal = $("#helpModal");
  modal.classList.remove("hidden"); modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}
$("#helpClose").addEventListener("click", ()=>{
  const modal = $("#helpModal");
  modal.classList.add("hidden"); modal.classList.remove("flex");
  document.body.style.overflow = "";
});
$("#helpModal").addEventListener("click", (e)=>{ if(e.target.id==="helpModal"){ $("#helpClose").click(); } });

// ===================== Init =====================
loadConsumers();

// ----- Color theme selector -----
function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const colorToggle = $("#colorToggle");
const colorBubbles = $("#colorBubbles");

colorToggle?.addEventListener("click", ()=>{
  colorBubbles.classList.toggle("hidden");
  colorToggle.textContent = colorBubbles.classList.contains("hidden") ? "🎨" : "×";
});
document.querySelectorAll(".color-bubble[data-color]").forEach(b=>{
  b.addEventListener("click", ()=>{
    const color = b.dataset.color;
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent-bg", hexToRgba(color,0.12));
    if(colorToggle) colorToggle.style.background = color;

  });
});
