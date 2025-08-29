/ public/app.js
import { MODES, getMode, setMode, isSpecial, allSpecialKeys } from "./specialModes.js";

const $ = s => document.querySelector(s);
const api = (url, opt={}) => fetch(url, opt).then(r => r.json());

function showErr(msg){ const e=$("#err"); e.textContent=msg; e.classList.remove("hidden"); }
function clearErr(){ $("#err").classList.add("hidden"); $("#err").textContent=""; }

/* ------------------ State ------------------ */
let DB = { consumers: [] };
let currentConsumerId = null;
let currentReportId = null;
let CURRENT_REPORT = null;
let uploading = false;

// filters
const ALL_TAGS = ["Collections","Inquiries","Late Payments","Charge-Off","Student Loans","Medical Bills","Other"];
const activeFilters = new Set();

// card hide set
const hiddenTradelines = new Set();

// special selections per mode
const specialSelections = {
  identity: new Set(),
  breach:   new Set(),
  assault:  new Set(),
};

/* ------------------ Consumers ------------------ */
async function loadConsumers(){
  const data = await api("/api/consumers").catch(()=>({}));
  if(!data || !data.consumers) return showErr("Could not load consumers");
  DB = data;
  renderConsumers();
}

function renderConsumers(){
  const wrap = $("#consumerList"); wrap.innerHTML = "";
  const tpl = $("#consumerItem").content;
  DB.consumers.forEach(c=>{
    const n = tpl.cloneNode(true);
    n.querySelector(".name").textContent = c.name || "(no name)";
    n.querySelector(".email").textContent = c.email || "";
    // Make the whole card clickable to open
    n.querySelector(".select").addEventListener("click", ()=>selectConsumer(c.id));
    n.querySelector(".card-click").addEventListener("click", ()=>selectConsumer(c.id));
    n.querySelector(".delete").addEventListener("click", async (e)=>{
      e.stopPropagation();
      if(!confirm(`Delete ${c.name}?`)) return;
      await fetch(`/api/consumers/${c.id}`, { method:"DELETE" });
      await loadConsumers();
      if(currentConsumerId===c.id){
        currentConsumerId=null; CURRENT_REPORT=null;
        $("#tlList").innerHTML=""; $("#selConsumer").textContent="—"; $("#reportPicker").innerHTML="";
      }
    });
    wrap.appendChild(n);
  });
}

