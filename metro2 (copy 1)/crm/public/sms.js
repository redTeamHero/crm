import { api as _api, escapeHtml } from "./common.js";

const API = "/api/marketing";

async function api(method, url, body) {
  const opts = { method };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await _api(url, opts);
  if (res.ok === false || (res.status && res.status >= 400)) {
    throw new Error(res.error || res.message || `Request failed (${res.status || "unknown"})`);
  }
  return res;
}

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function toast(el, msg, isErr = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = "sm-status " + (isErr ? "err" : "ok");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "sm-status"; }, 4000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}

/* ── tab switching ───────────────────────────────── */
function switchTab(tab) {
  qsa(".sm-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  qsa(".sm-panel").forEach((p) => p.classList.toggle("active", p.id === "sm-panel-" + tab));
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".sm-tab-btn");
  if (btn && btn.dataset.tab) switchTab(btn.dataset.tab);
});

/* ── modal helpers ───────────────────────────────── */
function openModal(id) {
  const m = qs("#" + id);
  if (m) { m.classList.add("open"); m.setAttribute("aria-hidden", "false"); }
}
function closeModal(id) {
  const m = qs("#" + id);
  if (m) { m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }
}
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("sm-modal-bg")) e.target.classList.remove("open");
});

/* ── data cache ──────────────────────────────────── */
let _templates = [];
let _campaigns = [];

/* ── SMS Templates ───────────────────────────────── */
async function loadSmsTemplates() {
  const res = await api("GET", `${API}/sms-templates`);
  _templates = res.templates || [];
  renderTemplates();
  qs("#statSmsTemplates").textContent = _templates.length;
}

function renderTemplates() {
  const container = qs("#smsTemplateList");
  if (!_templates.length) {
    container.innerHTML = `<div class="sm-empty" style="grid-column:1/-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
      No SMS templates yet. Create one to get started.
    </div>`;
    return;
  }
  container.innerHTML = _templates.map((t) => `
    <div class="sm-card">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="font-semibold text-sm truncate">${escapeHtml(t.title)}</div>
        <span class="sm-badge sm-badge-gold shrink-0">${escapeHtml(t.badge || "SMS")}</span>
      </div>
      <p class="text-xs text-gray-500 line-clamp-3 mb-3">${escapeHtml(t.body || "")}</p>
      <div class="flex items-center justify-between text-xs text-gray-400">
        <span>${escapeHtml(t.segment || "b2c")}</span>
        <span>${fmtDate(t.createdAt)}</span>
      </div>
    </div>`).join("");
}

/* ── SMS Campaigns ───────────────────────────────── */
async function loadSmsCampaigns() {
  const res = await api("GET", `${API}/campaigns`);
  const all = res.campaigns || [];
  _campaigns = all.filter((c) => c.channel === "sms");
  renderSmsCampaigns();
  qs("#statSmsCampaigns").textContent = _campaigns.length;
}

function statusBadge(s) {
  const map = {
    draft: "sm-badge-gray", scheduled: "sm-badge-gold", running: "sm-badge-gold",
    paused: "sm-badge-gray", completed: "sm-badge-green", sent: "sm-badge-green",
  };
  return `<span class="sm-badge ${map[s] || "sm-badge-gray"}">${escapeHtml(s || "draft")}</span>`;
}

function renderSmsCampaigns() {
  const container = qs("#smsCampaignList");
  if (!_campaigns.length) {
    container.innerHTML = `<div class="sm-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
      No SMS campaigns yet. Create one in the Campaigns tab with channel set to SMS.
    </div>`;
    return;
  }
  container.innerHTML = _campaigns.map((c) => `
    <div class="sm-card flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm truncate">${escapeHtml(c.name || c.title || "Untitled")}</span>
          ${statusBadge(c.status)}
        </div>
        <div class="text-xs text-gray-500">${escapeHtml(c.subject || "")}${c.recipientCount != null ? ` · ${c.recipientCount} recipient${c.recipientCount === 1 ? "" : "s"}` : ""}</div>
      </div>
      <div class="text-xs text-gray-400 shrink-0">${fmtDate(c.sentAt || c.updatedAt)}</div>
    </div>`).join("");
}

/* ── New template form ───────────────────────────── */
qs("#btnNewSmsTemplate")?.addEventListener("click", () => {
  qs("#smsTemplateForm")?.reset();
  qs("#smsTplCharCount").textContent = "0 / 160";
  qs("#smsTplCharCount").className = "char-count";
  openModal("smsTemplateModal");
});

[qs("#closeSmsTemplateModal"), qs("#closeSmsTemplateModal2")].forEach((b) =>
  b?.addEventListener("click", () => closeModal("smsTemplateModal"))
);

qs("#smsTplBody")?.addEventListener("input", () => {
  const len = qs("#smsTplBody").value.length;
  const seg = Math.ceil(len / 160) || 1;
  const el = qs("#smsTplCharCount");
  el.textContent = `${len} char${len === 1 ? "" : "s"} · ${seg} SMS segment${seg === 1 ? "" : "s"}`;
  el.className = "char-count" + (len > 320 ? " over" : len > 160 ? " warn" : "");
});

qsa(".sm-merge-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const ta = qs("#smsTplBody");
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    ta.value = val.slice(0, start) + chip.dataset.merge + val.slice(end);
    ta.selectionStart = ta.selectionEnd = start + chip.dataset.merge.length;
    ta.dispatchEvent(new Event("input"));
    ta.focus();
  });
});

qs("#smsTemplateForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = qs("#smsTplStatus");
  const title = qs("#smsTplTitle").value.trim();
  const body = qs("#smsTplBody").value.trim();
  const segment = qs("#smsTplSegment").value;
  if (!title) { toast(status, "Template name is required.", true); return; }
  if (!body) { toast(status, "Message body is required.", true); return; }
  try {
    await api("POST", `${API}/sms-templates`, { title, body, segment });
    closeModal("smsTemplateModal");
    await loadSmsTemplates();
  } catch (err) {
    toast(status, err.message || "Failed to save template.", true);
  }
});

/* ── INIT ────────────────────────────────────────── */
(async function init() {
  await Promise.all([loadSmsTemplates(), loadSmsCampaigns()]);
})();
