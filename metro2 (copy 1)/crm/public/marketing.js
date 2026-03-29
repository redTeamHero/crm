import { api as _api, escapeHtml } from "./common.js";

const API = "/api/marketing";

/* ── api wrapper (method, url, body) → common.js api(url, opts) ── */
async function api(method, url, body) {
  const opts = { method };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await _api(url, opts);
  if (res.ok === false || (res.status && res.status >= 400)) {
    throw new Error(res.error || res.message || `Request failed (${res.status || "unknown"})`);
  }
  return res;
}

/* ── helpers ─────────────────────────────────────── */
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function show(el) { if (el) { el.classList.remove("hidden"); el.style.display = ""; } }
function hide(el) { if (el) el.style.display = "none"; }
function toast(el, msg, isErr = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = "em-status " + (isErr ? "err" : "ok");
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = "em-status"; }, 4000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}
function statusBadge(s) {
  const map = { draft: "em-badge-gray", scheduled: "em-badge-blue", running: "em-badge-blue", sent: "em-badge-green", completed: "em-badge-green", paused: "em-badge-gold", failed: "em-badge-red", queued: "em-badge-gray", active: "em-badge-green", archived: "em-badge-gray" };
  return `<span class="em-badge ${map[s] || "em-badge-gray"}">${escapeHtml(s || "—")}</span>`;
}

/* ── confirm helper ──────────────────────────────── */
function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    qs("#confirmTitle").textContent = title;
    qs("#confirmMessage").textContent = msg;
    openModal("confirmModal");
    const ok = qs("#confirmOk");
    const cancel = qs("#confirmCancel");
    function cleanup() { closeModal("confirmModal"); ok.removeEventListener("click", onOk); cancel.removeEventListener("click", onCancel); }
    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

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
  if (e.target.classList.contains("em-modal-bg")) { e.target.classList.remove("open"); }
});

/* ── tabs ────────────────────────────────────────── */
qsa(".em-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    qsa(".em-tab-btn").forEach((b) => b.classList.remove("active"));
    qsa(".em-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = qs("#panel-" + btn.dataset.tab);
    if (panel) panel.classList.add("active");
    if (btn.dataset.tab === "history") loadHistory();
  });
});

/* ── page header Send Email button ──────────────── */
qs("#btnSendEmail")?.addEventListener("click", () => {
  qs("[data-tab='send']")?.click();
});

/* ── cache ───────────────────────────────────────── */
let _groups = [];
let _campaigns = [];
let _sequences = [];
let _templates = [];
let _history = [];

/* ── data loaders ────────────────────────────────── */
async function loadGroups() {
  try {
    const r = await api("GET", `${API}/groups`);
    _groups = r.groups || [];
    renderGroups();
    populateGroupSelects();
    updateStats();
    loadMemberCounts();
  } catch { _groups = []; }
}
async function loadCampaigns() {
  try {
    const r = await api("GET", `${API}/campaigns`);
    _campaigns = r.campaigns || [];
    renderCampaigns();
    updateStats();
  } catch { _campaigns = []; }
}
async function loadSequences() {
  try {
    const r = await api("GET", `${API}/email/sequences`);
    _sequences = r.sequences || [];
    renderSequences();
    updateStats();
  } catch { _sequences = []; }
}
async function loadTemplates() {
  try {
    const r = await api("GET", `${API}/templates`);
    _templates = r.templates || [];
    renderTemplates();
    populateTemplateSelects();
  } catch { _templates = []; }
}
async function loadHistory() {
  try {
    const r = await api("GET", `${API}/history?limit=100`);
    _history = r.history || [];
    renderHistory();
    updateStats();
  } catch { _history = []; renderHistory(); }
}

/* ── stats ───────────────────────────────────────── */
function updateStats() {
  const eg = qs("#statGroups"); if (eg) eg.textContent = _groups.length;
  const ec = qs("#statCampaigns"); if (ec) ec.textContent = _campaigns.length;
  const es = qs("#statSequences"); if (es) es.textContent = _sequences.length;
  const eh = qs("#statHistory"); if (eh) eh.textContent = _history.length;
}

/* ── populate selects ────────────────────────────── */
function populateGroupSelects() {
  const activeGroups = _groups.filter((g) => g.status === "active");
  const opts = `<option value="">— select a group —</option>` + activeGroups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
  [qs("#seGroupId"), qs("#campGroupId")].forEach((el) => {
    if (!el) return;
    const val = el.value;
    el.innerHTML = opts;
    el.value = val;
  });
  const seqEl = qs("#seqGroupId");
  if (seqEl) {
    const val = seqEl.value;
    seqEl.innerHTML = `<option value="">All contacts</option>` + activeGroups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join("");
    seqEl.value = val;
  }
}