async function selectConsumer(id){
  currentConsumerId = id;
  const c = DB.consumers.find(x=>x.id===id);
  $("#selConsumer").textContent = c ? c.name : "—";

  // load reports; handle missing consumer defensively
  const resp = await fetch(`/api/consumers/${id}/reports`);
  if (resp.status === 404) {
    await loadConsumers();
    currentConsumerId = null;
    $("#selConsumer").textContent = "—";
    $("#reportPicker").innerHTML = "";
    $("#tlList").innerHTML = `<div class="muted">That consumer no longer exists. Please select another.</div>`;
    return;
  }
  if (!resp.ok) { showErr(`Failed to load reports (HTTP ${resp.status})`); return; }
  const data = await resp.json();

  const sel = $("#reportPicker");
  sel.innerHTML = "";
  data.reports.forEach(r=>{
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.filename} (${r.summary.tradelines} TL) • ${new Date(r.uploadedAt).toLocaleString()}`;
    sel.appendChild(opt);
  });
  if(data.reports.length){
    currentReportId = data.reports[0].id;
    sel.value = currentReportId;
    await loadReportJSON();
  } else {
    currentReportId = null; CURRENT_REPORT=null;
    $("#tlList").innerHTML = `<div class="muted">No reports uploaded yet.</div>`;
  }
}

$("#reportPicker").addEventListener("change", async (e)=>{ currentReportId = e.target.value; await loadReportJSON(); });

/* ------------------ Reports & Tradelines ------------------ */
async function loadReportJSON(){
  clearErr(); hiddenTradelines.clear();
  // reset special sets when switching report
  for (const k of allSpecialKeys()) specialSelections[k].clear();

  if(!currentConsumerId || !currentReportId) return;
  const data = await api(`/api/consumers/${currentConsumerId}/report/${currentReportId}`).catch(()=>({}));
  if(!data?.ok) return showErr(data?.error || "Failed to load report");
  CURRENT_REPORT = data.report;
  CURRENT_REPORT.tradelines = dedupeTradelines(CURRENT_REPORT.tradelines || []);

  renderFilterBar();
  renderTradelines(CURRENT_REPORT.tradelines);
}

function hasWord(s, w){ return (s||"").toLowerCase().includes(w.toLowerCase()); }
function maybeNum(x){ return typeof x==="number" ? x : null; }

function dedupeTradelines(lines){
  const seen = new Set();
  return (lines||[]).filter(tl=>{
    const key = [
      tl.meta?.creditor || "",
      tl.per_bureau?.TransUnion?.account_number || "",
      tl.per_bureau?.Experian?.account_number || "",
      tl.per_bureau?.Equifax?.account_number || ""
    ].join("|");
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

  const student = ["navient","nelnet","mohela","sallie","aidvantage","dept of education","department of education","edfinancial","fedloan","great lakes","student"];
  if (student.some(k => hasWord(name, k))
      || bureaus.some(b => hasWord(per[b]?.account_type_detail, "student"))) tags.add("Student Loans");

  const medical = ["medical","hospital","clinic","physician","health","radiology","anesthesia","ambulance"];
  if (medical.some(k => hasWord(name, k))) tags.add("Medical Bills");

  if (tags.size === 0) tags.add("Other");
  return Array.from(tags).map(t => t.trim());
}

function renderFilterBar(){
  const bar = $("#filterBar"); bar.innerHTML = "";
  ALL_TAGS.forEach(tag=>{
    const btn = document.createElement("button");
    btn.className = "chip" + (activeFilters.has(tag) ? " active":"");
    btn.textContent = tag;
    btn.addEventListener("click", ()=>{
      if (activeFilters.has(tag)) activeFilters.delete(tag); else activeFilters.add(tag);
      renderFilterBar();
      renderTradelines(CURRENT_REPORT?.tradelines||[]);
    });
    bar.appendChild(btn);
  });
  $("#btnClearFilters").onclick = () => { activeFilters.clear(); renderFilterBar(); renderTradelines(CURRENT_REPORT?.tradelines||[]); };
}

function passesFilter(tags){ if (activeFilters.size === 0) return true; return tags.some(t => activeFilters.has(t)); }

// --- special mode buttons ---
function renderModeBar(){
  const wrap = $("#modeBar");
  wrap.innerHTML = "";
  const modes = ["identity","breach","assault"];
  modes.forEach((k)=>{
    const btn = document.createElement("button");
    btn.className = "btn mode-btn";
    btn.dataset.mode = k;
    btn.textContent = MODES[k].label;
    wrap.appendChild(btn);
  });
  // toggle active visual
  const setActiveClasses = ()=>{
    const cur = getMode();
    wrap.querySelectorAll(".mode-btn").forEach(b=>{
      b.classList.toggle("active", b.dataset.mode === cur);
    });
  };
  wrap.addEventListener("click", (e)=>{
    const b = e.target.closest(".mode-btn");
    if (!b) return;
    const m = b.dataset.mode;
    // toggle: click again to turn off (back to default)
    setMode(getMode() === m ? "default" : m);
    setActiveClasses();
  });
  setActiveClasses();
}

function cardSpecialModes(idx){
  const active = [];
  if (specialSelections.identity.has(idx)) active.push("identity");
  if (specialSelections.breach.has(idx))   active.push("breach");
  if (specialSelections.assault.has(idx))  active.push("assault");
  return active;
}

function updateCardSpecialVisual(card){
  const idx = Number(card.dataset.index);
  const modes = cardSpecialModes(idx);

  // wipe all special classes then add
  card.classList.remove("mode-identity","mode-breach","mode-assault");
  modes.forEach(m => card.classList.add(`mode-${m}`));

  // badges
  const badgeWrap = card.querySelector(".special-badges") || (()=>{ const d=document.createElement("div"); d.className="special-badges"; card.querySelector(".tl-head").appendChild(d); return d; })();
  badgeWrap.innerHTML = "";
  modes.forEach(m=>{
    const s = document.createElement("span");
    s.className = `chip chip-mini chip-${m}`;
    s.textContent = MODES[m].chip;
    badgeWrap.appendChild(s);
  });
}

function setCardSelected(card, on){
  card.classList.toggle("selected", !!on);
  card.querySelectorAll('input.bureau').forEach(cb => { cb.checked = !!on; });
}

function toggleCardSelection(card){
  const anyChecked = Array.from(card.querySelectorAll('input.bureau')).some(cb => cb.checked);
  setCardSelected(card, !anyChecked);
}

function toggleSpecial(idx, mode){
  const set = specialSelections[mode];
  if (set.has(idx)) set.delete(idx); else set.add(idx);
}

/* ------------ Render tradelines ------------- */
function renderTradelines(tradelines){
  renderModeBar();

  const container = $("#tlList");
  container.innerHTML = "";
  const tpl = $("#tlTemplate").content;

  tradelines.forEach((tl, idx) => {
    if (hiddenTradelines.has(idx)) return;

    const tags = deriveTags(tl);
    if (!passesFilter(tags)) return;

    const node = tpl.cloneNode(true);
    const card = node.querySelector(".tl-card");
    card.dataset.index = idx;

    const negativeTags = ["Collections","Late Payments","Charge-Off"];
    if (tags.some(t=>negativeTags.includes(t))) card.classList.add("negative");

    node.querySelector(".tl-creditor").textContent = tl.meta?.creditor || "Unknown Creditor";
    node.querySelector(".tl-idx").textContent = idx;

    node.querySelector(".tl-tu-acct").textContent  = tl.per_bureau?.TransUnion?.account_number || "";
    node.querySelector(".tl-exp-acct").textContent = tl.per_bureau?.Experian?.account_number || "";
    node.querySelector(".tl-eqf-acct").textContent = tl.per_bureau?.Equifax?.account_number || "";

    const tagWrap = node.querySelector(".tl-tags");
    tagWrap.innerHTML = "";
    tags.forEach(t=>{
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      tagWrap.appendChild(chip);
    });

    // violations list
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

    // remove card
    node.querySelector(".tl-remove").addEventListener("click", (e)=>{
      e.stopPropagation();
      hiddenTradelines.add(idx);
      renderTradelines(tradelines);
    });

    // click behavior depends on active mode
    card.addEventListener("click", (e)=>{
      if (e.target.closest("input, label, button")) return;
      const m = getMode();
      if (isSpecial(m)) {
        toggleSpecial(idx, m);
        updateCardSpecialVisual(card);
      } else {
        toggleCardSelection(card);
      }
    });

    // manual checkbox change -> selected tint
    card.querySelectorAll('input.bureau').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        const anyChecked = Array.from(card.querySelectorAll('input.bureau')).some(i=>i.checked);
        card.classList.toggle('selected', anyChecked);
      });
    });

    const gptCb = card.querySelector('.use-gpt');
    const toneSel = card.querySelector('.gpt-tone');
    if (gptCb && toneSel) {
      toneSel.disabled = true;
      gptCb.addEventListener('change', () => {
        toneSel.disabled = !gptCb.checked;
      });
    }

    const ocrCb = card.querySelector('.use-ocr');
    if (ocrCb) {
      // no extra behavior needed; presence indicates OCR request
    }

    // initialize special badges if any from previous state (when re-rendering)
    updateCardSpecialVisual(card);

    container.appendChild(node);
  });

  if (!container.children.length) {
    container.innerHTML = `<div class="muted">No tradelines match the current filters.</div>`;
  }
}

function escapeHtml(s){ return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ------------------ Generate ------------------ */
function getRequestType(){
  const r = document.querySelector('input[name="rtype"]:checked');
  return r ? r.value : "correct";
}

function collectSelections(){
  const selections = [];
  document.querySelectorAll("#tlList > .tl-card").forEach(card=>{
    const tradelineIndex = Number(card.dataset.index);
    if (hiddenTradelines.has(tradelineIndex)) return;

    const bureaus = Array.from(card.querySelectorAll(".bureau:checked")).map(i=>i.value);
    // only include in "normal" part if at least one bureau checked
    const violationIdxs = Array.from(card.querySelectorAll(".violation:checked")).map(i=>Number(i.value));

    const special = [];
    if (specialSelections.identity.has(tradelineIndex)) special.push("identity_theft");
    if (specialSelections.breach.has(tradelineIndex))   special.push("data_breach");
    if (specialSelections.assault.has(tradelineIndex))  special.push("sexual_assault");

    const aiTone = card.querySelector('.use-gpt')?.checked
      ? card.querySelector('.gpt-tone')?.value || ''
      : '';

    const useOcr = card.querySelector('.use-ocr')?.checked || false;

    if (bureaus.length || special.length){
      const entry = { tradelineIndex, bureaus, violationIdxs, special };
      if (aiTone) entry.aiTone = aiTone;
      if (useOcr) entry.useOcr = true;
      selections.push(entry);
    }
  });
  return selections;
}

$("#btnGenerate").addEventListener("click", async ()=>{
  if(!currentConsumerId || !currentReportId) return showErr("Select a consumer and report first.");
  const selections = collectSelections();
  if(!selections.length) return showErr("Pick at least one tradeline (normal or special selection).");
  const requestType = getRequestType();

  const res = await fetch("/api/generate", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      // server can still look up consumer+report if you use that path;
      // or pass the analyzed report/consumer directly—your current server expects the full objects.
      consumerId: currentConsumerId,
      reportId: currentReportId,
      selections,
      requestType
    })
  }).then(r=>r.json()).catch(()=>null);

  if(!res?.ok) return showErr(res?.error || "Failed to generate letters");
  window.location.assign(res.redirect);
});

/* ------------------ Upload / Edit ------------------ */
$("#btnNewConsumer").addEventListener("click", async ()=>{
  const name = prompt("Consumer name?");
  if(!name) return;
  await fetch("/api/consumers", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name })
  });
  await loadConsumers();
});

$("#btnUpload").addEventListener("click", ()=>{
  if(!currentConsumerId) return showErr("Select a consumer first.");
  if(uploading) return;
  $("#fileInput").value = "";
  $("#fileInput").click();
});

$("#fileInput").addEventListener("change", async (e)=>{
  clearErr();
  const file = e.target.files?.[0];
  if(!file) return;
  if(uploading) return;
  uploading = true;
  const btn = $("#btnUpload");
  const old = btn.textContent;
  btn.textContent = "Uploading…";
  btn.disabled = true;

  try {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch(`/api/consumers/${currentConsumerId}/upload`, {
      method:"POST",
      body: fd
    }).then(r=>r.json());
    if(!res?.ok) return showErr(res?.error || "Upload failed");
    await selectConsumer(currentConsumerId);
  } catch (err) {
    showErr(String(err));
  } finally {
    uploading = false;
    btn.textContent = old;
    btn.disabled = false;
  }
});

/* --------- Edit Consumer modal --------- */
const em = $("#editModal");
const ef = $("#editForm");
function openEdit(){
  if(!currentConsumerId) return showErr("Select a consumer first.");
  const c = DB.consumers.find(x=>x.id===currentConsumerId);
  if(!c) return;
  ef.name.value = c.name || "";
  ef.email.value = c.email || "";
  ef.phone.value = c.phone || "";
  ef.addr1.value = c.addr1 || "";
  ef.addr2.value = c.addr2 || "";
  ef.city.value = c.city || "";
  ef.state.value = c.state || "";
  ef.zip.value = c.zip || "";
  ef.dob.value = c.dob || "";
  ef.ssn_last4.value = c.ssn_last4 || "";
  em.style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeEdit(){
  em.style.display = "none";
  document.body.style.overflow = "";
}
$("#btnEditConsumer").addEventListener("click", openEdit);
$("#editClose").addEventListener("click", closeEdit);
$("#editCancel").addEventListener("click", closeEdit);
ef.addEventListener("submit", async (e)=>{
  e.preventDefault();
  clearErr();
  const payload = Object.fromEntries(new FormData(ef).entries());
  const res = await fetch(`/api/consumers/${currentConsumerId}`, {
    method:"PUT",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload),
  }).then(r=>r.json()).catch(()=>null);
  if(!res || res.ok === false) { showErr(res?.error || "Failed to update"); return; }
  closeEdit();
  await loadConsumers();
  const c = DB.consumers.find(x=>x.id===currentConsumerId);
  $("#selConsumer").textContent = c ? c.name : "—";
});

/* ------------------ Init ------------------ */
loadConsumers();
