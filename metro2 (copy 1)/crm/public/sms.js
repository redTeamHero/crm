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
function show(el) { if (el) { el.classList.remove("hidden"); el.style.display = ""; } }
function hide(el) { if (el) el.style.display = "none"; }
function toast(el, msg, isErr = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = "sm-status " + (isErr ? "err" : "ok");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "sm-status"; }, 5000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return "—"; }
}

/* ── char counter helper ─────────────────────────── */
function updateCharCount(ta, el) {
  if (!ta || !el) return;
  const len = ta.value.length;
  const seg = Math.ceil(len / 160) || 1;
  el.textContent = `${len} char${len === 1 ? "" : "s"} · ${seg} segment${seg === 1 ? "" : "s"}`;
  el.className = "char-count" + (len > 320 ? " over" : len > 160 ? " warn" : "");
}

/* ── tab switching ───────────────────────────────── */
function switchTab(tab) {
  qsa(".sm-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  qsa(".sm-panel").forEach((p) => p.classList.toggle("active", p.id === "sm-panel-" + tab));
  if (tab === "history") loadSmsHistory();
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

/* ── confirm dialog ──────────────────────────────── */
function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    qs("#smsConfirmTitle").textContent = title;
    qs("#smsConfirmMessage").textContent = msg;
    openModal("smsConfirmModal");
    const ok = qs("#smsConfirmOk");
    const cancel = qs("#smsConfirmCancel");
    function cleanup() { closeModal("smsConfirmModal"); ok.removeEventListener("click", onOk); cancel.removeEventListener("click", onCancel); }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

/* ── status badge ────────────────────────────────── */
function statusBadge(s) {
  const map = {
    draft: "sm-badge-gray", scheduled: "sm-badge-blue", running: "sm-badge-blue",
    paused: "sm-badge-gray", completed: "sm-badge-green", sent: "sm-badge-green",
    queued: "sm-badge-gray", failed: "sm-badge-red",
  };
  return `<span class="sm-badge ${map[s] || "sm-badge-gray"}">${escapeHtml(s || "draft")}</span>`;
}

/* ── data cache ──────────────────────────────────── */
let _groups = [];
let _campaigns = [];
let _templates = [];
let _history = [];
const _memberCounts = {};

/* ── GROUPS ──────────────────────────────────────── */
async function loadGroups() {
  try {
    const r = await api("GET", `${API}/groups`);
    _groups = r.groups || [];
    renderGroups();
    populateGroupSelects();
    qs("#statSmsGroups").textContent = _groups.length;
    loadMemberCounts();
  } catch (err) { _groups = []; console.error("Groups load failed:", err?.message); }
}

async function loadMemberCounts() {
  for (const g of _groups) {
    try {
      const r = await api("GET", `${API}/groups/${g.id}/members`);
      _memberCounts[g.id] = (r.members || []).length;
    } catch { _memberCounts[g.id] = 0; }
  }
  renderGroups();
}

function renderGroups() {
  const container = qs("#smsGroupList");
  const q = (qs("#smsGroupSearch")?.value || "").toLowerCase();
  const filtered = _groups.filter((g) => !q || g.name.toLowerCase().includes(q) || (g.description || "").toLowerCase().includes(q));
  if (!filtered.length) {
    container.innerHTML = `<div class="sm-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      ${q ? "No groups match your search." : "No groups yet. Create one to start organizing your audience."}
    </div>`;
    return;
  }
  container.innerHTML = filtered.map((g) => {
    const count = _memberCounts[g.id] ?? "—";
    return `<div class="sm-card flex flex-col sm:flex-row sm:items-center gap-3" data-gid="${escapeHtml(g.id)}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-sm">${escapeHtml(g.name)}</span>
          ${statusBadge(g.status)}
          <span class="sm-badge sm-badge-gray">${count} member${count === 1 ? "" : "s"}</span>
        </div>
        ${g.description ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(g.description)}</p>` : ""}
        <p class="text-xs text-gray-400 mt-1">Created ${fmtDate(g.createdAt)}</p>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button class="btn btn-outline text-xs" data-action="viewMembers" data-gid="${escapeHtml(g.id)}" data-gname="${escapeHtml(g.name)}">Members</button>
        <button class="btn btn-outline text-xs" data-action="editGroup" data-gid="${escapeHtml(g.id)}">Edit</button>
        <button class="btn btn-outline text-xs" data-action="archiveGroup" data-gid="${escapeHtml(g.id)}">${g.status === "archived" ? "Restore" : "Archive"}</button>
        <button class="btn btn-outline text-xs" style="color:#dc2626;border-color:rgba(239,68,68,0.3)" data-action="deleteGroup" data-gid="${escapeHtml(g.id)}" data-gname="${escapeHtml(g.name)}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

qs("#smsGroupSearch")?.addEventListener("input", renderGroups);

qs("#smsGroupList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const gid = btn.dataset.gid;
  if (action === "viewMembers") openGroupMembers(gid, btn.dataset.gname);
  if (action === "editGroup") openEditGroup(gid);
  if (action === "archiveGroup") {
    const g = _groups.find((x) => x.id === gid);
    if (!g) return;
    try { await api("PATCH", `${API}/groups/${gid}`, { status: g.status === "archived" ? "active" : "archived" }); await loadGroups(); }
    catch (err) { alert(err.message); }
  }
  if (action === "deleteGroup") {
    const ok = await confirmDialog("Delete group?", `Delete "${btn.dataset.gname}" and remove all its members. This cannot be undone.`);
    if (!ok) return;
    try { await api("DELETE", `${API}/groups/${gid}`); await loadGroups(); }
    catch (err) { alert(err.message); }
  }
});

function openEditGroup(gid) {
  const g = _groups.find((x) => x.id === gid);
  if (!g) return;
  qs("#smsGroupModalTitle").textContent = "Edit Group";
  qs("#smsGroupId").value = g.id;
  qs("#smsGroupName").value = g.name;
  qs("#smsGroupDescription").value = g.description || "";
  openModal("smsGroupModal");
}

function openNewGroup() {
  qs("#smsGroupModalTitle").textContent = "New Group";
  qs("#smsGroupId").value = "";
  qs("#smsGroupForm").reset();
  openModal("smsGroupModal");
}

qs("#smsGroupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = qs("#smsGroupId").value;
  const body = { name: qs("#smsGroupName").value.trim(), description: qs("#smsGroupDescription").value.trim() };
  try {
    if (id) { await api("PATCH", `${API}/groups/${id}`, body); }
    else { await api("POST", `${API}/groups`, body); }
    closeModal("smsGroupModal");
    await loadGroups();
  } catch (err) { toast(qs("#smsGroupStatus"), err.message || "Failed to save group", true); }
});

[qs("#btnNewSmsGroup")].forEach((b) => b?.addEventListener("click", openNewGroup));
[qs("#closeSmsGroupModal"), qs("#closeSmsGroupModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("smsGroupModal")));

/* ── Group Members ───────────────────────────────── */
let _activeGroupId = null;
let _activeMembers = [];

async function openGroupMembers(gid, gname) {
  _activeGroupId = gid;
  qs("#smsGroupMembersTitle").textContent = gname;
  qs("#smsGroupMembersSubtitle").textContent = "";
  qs("#smsAddMemberInput").value = "";
  qs("#smsMemberSearch").value = "";
  qs("#smsMemberList").innerHTML = `<div class="sm-empty" style="padding:24px 0">Loading...</div>`;
  openModal("smsGroupMembersModal");
  await refreshMembers();
}

async function refreshMembers() {
  if (!_activeGroupId) return;
  try {
    const r = await api("GET", `${API}/groups/${_activeGroupId}/members`);
    _activeMembers = r.members || [];
    renderMemberList();
    _memberCounts[_activeGroupId] = _activeMembers.length;
    renderGroups();
  } catch { qs("#smsMemberList").innerHTML = `<div class="sm-empty">Failed to load members.</div>`; }
}

function renderMemberList() {
  const q = (qs("#smsMemberSearch")?.value || "").toLowerCase();
  const filtered = _activeMembers.filter((m) => !q || m.clientId.toLowerCase().includes(q));
  qs("#smsGroupMembersSubtitle").textContent = `${_activeMembers.length} member${_activeMembers.length === 1 ? "" : "s"}`;
  if (!filtered.length) {
    qs("#smsMemberList").innerHTML = `<div class="sm-empty" style="padding:24px 0">${q ? "No members match your search." : "No members yet. Add a client ID or email above."}</div>`;
    return;
  }
  qs("#smsMemberList").innerHTML = filtered.map((m) => `
    <div class="sm-card flex items-center justify-between gap-2" style="border-radius:10px;padding:10px 14px">
      <span class="text-sm font-mono text-gray-700">${escapeHtml(m.clientId)}</span>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400">${fmtDate(m.addedAt)}</span>
        <button class="text-red-400 text-xs font-bold px-2" data-action="removeMember" data-cid="${escapeHtml(m.clientId)}">&times;</button>
      </div>
    </div>`).join("");
}

qs("#smsMemberSearch")?.addEventListener("input", renderMemberList);

qs("#smsMemberList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action='removeMember']");
  if (!btn || !_activeGroupId) return;
  const ok = await confirmDialog("Remove member?", `Remove ${btn.dataset.cid} from this group?`);
  if (!ok) return;
  try { await api("DELETE", `${API}/groups/${_activeGroupId}/members/${btn.dataset.cid}`); await refreshMembers(); }
  catch (err) { toast(qs("#smsMemberStatus"), err.message || "Failed to remove member", true); }
});

qs("#smsAddMemberBtn")?.addEventListener("click", async () => {
  const cid = qs("#smsAddMemberInput").value.trim();
  if (!cid || !_activeGroupId) return;
  try {
    await api("POST", `${API}/groups/${_activeGroupId}/members`, { clientId: cid });
    qs("#smsAddMemberInput").value = "";
    toast(qs("#smsMemberStatus"), "Member added.");
    await refreshMembers();
  } catch (err) { toast(qs("#smsMemberStatus"), err.message || "Failed to add member", true); }
});

qs("#closeSmsGroupMembersModal")?.addEventListener("click", () => closeModal("smsGroupMembersModal"));
qs("#closeSmsGroupMembersModal2")?.addEventListener("click", () => closeModal("smsGroupMembersModal"));
qs("#btnSmsSendToGroup")?.addEventListener("click", () => {
  closeModal("smsGroupMembersModal");
  switchTab("send");
  qs("#ssRecipientType").value = "group";
  handleRecipientTypeChange();
  if (_activeGroupId) qs("#ssGroupId").value = _activeGroupId;
});

/* ── populate selects ────────────────────────────── */
function populateGroupSelects() {
  const activeGroups = _groups.filter((g) => g.status === "active");
  const opts = `<option value="">— select a group —</option>` + activeGroups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
  [qs("#ssGroupId"), qs("#smsCampGroupId")].forEach((el) => {
    if (!el) return;
    const val = el.value;
    el.innerHTML = opts;
    el.value = val;
  });
}

function populateTemplateSelect() {
  const opts = `<option value="">Use template...</option>` + _templates.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join("");
  const el = qs("#ssTemplateSelect");
  if (el) el.innerHTML = opts;
}

/* ── TEMPLATES ───────────────────────────────────── */
async function loadSmsTemplates() {
  try {
    const r = await api("GET", `${API}/sms-templates`);
    _templates = r.templates || [];
    renderTemplates();
    populateTemplateSelect();
  } catch (err) { _templates = []; console.error("Templates load failed:", err?.message); }
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

/* ── Template modal ──────────────────────────────── */
function openNewTemplate() {
  qs("#smsTplModalTitle").textContent = "New SMS Template";
  qs("#smsTplId").value = "";
  qs("#smsTemplateForm").reset();
  qs("#smsTplCharCount").textContent = "0 / 160";
  qs("#smsTplCharCount").className = "char-count";
  openModal("smsTemplateModal");
}

[qs("#btnNewSmsTemplate"), qs("#btnNewSmsTemplate2")].forEach((b) => b?.addEventListener("click", openNewTemplate));
[qs("#closeSmsTemplateModal"), qs("#closeSmsTemplateModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("smsTemplateModal")));

qs("#smsTplBody")?.addEventListener("input", () => {
  updateCharCount(qs("#smsTplBody"), qs("#smsTplCharCount"));
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
  } catch (err) { toast(status, err.message || "Failed to save template.", true); }
});

/* ── merge chips in template modal ──────────────── */
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".sm-merge-chip");
  if (!chip) return;
  const merge = chip.dataset.merge;
  const modal = chip.closest(".sm-modal");
  const ta = modal?.querySelector("textarea") || qs("#ssBody");
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  ta.value = ta.value.slice(0, start) + merge + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + merge.length;
  ta.dispatchEvent(new Event("input"));
  ta.focus();
});

/* ── CAMPAIGNS ───────────────────────────────────── */
async function loadSmsCampaigns() {
  try {
    const r = await api("GET", `${API}/campaigns`);
    const all = r.campaigns || [];
    _campaigns = all.filter((c) => c.channel === "sms");
    renderCampaigns();
    qs("#statSmsCampaigns").textContent = _campaigns.length;
  } catch (err) { _campaigns = []; console.error("Campaigns load failed:", err?.message); }
}

function renderCampaigns() {
  const container = qs("#smsCampaignList");
  if (!_campaigns.length) {
    container.innerHTML = `<div class="sm-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
      No SMS campaigns yet. Create one to get started.
    </div>`;
    return;
  }
  container.innerHTML = _campaigns.map((c) => {
    const group = _groups.find((g) => g.id === c.groupId);
    const groupName = group ? group.name : (c.groupId ? "Unknown group" : "All contacts");
    return `<div class="sm-card flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm truncate">${escapeHtml(c.name || "Untitled")}</span>
          ${statusBadge(c.status)}
          <span class="sm-badge sm-badge-gray text-xs">${escapeHtml(c.frequency || "immediate")}</span>
        </div>
        <p class="text-xs text-gray-500 line-clamp-2">${escapeHtml(c.body || c.subject || "—")}</p>
        <div class="text-xs text-gray-400 mt-1">${escapeHtml(groupName)} · Updated ${fmtDate(c.updatedAt)}</div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button class="btn btn-outline text-xs" data-camp-action="edit" data-cid="${escapeHtml(c.id)}">Edit</button>
        <button class="btn btn-outline text-xs" style="color:#dc2626;border-color:rgba(239,68,68,0.3)" data-camp-action="delete" data-cid="${escapeHtml(c.id)}" data-cname="${escapeHtml(c.name || "Untitled")}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

qs("#smsCampaignList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-camp-action]");
  if (!btn) return;
  const action = btn.dataset.campAction;
  const cid = btn.dataset.cid;
  if (action === "edit") openEditCampaign(cid);
  if (action === "delete") {
    const ok = await confirmDialog("Delete campaign?", `Delete "${btn.dataset.cname}"? This cannot be undone.`);
    if (!ok) return;
    try { await api("DELETE", `${API}/campaigns/${cid}`); await loadSmsCampaigns(); }
    catch (err) { alert(err.message); }
  }
});

function openNewCampaign() {
  qs("#smsCampModalTitle").textContent = "New SMS Campaign";
  qs("#smsCampId").value = "";
  qs("#smsCampaignForm").reset();
  qs("#smsCampCharCount").textContent = "0 / 160";
  qs("#smsCampCharCount").className = "char-count";
  openModal("smsCampaignModal");
}

function openEditCampaign(cid) {
  const c = _campaigns.find((x) => x.id === cid);
  if (!c) return;
  qs("#smsCampModalTitle").textContent = "Edit SMS Campaign";
  qs("#smsCampId").value = c.id;
  qs("#smsCampName").value = c.name || "";
  qs("#smsCampGroupId").value = c.groupId || "";
  qs("#smsCampStatus").value = c.status || "draft";
  qs("#smsCampFrequency").value = c.frequency || "immediate";
  qs("#smsCampDescription").value = c.description || "";
  qs("#smsCampBody").value = c.body || c.subject || "";
  updateCharCount(qs("#smsCampBody"), qs("#smsCampCharCount"));
  openModal("smsCampaignModal");
}

[qs("#btnNewSmsCampaign"), qs("#btnNewSmsCampaign2")].forEach((b) => b?.addEventListener("click", openNewCampaign));
[qs("#closeSmsCampaignModal"), qs("#closeSmsCampaignModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("smsCampaignModal")));

qs("#smsCampBody")?.addEventListener("input", () => {
  updateCharCount(qs("#smsCampBody"), qs("#smsCampCharCount"));
});

qs("#smsCampaignForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status2 = qs("#smsCampStatus2");
  const id = qs("#smsCampId").value;
  const name = qs("#smsCampName").value.trim();
  const body = qs("#smsCampBody").value.trim();
  if (!name) { toast(status2, "Campaign name is required.", true); return; }
  if (!body) { toast(status2, "Message body is required.", true); return; }
  const payload = {
    name,
    channel: "sms",
    groupId: qs("#smsCampGroupId").value || null,
    status: qs("#smsCampStatus").value,
    frequency: qs("#smsCampFrequency").value,
    description: qs("#smsCampDescription").value.trim(),
    body,
    subject: body.slice(0, 80),
  };
  try {
    if (id) { await api("PATCH", `${API}/campaigns/${id}`, payload); }
    else { await api("POST", `${API}/campaigns`, payload); }
    closeModal("smsCampaignModal");
    await loadSmsCampaigns();
  } catch (err) { toast(status2, err.message || "Failed to save campaign.", true); }
});

/* ── SEND SMS ────────────────────────────────────── */
function handleRecipientTypeChange() {
  const type = qs("#ssRecipientType").value;
  hide(qs("#ssPhoneRow"));
  hide(qs("#ssGroupRow"));
  hide(qs("#ssMultipleRow"));
  if (type === "phone") show(qs("#ssPhoneRow"));
  else if (type === "group") show(qs("#ssGroupRow"));
  else if (type === "multiple") show(qs("#ssMultipleRow"));
}

qs("#ssRecipientType")?.addEventListener("change", handleRecipientTypeChange);

qs("#btnSendSms")?.addEventListener("click", () => switchTab("send"));

qs("#ssTemplateSelect")?.addEventListener("change", () => {
  const tid = qs("#ssTemplateSelect").value;
  if (!tid) return;
  const tpl = _templates.find((t) => t.id === tid);
  if (!tpl) return;
  qs("#ssBody").value = tpl.body || "";
  qs("#ssBody").dispatchEvent(new Event("input"));
});

qs("#ssBody")?.addEventListener("input", () => {
  updateCharCount(qs("#ssBody"), qs("#ssCharCount"));
  updateSmsPreview();
});

function updateSmsPreview() {
  const body = (qs("#ssBody")?.value || "").replace(/{{(\w+)}}/g, (_, k) => ({
    first_name: "Alex", last_name: "Ramirez", phone: "(512) 555-0199",
    credit_score: "687", group_name: "New Leads",
  })[k] || `{{${k}}}`);
  const el = qs("#ssPreview");
  if (el) el.textContent = body || "Compose a message to see a preview.";
}

qs("#sendSmsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = qs("#ssStatus");
  const type = qs("#ssRecipientType").value;
  const body = qs("#ssBody").value.trim();
  if (!body) { toast(status, "Message body is required.", true); return; }

  let to = null, groupId = null;
  if (type === "phone") {
    to = qs("#ssPhone").value.trim();
    if (!to) { toast(status, "Enter a phone number.", true); return; }
  } else if (type === "multiple") {
    to = qs("#ssMultiplePhones").value.trim();
    if (!to) { toast(status, "Enter at least one phone number.", true); return; }
  } else if (type === "group") {
    groupId = qs("#ssGroupId").value;
    if (!groupId) { toast(status, "Select a group.", true); return; }
  }

  const ssSendBtn = qs("#ssSendNow");
  ssSendBtn.disabled = true;
  ssSendBtn.textContent = "Sending…";
  try {
    const result = await api("POST", `${API}/sms/send`, { to, body, groupId, recipientType: type });
    toast(status, result.message || "SMS queued.");
    qs("#sendSmsForm").reset();
    handleRecipientTypeChange();
    qs("#ssCharCount").textContent = "0 / 160";
    qs("#ssCharCount").className = "char-count";
    qs("#ssPreview").textContent = "Compose a message to see a preview.";
    await loadSmsHistory();
  } catch (err) {
    toast(status, err.message || "Failed to send SMS.", true);
  } finally {
    ssSendBtn.disabled = false;
    ssSendBtn.textContent = "Send Now";
  }
});

/* ── HISTORY ─────────────────────────────────────── */
async function loadSmsHistory() {
  try {
    const r = await api("GET", `${API}/history?channel=sms&limit=100`);
    _history = r.history || [];
    renderHistory();
    qs("#statSmsSent").textContent = _history.filter((h) => h.status === "sent" || h.status === "queued").length;
  } catch (err) { _history = []; renderHistory(); console.error("History load failed:", err?.message); }
}

function renderHistory() {
  const container = qs("#smsHistoryList");
  if (!_history.length) {
    container.innerHTML = `<div class="sm-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      No SMS history yet. Sent messages will appear here.
    </div>`;
    return;
  }
  container.innerHTML = `<div class="space-y-2">` + _history.map((h) => `
    <div class="sm-card flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          ${statusBadge(h.status)}
          <span class="text-sm font-medium truncate">${escapeHtml(h.subject || h.recipientId || "—")}</span>
        </div>
        <div class="text-xs text-gray-400">
          ${h.recipientType === "group" ? `Group · ${escapeHtml(h.groupName || h.groupId || "—")}` : `To: ${escapeHtml(h.recipientId || "—")}`}
          ${h.recipientCount != null ? ` · ${h.recipientCount} recipient${h.recipientCount === 1 ? "" : "s"}` : ""}
        </div>
        ${h.errorMessage ? `<div class="text-xs text-red-500 mt-1">${escapeHtml(h.errorMessage)}</div>` : ""}
      </div>
      <div class="text-xs text-gray-400 shrink-0">${fmtDateTime(h.sentAt)}</div>
    </div>`).join("") + `</div>`;
}

qs("#btnRefreshSmsHistory")?.addEventListener("click", loadSmsHistory);

/* ── INIT ────────────────────────────────────────── */
(async function init() {
  await Promise.all([loadGroups(), loadSmsCampaigns(), loadSmsTemplates(), loadSmsHistory()]);
  handleRecipientTypeChange();
})();