function populateTemplateSelects() {
  const opts = `<option value="">Use template...</option>` + _templates.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join("");
  [qs("#seTemplateSelect"), qs("#campTemplateSelect")].forEach((el) => { if (el) el.innerHTML = opts; });
}

/* ── member count cache ──────────────────────────── */
const _memberCounts = {};

async function loadMemberCounts() {
  for (const g of _groups) {
    try {
      const r = await api("GET", `${API}/groups/${g.id}/members`);
      _memberCounts[g.id] = (r.members || []).length;
    } catch { _memberCounts[g.id] = 0; }
  }
  renderGroups();
}

/* ── GROUPS ──────────────────────────────────────── */
function renderGroups() {
  const container = qs("#groupList");
  const q = (qs("#groupSearch")?.value || "").toLowerCase();
  const filtered = _groups.filter((g) => !q || g.name.toLowerCase().includes(q) || (g.description || "").toLowerCase().includes(q));
  if (!filtered.length) {
    container.innerHTML = `<div class="em-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>${q ? "No groups match your search." : "No groups yet. Create one to start organizing your audience."}</div>`;
    return;
  }
  container.innerHTML = filtered.map((g) => {
    const count = _memberCounts[g.id] ?? "—";
    return `<div class="em-card flex flex-col sm:flex-row sm:items-center gap-3" data-gid="${escapeHtml(g.id)}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-sm">${escapeHtml(g.name)}</span>
          ${statusBadge(g.status)}
          <span class="em-badge em-badge-gray">${count} member${count === 1 ? "" : "s"}</span>
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

qs("#groupSearch")?.addEventListener("input", renderGroups);

qs("#groupList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const gid = btn.dataset.gid;
  if (action === "viewMembers") openGroupMembers(gid, btn.dataset.gname);
  if (action === "editGroup") openEditGroup(gid);
  if (action === "archiveGroup") {
    const g = _groups.find((x) => x.id === gid);
    if (!g) return;
    await api("PATCH", `${API}/groups/${gid}`, { status: g.status === "archived" ? "active" : "archived" });
    await loadGroups();
  }
  if (action === "deleteGroup") {
    const ok = await confirmDialog("Delete group?", `Delete "${btn.dataset.gname}" and remove all its members. This cannot be undone.`);
    if (!ok) return;
    await api("DELETE", `${API}/groups/${gid}`);
    await loadGroups();
  }
});

function openEditGroup(gid) {
  const g = _groups.find((x) => x.id === gid);
  if (!g) return;
  qs("#groupModalTitle").textContent = "Edit Group";
  qs("#groupId").value = g.id;
  qs("#groupName").value = g.name;
  qs("#groupDescription").value = g.description || "";
  openModal("groupModal");
}

function openNewGroup() {
  qs("#groupModalTitle").textContent = "New Group";
  qs("#groupId").value = "";
  qs("#groupForm").reset();
  openModal("groupModal");
}

qs("#groupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = qs("#groupId").value;
  const body = { name: qs("#groupName").value.trim(), description: qs("#groupDescription").value.trim() };
  try {
    if (id) { await api("PATCH", `${API}/groups/${id}`, body); }
    else { await api("POST", `${API}/groups`, body); }
    closeModal("groupModal");
    await loadGroups();
  } catch (err) { toast(qs("#groupStatus"), err.message || "Failed to save group", true); }
});

[qs("#btnNewGroup"), qs("#btnNewGroup2")].forEach((b) => b?.addEventListener("click", openNewGroup));
[qs("#closeGroupModal"), qs("#closeGroupModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("groupModal")));

/* ── Group members ───────────────────────────────── */
let _activeGroupId = null;
let _activeMembers = [];

async function openGroupMembers(gid, gname) {
  _activeGroupId = gid;
  qs("#groupMembersTitle").textContent = gname;
  qs("#groupMembersSubtitle").textContent = "";
  qs("#addMemberInput").value = "";
  qs("#memberSearch").value = "";
  qs("#memberList").innerHTML = `<div class="em-empty" style="padding:24px 0">Loading...</div>`;
  openModal("groupMembersModal");
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
  } catch { qs("#memberList").innerHTML = `<div class="em-empty">Failed to load members.</div>`; }
}

function renderMemberList() {
  const q = (qs("#memberSearch")?.value || "").toLowerCase();
  const filtered = _activeMembers.filter((m) => !q || m.clientId.toLowerCase().includes(q));
  qs("#groupMembersSubtitle").textContent = `${_activeMembers.length} member${_activeMembers.length === 1 ? "" : "s"}`;
  if (!filtered.length) {
    qs("#memberList").innerHTML = `<div class="em-empty" style="padding:24px 0">${q ? "No members match your search." : "No members yet. Add a client ID or email above."}</div>`;
    return;
  }
  qs("#memberList").innerHTML = filtered.map((m) => `
    <div class="em-card flex items-center justify-between gap-2" style="border-radius:10px;padding:10px 14px">
      <span class="text-sm font-mono text-gray-700">${escapeHtml(m.clientId)}</span>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400">${fmtDate(m.addedAt)}</span>
        <button class="btn-icon text-xs text-red-400" data-action="removeMember" data-cid="${escapeHtml(m.clientId)}">&times;</button>
      </div>
    </div>`).join("");
}

qs("#memberSearch")?.addEventListener("input", renderMemberList);

qs("#memberList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action='removeMember']");
  if (!btn || !_activeGroupId) return;
  const ok = await confirmDialog("Remove member?", `Remove ${btn.dataset.cid} from this group?`);
  if (!ok) return;
  try { await api("DELETE", `${API}/groups/${_activeGroupId}/members/${btn.dataset.cid}`); await refreshMembers(); }
  catch (err) { toast(qs("#memberStatus"), err.message || "Failed to remove member", true); }
});

qs("#addMemberBtn")?.addEventListener("click", async () => {
  const cid = qs("#addMemberInput").value.trim();
  if (!cid || !_activeGroupId) return;
  try {
    await api("POST", `${API}/groups/${_activeGroupId}/members`, { clientId: cid });
    qs("#addMemberInput").value = "";
    toast(qs("#memberStatus"), "Member added.");
    await refreshMembers();
  } catch (err) { toast(qs("#memberStatus"), err.message || "Failed to add member", true); }
});

qs("#closeGroupMembersModal")?.addEventListener("click", () => closeModal("groupMembersModal"));
qs("#btnSendToGroup")?.addEventListener("click", () => {
  closeModal("groupMembersModal");
  openSendToGroup(_activeGroupId);
});
qs("#btnCampaignForGroup")?.addEventListener("click", () => {
  closeModal("groupMembersModal");
  openNewCampaignForGroup(_activeGroupId);
});

/* ── SEND EMAIL ──────────────────────────────────── */
function openSendToGroup(gid) {
  qs("[data-tab='send']")?.click();
  qs("#seRecipientType").value = "group";
  handleRecipientTypeChange();
  if (gid) qs("#seGroupId").value = gid;
}

function handleRecipientTypeChange() {
  const type = qs("#seRecipientType").value;
  hide(qs("#seClientRow"));
  hide(qs("#seGroupRow"));
  hide(qs("#seMultipleRow"));
  if (type === "client") show(qs("#seClientRow"));
  else if (type === "group") show(qs("#seGroupRow"));
  else if (type === "multiple") show(qs("#seMultipleRow"));
}

qs("#seRecipientType")?.addEventListener("change", handleRecipientTypeChange);

qs("#seTemplateSelect")?.addEventListener("change", () => {
  const tid = qs("#seTemplateSelect").value;
  if (!tid) return;
  const tpl = _templates.find((t) => t.id === tid);
  if (!tpl) return;
  if (tpl.title && !qs("#seSubject").value) qs("#seSubject").value = tpl.title;
  if (tpl.html) qs("#seBody").value = tpl.html;
  updatePreview();
});

function updatePreview() {
  const body = qs("#seBody")?.value || "";
  const preview = body.replace(/{{(\w+)}}/g, (_, k) => ({ first_name: "Alex", last_name: "Ramirez", email: "alex@example.com", phone: "(512) 555-0199", credit_score: "687", group_name: "New Leads" })[k] || `{{${k}}}`);
  const el = qs("#sePreview");
  if (el) el.textContent = preview || "Compose a message to see a preview.";
}

qs("#seBody")?.addEventListener("input", updatePreview);
qs("#seSubject")?.addEventListener("input", updatePreview);

qsa(".em-merge-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const target = chip.closest("form")?.querySelector("textarea") || qs("#seBody");
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.value = target.value.slice(0, start) + chip.dataset.merge + target.value.slice(end);
    target.focus();
    updatePreview();
  });
});

async function sendEmail(isDraft = false, isTest = false) {
  const type = qs("#seRecipientType").value;
  const subject = qs("#seSubject").value.trim();
  if (!subject) { toast(qs("#seStatus"), "Subject is required.", true); return; }

  if (isTest) {
    try {
      await api("POST", `${API}/history`, { type: "test", subject: `[TEST] ${subject}`, recipientType: "client", status: "queued" });
      toast(qs("#seStatus"), "Test email queued to History. Connect a delivery provider to receive it.");
      await loadHistory();
    } catch (err) { toast(qs("#seStatus"), err.message || "Failed to queue test email.", true); }
    return;
  }

  let recipientId = null, groupId = null;
  if (type === "client") {
    recipientId = qs("#seClientId").value.trim();
    if (!recipientId) { toast(qs("#seStatus"), "Enter a client ID or email.", true); return; }
  } else if (type === "group") {
    groupId = qs("#seGroupId").value;
    if (!groupId) { toast(qs("#seStatus"), "Select a group.", true); return; }
  } else if (type === "multiple") {
    recipientId = qs("#seMultipleIds").value.trim();
    if (!recipientId) { toast(qs("#seStatus"), "Enter at least one recipient.", true); return; }
  }

  const body = qs("#seBody").value.trim();
  const payload = { subject, body, recipientType: type === "multiple" ? "client" : type, recipientId, groupId };

  try {
    if (isDraft) {
      await api("POST", `${API}/history`, { ...payload, type: "one-time", status: "draft" });
      toast(qs("#seStatus"), "Draft saved to History.");
    } else {
      await api("POST", `${API}/email/send`, payload);
      toast(qs("#seStatus"), "Email queued. Check History for status.");
      qs("#sendEmailForm").reset();
      handleRecipientTypeChange();
    }
    await loadHistory();
  } catch (err) { toast(qs("#seStatus"), err.message || "Failed to send email.", true); }
}

qs("#sendEmailForm")?.addEventListener("submit", (e) => { e.preventDefault(); sendEmail(false); });
qs("#seSaveDraft")?.addEventListener("click", () => sendEmail(true));
qs("#seSendTest")?.addEventListener("click", () => sendEmail(false, true));

/* ── CAMPAIGNS ───────────────────────────────────── */
function renderCampaigns() {
  const container = qs("#campaignList");
  if (!_campaigns.length) {
    container.innerHTML = `<div class="em-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>No campaigns yet. Create one to get started.</div>`;
    return;
  }
  container.innerHTML = _campaigns.map((c) => {
    const group = _groups.find((g) => g.id === c.groupId || g.id === c.segment);
    const groupName = group ? group.name : (c.segment || "—");
    const recipientCount = c.recipientCount != null ? `${c.recipientCount} recipient${c.recipientCount === 1 ? "" : "s"}` : null;
    const sentDate = c.sentAt ? `Sent ${fmtDate(c.sentAt)}` : `Updated ${fmtDate(c.updatedAt)}`;
    return `<div class="em-card flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-sm">${escapeHtml(c.name)}</span>
          ${statusBadge(c.status)}
          ${recipientCount ? `<span class="em-badge em-badge-gray">${recipientCount}</span>` : ""}
        </div>
        <p class="text-xs text-gray-500 mt-1">Group: ${escapeHtml(groupName)} &bull; ${sentDate}</p>
        ${c.subject ? `<p class="text-xs text-gray-400 mt-0.5">Subject: ${escapeHtml(c.subject)}</p>` : ""}
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button class="btn btn-outline text-xs" data-action="editCampaign" data-cid="${escapeHtml(c.id)}">Edit</button>
        <button class="btn btn-outline text-xs" data-action="dupCampaign" data-cid="${escapeHtml(c.id)}">Duplicate</button>
        <button class="btn btn-outline text-xs" style="color:#dc2626;border-color:rgba(239,68,68,0.3)" data-action="deleteCampaign" data-cid="${escapeHtml(c.id)}" data-cname="${escapeHtml(c.name)}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

qs("#campaignList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const cid = btn.dataset.cid;
  if (action === "editCampaign") openEditCampaign(cid);
  if (action === "dupCampaign") await duplicateCampaign(cid);
  if (action === "deleteCampaign") {
    const ok = await confirmDialog("Delete campaign?", `Delete "${btn.dataset.cname}"? This cannot be undone.`);
    if (!ok) return;
    try { await api("DELETE", `${API}/campaigns/${cid}`); await loadCampaigns(); }
    catch (err) { alert(err.message); }
  }
});

async function duplicateCampaign(cid) {
  const c = _campaigns.find((x) => x.id === cid);
  if (!c) return;
  try {
    await api("POST", `${API}/campaigns`, { name: c.name + " (copy)", status: "draft", segment: c.segment, subject: c.subject, body: c.body, groupId: c.groupId });
    await loadCampaigns();
  } catch (err) { alert(err.message); }
}

function openNewCampaignForGroup(gid) {
  qs("[data-tab='campaigns']")?.click();
  resetCampaignForm();
  populateGroupSelects();
  if (gid) qs("#campGroupId").value = gid;
  openModal("campaignModal");
}

function resetCampaignForm() {
  qs("#campaignModalTitle").textContent = "New Campaign";
  qs("#campaignId").value = "";
  qs("#campaignForm").reset();
  qs("#campStatus2").className = "em-status";
  populateGroupSelects();
  populateTemplateSelects();
}

function openEditCampaign(cid) {
  const c = _campaigns.find((x) => x.id === cid);
  if (!c) return;
  qs("#campaignModalTitle").textContent = "Edit Campaign";
  qs("#campaignId").value = c.id;
  qs("#campName").value = c.name || "";
  qs("#campStatus").value = c.status || "draft";
  qs("#campSubject").value = c.subject || "";
  qs("#campBody").value = c.body || "";
  populateGroupSelects();
  populateTemplateSelects();
  qs("#campGroupId").value = c.groupId || c.segment || "";
  openModal("campaignModal");
}

qs("#campTemplateSelect")?.addEventListener("change", () => {
  const tid = qs("#campTemplateSelect").value;
  if (!tid) return;
  const tpl = _templates.find((t) => t.id === tid);
  if (!tpl) return;
  if (tpl.title && !qs("#campSubject").value) qs("#campSubject").value = tpl.title;
  if (tpl.html) qs("#campBody").value = tpl.html;
});

async function saveCampaignForm(sendNow = false) {
  const id = qs("#campaignId").value;
  const groupId = qs("#campGroupId").value;
  const payload = {
    name: qs("#campName").value.trim(),
    status: sendNow ? "running" : qs("#campStatus").value,
    segment: groupId || "b2c",
    groupId: groupId || undefined,
    subject: qs("#campSubject").value.trim(),
    body: qs("#campBody").value.trim(),
    scheduledAt: qs("#campScheduledAt")?.value || undefined,
  };
  if (!payload.name) { toast(qs("#campStatus2"), "Campaign name is required.", true); return; }
  if (sendNow && !groupId) { toast(qs("#campStatus2"), "Select a group before sending.", true); return; }
  try {
    let campaign;
    if (id) { const r = await api("PATCH", `${API}/campaigns/${id}`, payload); campaign = r.campaign; }
    else { const r = await api("POST", `${API}/campaigns`, payload); campaign = r.campaign; }
    if (sendNow && campaign) {
      const group = _groups.find((g) => g.id === groupId);
      await api("POST", `${API}/history`, {
        type: "campaign", subject: payload.subject,
        recipientType: "group", groupId: groupId || null,
        groupName: group ? group.name : null,
        campaignId: campaign.id, status: "queued",
        recipientCount: groupId ? (_memberCounts[groupId] ?? null) : null,
      });
    }
    closeModal("campaignModal");
    const tasks = [loadCampaigns()];
    if (sendNow) tasks.push(loadHistory());
    await Promise.all(tasks);
  } catch (err) { toast(qs("#campStatus2"), err.message || "Failed to save campaign.", true); }
}

qs("#campaignForm")?.addEventListener("submit", (e) => { e.preventDefault(); saveCampaignForm(false); });
qs("#campSendNowBtn")?.addEventListener("click", () => saveCampaignForm(true));

[qs("#btnNewCampaign"), qs("#btnNewCampaign2")].forEach((b) => b?.addEventListener("click", () => { resetCampaignForm(); openModal("campaignModal"); }));
[qs("#closeCampaignModal"), qs("#closeCampaignModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("campaignModal")));

/* ── SEQUENCES ───────────────────────────────────── */
let _seqStepIndex = 0;

function renderSequences() {
  const container = qs("#sequenceList");
  if (!_sequences.length) {
    container.innerHTML = `<div class="em-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg>No sequences yet. Create one to build automated email flows.</div>`;
    return;
  }
  container.innerHTML = _sequences.map((s) => {
    const group = _groups.find((g) => g.id === s.groupId || g.id === s.segment);
    const groupName = group ? group.name : (s.segment || "All contacts");
    return `<div class="em-card flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-sm">${escapeHtml(s.title)}</span>
          ${statusBadge(s.status || "active")}
        </div>
        <p class="text-xs text-gray-500 mt-1">Audience: ${escapeHtml(groupName)} &bull; ${(s.steps || []).length} step${(s.steps || []).length === 1 ? "" : "s"} &bull; Updated ${fmtDate(s.createdAt)}</p>
        ${s.description ? `<p class="text-xs text-gray-400 mt-0.5">${escapeHtml(s.description)}</p>` : ""}
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button class="btn btn-outline text-xs" data-action="editSeq" data-sid="${escapeHtml(s.id)}">Edit</button>
        <button class="btn btn-outline text-xs" data-action="toggleSeq" data-sid="${escapeHtml(s.id)}" data-sstatus="${escapeHtml(s.status || "active")}">${(s.status || "active") === "paused" ? "Activate" : "Pause"}</button>
        <button class="btn btn-outline text-xs" data-action="dupSeq" data-sid="${escapeHtml(s.id)}">Duplicate</button>
        <button class="btn btn-outline text-xs" style="color:#dc2626;border-color:rgba(239,68,68,0.3)" data-action="deleteSeq" data-sid="${escapeHtml(s.id)}" data-sname="${escapeHtml(s.title)}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

qs("#sequenceList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const sid = btn.dataset.sid;
  if (action === "editSeq") openEditSequence(sid);
  if (action === "toggleSeq") {
    const currentStatus = btn.dataset.sstatus || "active";
    const newStatus = currentStatus === "paused" ? "active" : "paused";
    await api("PATCH", `${API}/email/sequences/${sid}`, { status: newStatus });
    await loadSequences();
  }
  if (action === "dupSeq") {
    const s = _sequences.find((x) => x.id === sid);
    if (!s) return;
    await api("POST", `${API}/email/sequences`, { title: s.title + " (copy)", description: s.description, segment: s.segment, frequency: s.frequency, steps: s.steps });
    await loadSequences();
  }
  if (action === "deleteSeq") {
    const ok = await confirmDialog("Delete sequence?", `Delete "${btn.dataset.sname}"? This cannot be undone.`);
    if (!ok) return;
    await api("DELETE", `${API}/email/sequences/${sid}`);
    await loadSequences();
  }
});

function buildStepTemplateOpts(selectedId) {
  return `<option value="">— or use template —</option>` + _templates.map((t) => `<option value="${escapeHtml(t.id)}"${t.id === selectedId ? " selected" : ""}>${escapeHtml(t.title)}</option>`).join("");
}

function buildStepHtml(step, index) {
  return `<div class="em-step" data-step="${index}">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-gray-500">Step ${index + 1}</span>
      <button type="button" class="btn-icon text-xs text-red-400" data-remove-step="${index}">&times; Remove</button>
    </div>
    <div class="grid gap-2 sm:grid-cols-[1fr_160px_120px]">
      <div>
        <label class="em-label" for="stepSubject_${index}">Subject</label>
        <input id="stepSubject_${index}" class="input w-full" type="text" placeholder="Day ${index + 1} — Your update" value="${escapeHtml(step.subject || "")}" />
      </div>
      <div>
        <label class="em-label" for="stepTemplate_${index}">Template (optional)</label>
        <select id="stepTemplate_${index}" class="input w-full" data-step-tpl="${index}">${buildStepTemplateOpts(step.templateId || "")}</select>
      </div>
      <div>
        <label class="em-label" for="stepDelay_${index}">Delay (days)</label>
        <input id="stepDelay_${index}" class="input w-full" type="number" min="0" max="365" value="${step.delayDays ?? index}" />
      </div>
    </div>
    <div class="mt-2">
      <label class="em-label" for="stepBody_${index}">Body</label>
      <textarea id="stepBody_${index}" class="input w-full" rows="3" placeholder="Hi {{first_name}}, ...">${escapeHtml(step.body || "")}</textarea>
    </div>
  </div>`;
}

function getSteps() {
  return qsa("[data-step]").map((el) => {
    const i = Number(el.dataset.step);
    const templateId = qs(`#stepTemplate_${i}`)?.value || undefined;
    return {
      subject: qs(`#stepSubject_${i}`)?.value || "",
      delayDays: Number(qs(`#stepDelay_${i}`)?.value) || 0,
      body: qs(`#stepBody_${i}`)?.value || "",
      templateId: templateId || undefined,
    };
  });
}

function renderSteps(steps) {
  const container = qs("#seqSteps");
  container.innerHTML = "";
  steps.forEach((step, i) => { container.insertAdjacentHTML("beforeend", buildStepHtml(step, i)); });
  _seqStepIndex = steps.length;
  bindRemoveSteps();
}

function bindRemoveSteps() {
  qsa("[data-remove-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const steps = getSteps();
      steps.splice(Number(btn.dataset.removeStep), 1);
      renderSteps(steps);
    });
  });
}

qs("#seqSteps")?.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-step-tpl]");
  if (!sel) return;
  const idx = Number(sel.dataset.stepTpl);
  const tid = sel.value;
  if (!tid) return;
  const tpl = _templates.find((t) => t.id === tid);
  if (!tpl) return;
  const subjectEl = qs(`#stepSubject_${idx}`);
  const bodyEl = qs(`#stepBody_${idx}`);
  if (subjectEl && !subjectEl.value && tpl.title) subjectEl.value = tpl.title;
  if (bodyEl && tpl.html) bodyEl.value = tpl.html;
});

qs("#addSeqStep")?.addEventListener("click", () => {
  const container = qs("#seqSteps");
  const newStep = { subject: "", delayDays: _seqStepIndex, body: "" };
  container.insertAdjacentHTML("beforeend", buildStepHtml(newStep, _seqStepIndex));
  _seqStepIndex++;
  bindRemoveSteps();
});

function openNewSequence() {
  qs("#sequenceModalTitle").textContent = "New Sequence";
  qs("#sequenceId").value = "";
  qs("#sequenceForm").reset();
  renderSteps([{ subject: "", delayDays: 0, body: "" }]);
  populateGroupSelects();
  openModal("sequenceModal");
}

function openEditSequence(sid) {
  const s = _sequences.find((x) => x.id === sid);
  if (!s) return;
  qs("#sequenceModalTitle").textContent = "Edit Sequence";
  qs("#sequenceId").value = s.id;
  qs("#seqName").value = s.title || "";
  qs("#seqDescription").value = s.description || "";
  populateGroupSelects();
  qs("#seqGroupId").value = s.groupId || s.segment || "";
  renderSteps(s.steps && s.steps.length ? s.steps : [{ subject: "", delayDays: 0, body: "" }]);
  openModal("sequenceModal");
}

qs("#sequenceForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = qs("#sequenceId").value;
  const steps = getSteps();
  const payload = {
    title: qs("#seqName").value.trim(),
    description: qs("#seqDescription").value.trim(),
    segment: qs("#seqGroupId").value || "b2c",
    groupId: qs("#seqGroupId").value || undefined,
    frequency: "daily",
    steps,
  };
  if (!payload.title) { toast(qs("#seqStatus"), "Sequence name is required.", true); return; }
  try {
    if (id) { await api("PATCH", `${API}/email/sequences/${id}`, payload); }
    else { await api("POST", `${API}/email/sequences`, payload); }
    closeModal("sequenceModal");
    await loadSequences();
  } catch (err) { toast(qs("#seqStatus"), err.message || "Failed to save sequence.", true); }
});

qs("#btnNewSequence")?.addEventListener("click", openNewSequence);
[qs("#closeSequenceModal"), qs("#closeSequenceModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("sequenceModal")));

/* ── TEMPLATES ───────────────────────────────────── */
function renderTemplates() {
  const container = qs("#templateList");
  const q = (qs("#templateSearch")?.value || "").toLowerCase();
  const filtered = _templates.filter((t) => !q || t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q) || (t.badge || "").toLowerCase().includes(q));
  if (!filtered.length) {
    container.innerHTML = `<div class="em-empty col-span-3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>${q ? "No templates match your search." : "No templates yet."}</div>`;
    return;
  }
  container.innerHTML = filtered.map((t) => `
    <div class="em-card flex flex-col gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold text-sm">${escapeHtml(t.title)}</div>
          ${t.badge ? `<span class="em-badge em-badge-gold text-xs mt-1">${escapeHtml(t.badge)}</span>` : ""}
          ${t.description ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(t.description)}</p>` : ""}
        </div>
      </div>
      <p class="text-xs text-gray-400">Updated ${fmtDate(t.updatedAt || t.createdAt)}</p>
      <div class="flex flex-wrap gap-2 mt-1">
        <button class="btn btn-outline text-xs" data-action="useTemplate" data-tid="${escapeHtml(t.id)}">Use</button>
        <button class="btn btn-outline text-xs" data-action="editTemplate" data-tid="${escapeHtml(t.id)}">Edit</button>
        <button class="btn btn-outline text-xs" style="color:#dc2626;border-color:rgba(239,68,68,0.3)" data-action="deleteTemplate" data-tid="${escapeHtml(t.id)}" data-tname="${escapeHtml(t.title)}">Delete</button>
      </div>
    </div>`).join("");
}

qs("#templateSearch")?.addEventListener("input", renderTemplates);

qs("#templateList")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const tid = btn.dataset.tid;
  if (action === "useTemplate") {
    const t = _templates.find((x) => x.id === tid);
    if (!t) return;
    qs("[data-tab='send']")?.click();
    if (t.html) qs("#seBody").value = t.html;
    if (t.title && !qs("#seSubject").value) qs("#seSubject").value = t.title;
    updatePreview();
  }
  if (action === "editTemplate") openEditTemplate(tid);
  if (action === "deleteTemplate") {
    const ok = await confirmDialog("Delete template?", `Delete "${btn.dataset.tname}"? This cannot be undone.`);
    if (!ok) return;
    try { await api("DELETE", `${API}/templates/${tid}`); await loadTemplates(); }
    catch (err) { alert(err.message); }
  }
});

function openNewTemplate() {
  qs("#templateModalTitle").textContent = "New Template";
  qs("#templateId").value = "";
  qs("#templateForm").reset();
  qs("#tplStatus").className = "em-status";
  openModal("templateModal");
}

function openEditTemplate(tid) {
  const t = _templates.find((x) => x.id === tid);
  if (!t) return;
  qs("#templateModalTitle").textContent = "Edit Template";
  qs("#templateId").value = t.id;
  qs("#tplName").value = t.title || "";
  qs("#tplCategory").value = t.badge || "";
  qs("#tplSubject").value = t.subject || t.title || "";
  qs("#tplDescription").value = t.description || "";
  qs("#tplHtml").value = t.html || "";
  openModal("templateModal");
}

qs("#templateForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = qs("#templateId").value;
  const payload = {
    title: qs("#tplName").value.trim(),
    description: qs("#tplDescription").value.trim(),
    badge: qs("#tplCategory").value.trim() || undefined,
    segment: "b2c",
    html: qs("#tplHtml").value.trim(),
    subject: qs("#tplSubject").value.trim() || undefined,
  };
  if (!payload.title) { toast(qs("#tplStatus"), "Template name is required.", true); return; }
  try {
    if (id) { await api("PATCH", `${API}/templates/${id}`, payload); }
    else { await api("POST", `${API}/templates`, payload); }
    closeModal("templateModal");
    await loadTemplates();
  } catch (err) { toast(qs("#tplStatus"), err.message || "Failed to save template.", true); }
});

qs("#btnNewTemplate")?.addEventListener("click", openNewTemplate);
[qs("#closeTemplateModal"), qs("#closeTemplateModal2")].forEach((b) => b?.addEventListener("click", () => closeModal("templateModal")));

/* ── HISTORY ─────────────────────────────────────── */
function renderHistory() {
  const container = qs("#historyList");
  if (!_history.length) {
    container.innerHTML = `<div class="em-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>No email history yet. Sent emails and campaigns will appear here.</div>`;
    return;
  }
  container.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm border-separate" style="border-spacing:0">
    <thead><tr>
      <th class="text-left py-2 px-3 text-xs font-semibold text-gray-500">Type</th>
      <th class="text-left py-2 px-3 text-xs font-semibold text-gray-500">Subject</th>
      <th class="text-left py-2 px-3 text-xs font-semibold text-gray-500">Recipient</th>
      <th class="text-left py-2 px-3 text-xs font-semibold text-gray-500">Status</th>
      <th class="text-left py-2 px-3 text-xs font-semibold text-gray-500">Sent</th>
    </tr></thead>
    <tbody>
      ${_history.map((h) => `<tr>
        <td class="py-2 px-3 border-b border-gray-100"><span class="em-badge em-badge-gold text-xs">${escapeHtml(h.type || "—")}</span></td>
        <td class="py-2 px-3 border-b border-gray-100 max-w-xs truncate">${escapeHtml(h.subject || "—")}</td>
        <td class="py-2 px-3 border-b border-gray-100">${escapeHtml(h.groupName || h.recipientId || h.groupId || "—")}</td>
        <td class="py-2 px-3 border-b border-gray-100">${statusBadge(h.status)}</td>
        <td class="py-2 px-3 border-b border-gray-100 text-gray-400">${fmtDate(h.sentAt)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

qs("#btnRefreshHistory")?.addEventListener("click", loadHistory);

/* ── INIT ────────────────────────────────────────── */
(async function init() {
  await Promise.all([loadGroups(), loadCampaigns(), loadSequences(), loadTemplates()]);
  handleRecipientTypeChange();
})();
