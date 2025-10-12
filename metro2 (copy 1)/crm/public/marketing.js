import { api, getTranslation, getCurrentLanguage } from "./common.js";

const API_BASE = "/api/marketing";
const DEFAULT_QUEUE_LIMIT = 6;

const smsCampaignNameInput = document.getElementById("smsCampaignName");
const smsSegmentSelect = document.getElementById("smsSegment");
const smsMessageInput = document.getElementById("smsMessage");
const smsPreviewBubble = document.getElementById("smsPreviewBubble");
const smsCharCount = document.getElementById("smsCharCount");
const smsPreviewBtn = document.getElementById("smsPreviewBtn");
const smsTestBtn = document.getElementById("smsTestBtn");
const mergeFieldSelect = document.getElementById("mergeFieldSelect");

const testModal = document.getElementById("testModal");
const testForm = document.getElementById("testForm");
const testStatus = document.getElementById("testStatus");
const refreshQueueBtn = document.getElementById("refreshQueueBtn");
const testQueueList = document.getElementById("testQueueList");
const providerStatusList = document.getElementById("providerStatusList");
const providerStatusStatus = document.getElementById("providerStatusStatus");

const smsTemplateForm = document.getElementById("smsTemplateForm");
const smsTemplateList = document.getElementById("smsTemplateList");
const smsTemplateStatus = document.getElementById("smsTemplateStatus");

const emailSequenceForm = document.getElementById("emailSequenceForm");
const emailSequenceList = document.getElementById("emailSequenceList");
const emailSequenceStatus = document.getElementById("emailSequenceStatus");
const addSequenceStepBtn = document.getElementById("addSequenceStep");
const sequenceStepsContainer = document.getElementById("sequenceSteps");

const dispatchForm = document.getElementById("dispatchForm");
const dispatchStatus = document.getElementById("dispatchStatus");
const dispatchList = document.getElementById("dispatchList");
const dispatchTypeSelect = document.getElementById("dispatchType");
const dispatchTargetSelect = document.getElementById("dispatchTarget");
const dispatchFrequencySelect = document.getElementById("dispatchFrequency");

const btnAddTemplate = document.getElementById("btnAddTemplate");
const templateGrid = document.getElementById("emailTemplateGrid");
const templatesEmpty = document.getElementById("templatesEmpty");
const templateFilter = document.getElementById("templateFilter");
const btnImportHtml = document.getElementById("btnImportHtml");

const btnAddExperiment = document.getElementById("btnAddExperiment");
const experimentList = document.getElementById("experimentIdeas");

const SEGMENT_GRADIENTS = {
  b2c: "from-violet-100/80 to-white",
  b2b: "from-sky-100/70 to-white",
  attorneys: "from-amber-100/70 to-white",
  inactive: "from-rose-100/70 to-white",
};

const SAMPLE_DATA = {
  first_name: "Alex",
  last_name: "Ramirez",
  credit_score: "687",
  dispute_stage: "Round 2 Review",
  account_type: "Auto Loan",
  cta_link: "https://go.revolv.ai/next",
};

let templateCache = [];
let lastQueueItems = [];
let lastProviders = [];
let queueRefreshTimer = null;
let smsTemplateCache = [];
let emailSequenceCache = [];
let dispatchCache = [];
let sequenceStepIndex = 0;

function t(key, fallback = "") {
  return getTranslation(key, getCurrentLanguage()) || fallback;
}

function segmentGradient(segment = "b2c") {
  return SEGMENT_GRADIENTS[segment] || SEGMENT_GRADIENTS.b2c;
}

function insertAtCursor(field, text) {
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const value = field.value;
  field.value = value.slice(0, start) + text + value.slice(end);
  const cursor = start + text.length;
  field.setSelectionRange(cursor, cursor);
  field.focus();
  updateSmsPreview();
}

function applyMergeFields(content) {
  if (!content) return "";
  return content.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(SAMPLE_DATA, key)
      ? SAMPLE_DATA[key]
      : match;
  });
}

function updateSmsPreview() {
  if (!smsMessageInput || !smsPreviewBubble || !smsCharCount) return;
  const text = smsMessageInput.value.trim();
  const fallback = smsMessageInput.getAttribute("placeholder") ?? "";
  const previewText = applyMergeFields(text || fallback);
  smsPreviewBubble.textContent = previewText;
  const count = text.length;
  smsCharCount.textContent = `${count}/160`;
  if (count > 160) {
    smsCharCount.classList.add("text-rose-500", "font-semibold");
  } else {
    smsCharCount.classList.remove("text-rose-500", "font-semibold");
  }
}

async function marketingRequest(path, options = {}) {
  const response = await api(`${API_BASE}${path}`, options);
  if (!response) throw new Error("No response from server");
  if (response.ok === false || response.status >= 400) {
    const message = response.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return response;
}

function showInlineStatus(el, message, tone = "success") {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  if (tone === "error") {
    el.classList.remove("bg-emerald-100", "text-emerald-700");
    el.classList.add("bg-rose-100", "text-rose-700");
  } else {
    el.classList.remove("bg-rose-100", "text-rose-700");
    el.classList.add("bg-emerald-100", "text-emerald-700");
  }
  window.setTimeout(() => {
    el.classList.add("hidden");
  }, 4000);
}

async function fetchTemplates() {
  const res = await marketingRequest("/templates");
  return res.templates || [];
}

async function createTemplateApi(template) {
  const res = await marketingRequest("/templates", {
    method: "POST",
    body: JSON.stringify(template),
  });
  return res.template;
}

async function fetchSmsTemplatesApi() {
  const res = await marketingRequest("/sms-templates");
  return res.templates || [];
}

async function createSmsTemplateApi(template) {
  const res = await marketingRequest("/sms-templates", {
    method: "POST",
    body: JSON.stringify(template),
  });
  return res.template;
}

async function fetchEmailSequencesApi() {
  const res = await marketingRequest("/email/sequences");
  return res.sequences || [];
}

async function createEmailSequenceApi(sequence) {
  const res = await marketingRequest("/email/sequences", {
    method: "POST",
    body: JSON.stringify(sequence),
  });
  return res.sequence;
}

async function fetchEmailDispatches(limit = 10) {
  const res = await marketingRequest(`/email/dispatches?limit=${limit}`);
  return res.items || [];
}

async function scheduleEmailDispatchApi(dispatch) {
  const res = await marketingRequest("/email/dispatches", {
    method: "POST",
    body: JSON.stringify(dispatch),
  });
  return res.item;
}

async function fetchTestQueue(limit = DEFAULT_QUEUE_LIMIT) {
  const res = await marketingRequest(`/tests?limit=${limit}`);
  return res.items || [];
}

async function queueTestSend(payload) {
  const res = await marketingRequest("/tests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.item;
}

async function fetchProviders() {
  const res = await marketingRequest("/providers");
  return res.providers || [];
}

async function updateProviderApi(id, payload) {
  const res = await marketingRequest(`/providers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.provider;
}

function buildTemplateCard(template) {
  const article = document.createElement("article");
  article.className = `template-card glass card bg-gradient-to-br ${segmentGradient(template.segment)}`;
  article.dataset.segment = template.segment;
  article.dataset.templateId = template.id;

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-2";
  const title = document.createElement("h3");
  title.className = "text-lg font-semibold";
  title.textContent = template.title;
  const badge = document.createElement("span");
  badge.className = "chip text-xs";
  badge.textContent =
    template.badge ||
    template.segment?.toUpperCase() ||
    t("marketing.emailBuilder.template.badgeFallback", "Custom");
  header.appendChild(title);
  header.appendChild(badge);

  const description = document.createElement("p");
  description.className = "text-sm text-slate-600";
  description.textContent = template.description;

  const footer = document.createElement("div");
  footer.className = "mt-3 flex items-center justify-between text-xs text-slate-500";
  const left = document.createElement("span");
  left.textContent = template.createdAt
    ? new Date(template.createdAt).toLocaleDateString()
    : t("marketing.emailBuilder.template.draftLabel", "Draft");
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn";
  editButton.textContent = t("marketing.emailBuilder.template.editButton", "Edit");
  editButton.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("marketing:template-edit", { detail: template })
    );
    const messageTemplate = t(
      "marketing.emailBuilder.template.editAlert",
      "Hook up your template editor to template {title}. Use /api/marketing/templates to persist changes."
    );
    alert(messageTemplate.replace("{title}", template.title));
  });
  footer.appendChild(left);
  footer.appendChild(editButton);

  article.appendChild(header);
  article.appendChild(description);
  article.appendChild(footer);
  return article;
}

function renderTemplates() {
  if (!templateGrid) return;
  templateGrid.innerHTML = "";
  if (!templateCache.length) {
    if (templatesEmpty) {
      templatesEmpty.textContent = t(
        "marketing.emailBuilder.emptyState",
        "Templates load from the backend. Use “New Template” to save your first design."
      );
      templatesEmpty.classList.remove("text-rose-600");
      templateGrid.appendChild(templatesEmpty);
    }
    return;
  }
  for (const tpl of templateCache) {
    templateGrid.appendChild(buildTemplateCard(tpl));
  }
  filterTemplates();
  refreshStepTemplateOptions();
  syncDispatchTargets();
}

function renderSmsTemplates() {
  if (!smsTemplateList) return;
  smsTemplateList.innerHTML = "";
  if (!smsTemplateCache.length) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500";
    li.textContent = "Save your first SMS template to unlock automations.";
    smsTemplateList.appendChild(li);
    return;
  }
  smsTemplateCache.forEach((tpl) => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm";
    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-sm font-semibold text-slate-700";
    header.textContent = tpl.title;
    const badge = document.createElement("span");
    badge.className = "chip text-xs";
    badge.textContent = (tpl.segment || "b2c").toUpperCase();
    header.appendChild(badge);

    const body = document.createElement("p");
    body.className = "mt-2 text-xs text-slate-600 whitespace-pre-wrap";
    body.textContent = tpl.body;

    const footer = document.createElement("div");
    footer.className = "mt-3 flex items-center justify-between text-[10px] uppercase text-slate-400";
    const timestamp = document.createElement("span");
    timestamp.textContent = tpl.createdAt ? new Date(tpl.createdAt).toLocaleString() : "Draft";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn text-xs";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(tpl.body || "");
        showInlineStatus(smsTemplateStatus, "SMS template copied • Plantilla copiada");
      } catch (error) {
        showInlineStatus(smsTemplateStatus, error.message || "Clipboard blocked", "error");
      }
    });
    footer.appendChild(timestamp);
    footer.appendChild(copyBtn);

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(footer);
    smsTemplateList.appendChild(li);
  });
}

function renderEmailSequences() {
  if (!emailSequenceList) return;
  emailSequenceList.innerHTML = "";
  if (!emailSequenceCache.length) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500";
    li.textContent = "Map your first nurture flow to start monetizing follow-ups.";
    emailSequenceList.appendChild(li);
    return;
  }
  emailSequenceCache.forEach((sequence) => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm space-y-2";
    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-sm font-semibold text-slate-700";
    header.textContent = sequence.title || "Sequence";
    const badge = document.createElement("span");
    badge.className = "chip text-xs";
    badge.textContent = (sequence.segment || "b2c").toUpperCase();
    header.appendChild(badge);

    const description = document.createElement("p");
    description.className = "text-xs text-slate-500";
    description.textContent = sequence.description || "Outline compliance touchpoints and CTAs.";

    const stepsList = document.createElement("ol");
    stepsList.className = "list-decimal list-inside space-y-1 text-xs text-slate-600";
    (sequence.steps || []).forEach((step, index) => {
      const item = document.createElement("li");
      const subject = step.subject || `Step ${index + 1}`;
      const delay = Number.isFinite(step.delayDays) ? `${step.delayDays}d` : "0d";
      const tpl = step.templateId ? ` • Template: ${step.templateId}` : "";
      item.textContent = `${subject} (${delay})${tpl}`;
      stepsList.appendChild(item);
    });

    li.appendChild(header);
    li.appendChild(description);
    if (stepsList.childElementCount) li.appendChild(stepsList);
    emailSequenceList.appendChild(li);
  });
}

function renderDispatches() {
  if (!dispatchList) return;
  dispatchList.innerHTML = "";
  if (!dispatchCache.length) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500";
    li.textContent = "No dispatches scheduled yet. Program your first drop.";
    dispatchList.appendChild(li);
    return;
  }
  dispatchCache.forEach((item) => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm space-y-2";
    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-sm font-semibold text-slate-700";
    header.textContent = `${item.targetType?.toUpperCase() || "TEMPLATE"} → ${item.targetId}`;
    const badge = document.createElement("span");
    badge.className = "chip text-xs";
    badge.textContent = (item.segment || "b2c").toUpperCase();
    header.appendChild(badge);

    const meta = document.createElement("p");
    meta.className = "text-xs text-slate-500";
    const scheduled = item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : "Immediate";
    meta.textContent = `Frequency: ${item.frequency || "immediate"} • Scheduled: ${scheduled}`;

    if (item.notes) {
      const notes = document.createElement("p");
      notes.className = "text-xs text-slate-500";
      notes.textContent = item.notes;
      li.appendChild(notes);
    }

    li.appendChild(header);
    li.appendChild(meta);
    dispatchList.appendChild(li);
  });
}

function populateStepTemplateOptions(select, selectedValue = "") {
  if (!select) return;
  const previous = selectedValue || select.value || "";
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- Select email template --";
  select.appendChild(placeholder);
  templateCache.forEach((tpl) => {
    const option = document.createElement("option");
    option.value = tpl.id;
    option.textContent = tpl.title || tpl.name || tpl.id;
    select.appendChild(option);
  });
  if (previous) {
    select.value = previous;
  }
}

function refreshStepTemplateOptions() {
  if (!sequenceStepsContainer) return;
  sequenceStepsContainer
    .querySelectorAll("select[name='stepTemplate']")
    .forEach((select) => populateStepTemplateOptions(select));
}

function createSequenceStepRow(initial = {}) {
  if (!sequenceStepsContainer) return;
  sequenceStepIndex += 1;
  const row = document.createElement("div");
  row.className =
    "sequence-step grid gap-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end";
  row.dataset.stepId = `step-${sequenceStepIndex}`;

  const subjectInput = document.createElement("input");
  subjectInput.name = "stepSubject";
  subjectInput.className = "input text-sm";
  subjectInput.placeholder = "Subject";
  subjectInput.value = initial.subject || "";

  const delayInput = document.createElement("input");
  delayInput.name = "stepDelay";
  delayInput.type = "number";
  delayInput.min = "0";
  delayInput.className = "input text-sm";
  delayInput.value = Number.isFinite(initial.delayDays) ? String(initial.delayDays) : "0";

  const templateSelect = document.createElement("select");
  templateSelect.name = "stepTemplate";
  templateSelect.className = "input text-sm";
  populateStepTemplateOptions(templateSelect, initial.templateId || "");

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn text-xs";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(subjectInput);
  row.appendChild(delayInput);
  row.appendChild(templateSelect);
  row.appendChild(removeBtn);
  sequenceStepsContainer.appendChild(row);
}

function gatherSequenceSteps() {
  if (!sequenceStepsContainer) return [];
  return Array.from(sequenceStepsContainer.querySelectorAll(".sequence-step")).map((row) => {
    const subject = row.querySelector("input[name='stepSubject']")?.value?.trim() || "";
    const delayDays = Number(row.querySelector("input[name='stepDelay']")?.value || 0);
    const templateId = row.querySelector("select[name='stepTemplate']")?.value || "";
    const payload = { subject, delayDays };
    if (templateId) payload.templateId = templateId;
    return payload;
  });
}

function syncDispatchTargets() {
  if (!dispatchTargetSelect) return;
  const type = dispatchTypeSelect?.value === "sequence" ? "sequence" : "template";
  const source = type === "sequence" ? emailSequenceCache : templateCache;
  dispatchTargetSelect.innerHTML = "";
  if (!source.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = type === "sequence" ? "Add sequences first" : "Add templates first";
    dispatchTargetSelect.appendChild(opt);
    dispatchTargetSelect.disabled = true;
    return;
  }
  dispatchTargetSelect.disabled = false;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select asset";
  dispatchTargetSelect.appendChild(placeholder);
  source.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title || item.heading || item.name || item.id;
    dispatchTargetSelect.appendChild(option);
  });
}

function filterTemplates() {
  if (!templateFilter || !templateGrid) return;
  const value = templateFilter.value;
  templateGrid.querySelectorAll(".template-card").forEach((card) => {
    if (value === "all" || card.dataset.segment === value) {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  });
}

function setQueueMessage(message, tone = "info") {
  if (!testQueueList) return;
  testQueueList.innerHTML = "";
  const li = document.createElement("li");
  li.className = "rounded-lg border border-dashed border-slate-300 bg-white/50 p-3";
  if (tone === "error") {
    li.classList.remove("border-slate-300", "bg-white/50");
    li.classList.add("border-rose-200", "bg-rose-50", "text-rose-600");
  }
  li.textContent = message;
  testQueueList.appendChild(li);
}

function renderTestQueue(items) {
  if (!testQueueList) return;
  lastQueueItems = items;
  testQueueList.innerHTML = "";
  if (!items.length) {
    setQueueMessage(
      t(
        "marketing.integration.queue.empty",
        "Run “Send Test” to see items here."
      )
    );
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-xs font-semibold text-slate-600";
    const channel = document.createElement("span");
    channel.textContent = `${item.channel?.toUpperCase() || "SMS"} • ${item.recipient}`;
    const timestamp = document.createElement("span");
    timestamp.className = "text-[10px] uppercase text-slate-400";
    timestamp.textContent = new Date(item.createdAt).toLocaleString();
    header.appendChild(channel);
    header.appendChild(timestamp);

    const body = document.createElement("p");
    body.className = "mt-1 text-xs text-slate-500";
    const campaign = item.metadata?.campaignName;
    body.textContent =
      campaign || item.notes || t("marketing.testQueue.previewFallback", "Preview ready for dispatch.");

    const footer = document.createElement("div");
    footer.className = "mt-2 text-[10px] uppercase text-slate-400 flex flex-wrap gap-2";
    const segment = item.metadata?.segment;
    if (segment) {
      const tag = document.createElement("span");
      tag.textContent = t("marketing.testQueue.segmentLabel", "Segment: {value}").replace("{value}", segment);
      footer.appendChild(tag);
    }
    if (item.messageLength) {
      const tag = document.createElement("span");
      tag.textContent = t("marketing.testQueue.charsLabel", "{count} chars").replace("{count}", item.messageLength);
      footer.appendChild(tag);
    }
    const createdBy = item.createdBy;
    if (createdBy) {
      const tag = document.createElement("span");
      tag.textContent = t("marketing.testQueue.byLabel", "By {name}").replace("{name}", createdBy);
      footer.appendChild(tag);
    }

    li.appendChild(header);
    li.appendChild(body);
    if (footer.childElementCount) {
      li.appendChild(footer);
    }
    testQueueList.appendChild(li);
  }
}

function renderProviders(providers) {
  if (!providerStatusList) return;
  lastProviders = providers;
  providerStatusList.innerHTML = "";
  if (providerStatusStatus) providerStatusStatus.classList.add("hidden");
  if (!providers.length) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-dashed border-slate-300 bg-white/50 p-3";
    li.textContent = t(
      "marketing.integration.providers.empty",
      "Use the API to register Twilio/SendGrid credentials."
    );
    providerStatusList.appendChild(li);
    return;
  }
  providers.forEach((provider) => {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-slate-200 bg-white/80 p-3";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between text-sm";
    const label = document.createElement("span");
    label.className = "font-semibold text-slate-700";
    label.textContent = provider.label;
    const badge = document.createElement("span");
    badge.className = "chip text-xs";
    const statusKey =
      provider.status === "ready"
        ? "marketing.providers.status.ready"
        : provider.status === "error"
        ? "marketing.providers.status.check"
        : "marketing.providers.status.pending";
    badge.textContent = t(statusKey, provider.status || "Pending");
    header.appendChild(label);
    header.appendChild(badge);

    const notes = document.createElement("p");
    notes.className = "mt-1 text-xs text-slate-500";
    notes.textContent = provider.notes || t("marketing.providers.noteFallback", "Document compliance requirements.");

    const env = document.createElement("div");
    env.className = "mt-2 text-[10px] uppercase text-slate-400";
    env.textContent = t("marketing.providers.envPrefix", "Env: {value}").replace(
      "{value}",
      (provider.env || []).join(", ") || "—"
    );

    li.appendChild(header);
    li.appendChild(notes);
    li.appendChild(env);
    if (provider.lastConfiguredAt) {
      const stamp = document.createElement("div");
      stamp.className = "mt-1 text-[10px] uppercase text-slate-400";
      stamp.textContent = t("marketing.providers.updatedPrefix", "Updated {timestamp}").replace(
        "{timestamp}",
        new Date(provider.lastConfiguredAt).toLocaleString()
      );
      li.appendChild(stamp);
    }

    const controls = document.createElement("div");
    controls.className = "mt-3 flex flex-wrap items-center gap-2 text-xs";

      const statusSelect = document.createElement("select");
      statusSelect.className = "input text-xs py-1 px-2";
      [
        ["ready", "Ready"],
        ["pending", "Pending"],
        ["error", "Check"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = provider.status || "pending";
      statusSelect.addEventListener("change", async (event) => {
        try {
          await updateProviderApi(provider.id, { status: event.target.value });
          showInlineStatus(providerStatusStatus, "Provider status updated");
          refreshProviders();
        } catch (error) {
          showInlineStatus(providerStatusStatus, error.message || "Failed to update provider", "error");
          statusSelect.value = provider.status || "pending";
        }
      });

    const notesBtn = document.createElement("button");
    notesBtn.type = "button";
    notesBtn.className = "btn text-xs";
    notesBtn.textContent = "Update Notes";
    notesBtn.addEventListener("click", async () => {
      const next = window.prompt("Provider notes", provider.notes || "");
      if (next === null) return;
      try {
        await updateProviderApi(provider.id, { notes: next });
        showInlineStatus(providerStatusStatus, "Notes saved");
        refreshProviders();
      } catch (error) {
        showInlineStatus(providerStatusStatus, error.message || "Failed to save notes", "error");
      }
    });

    controls.appendChild(statusSelect);
    controls.appendChild(notesBtn);
    li.appendChild(controls);
    providerStatusList.appendChild(li);
  });
}

function showTestStatus(message, tone = "success") {
  if (!testStatus) return;
  testStatus.textContent = message;
  testStatus.classList.remove("hidden");
  if (tone === "error") {
    testStatus.classList.remove("bg-emerald-100", "text-emerald-700");
    testStatus.classList.add("bg-rose-100", "text-rose-700");
  } else {
    testStatus.classList.remove("bg-rose-100", "text-rose-700");
    testStatus.classList.add("bg-emerald-100", "text-emerald-700");
  }
}

function hideTestStatus() {
  if (!testStatus) return;
  testStatus.classList.add("hidden");
}

function openTestModal() {
  if (!testModal) return;
  testModal.classList.remove("hidden");
  testModal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
}

function closeTestModal() {
  if (!testModal) return;
  testModal.classList.add("hidden");
  testModal.classList.remove("flex");
  document.body.classList.remove("overflow-hidden");
  hideTestStatus();
}

async function hydrateTemplates() {
  if (!templateGrid) return;
  if (templatesEmpty) {
    templatesEmpty.textContent = t("marketing.emailBuilder.loading", "Loading templates from API…");
    templatesEmpty.classList.remove("text-rose-600");
  }
  try {
    templateCache = await fetchTemplates();
    renderTemplates();
  } catch (error) {
    if (templatesEmpty) {
      templatesEmpty.textContent = `${t("marketing.emailBuilder.errorPrefix", "API error: ")}${error.message}`;
      templatesEmpty.classList.add("text-rose-600");
      templateGrid.appendChild(templatesEmpty);
    }
  }
}

async function hydrateSmsTemplates() {
  if (!smsTemplateList) return;
  try {
    smsTemplateCache = await fetchSmsTemplatesApi();
    renderSmsTemplates();
  } catch (error) {
    showInlineStatus(smsTemplateStatus, error.message || "Failed to load SMS templates", "error");
  }
}

async function hydrateEmailSequences() {
  if (!emailSequenceList) return;
  try {
    emailSequenceCache = await fetchEmailSequencesApi();
    renderEmailSequences();
    syncDispatchTargets();
  } catch (error) {
    showInlineStatus(emailSequenceStatus, error.message || "Failed to load sequences", "error");
  }
}

async function hydrateDispatches() {
  if (!dispatchList) return;
  try {
    dispatchCache = await fetchEmailDispatches();
    renderDispatches();
  } catch (error) {
    showInlineStatus(dispatchStatus, error.message || "Failed to load dispatches", "error");
  }
}

async function refreshTestQueue({ silent = false } = {}) {
  if (!testQueueList) return;
  if (!silent) {
    setQueueMessage(t("marketing.testQueue.loading", "Loading queue…"));
  }
  try {
    const items = await fetchTestQueue();
    renderTestQueue(items);
  } catch (error) {
    setQueueMessage(
      `${t("marketing.testQueue.errorPrefix", "API error: ")}${error.message}`,
      "error"
    );
  }
}

async function refreshProviders() {
  if (!providerStatusList) return;
  try {
    const providers = await fetchProviders();
    renderProviders(providers);
  } catch (error) {
    providerStatusList.innerHTML = "";
    const li = document.createElement("li");
    li.className = "rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-600";
    li.textContent = `${t("marketing.providers.errorPrefix", "Provider API error: ")}${error.message}`;
    providerStatusList.appendChild(li);
    showInlineStatus(providerStatusStatus, error.message || "Provider API error", "error");
  }
}

function autoRefreshQueue() {
  if (queueRefreshTimer) window.clearInterval(queueRefreshTimer);
  queueRefreshTimer = window.setInterval(() => {
    refreshTestQueue({ silent: true });
  }, 30_000);
}

function bindSmsPreviewControls() {
  if (smsMessageInput) {
    smsMessageInput.addEventListener("input", updateSmsPreview);
    updateSmsPreview();
  }
  document.querySelectorAll("[data-token]").forEach((button) => {
    button.addEventListener("click", () => {
      insertAtCursor(smsMessageInput, button.dataset.token ?? "");
    });
  });
  if (mergeFieldSelect) {
    mergeFieldSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      if (value) {
        insertAtCursor(smsMessageInput, value);
        mergeFieldSelect.value = "";
      }
    });
  }
  if (smsPreviewBtn) {
    smsPreviewBtn.addEventListener("click", () => {
      updateSmsPreview();
      if (!smsPreviewBubble) return;
      smsPreviewBubble.classList.add("ring-4", "ring-white", "ring-offset-2", "ring-offset-slate-900");
      window.setTimeout(() => {
        smsPreviewBubble.classList.remove("ring-4", "ring-white", "ring-offset-2", "ring-offset-slate-900");
      }, 600);
    });
  }
}

function bindTestModal() {
  if (smsTestBtn) {
    smsTestBtn.addEventListener("click", () => {
      openTestModal();
      const recipientInput = document.getElementById("testRecipient");
      if (recipientInput) recipientInput.focus();
    });
  }
  if (testModal) {
    testModal.addEventListener("click", (event) => {
      if (event.target === testModal) {
        closeTestModal();
      }
    });
  }
  document.querySelectorAll("[data-close-test]").forEach((btn) => {
    btn.addEventListener("click", closeTestModal);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTestModal();
    }
  });
  if (!testForm) return;
  testForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(testForm);
    const channel = formData.get("testChannel") || "sms";
    const recipient = formData.get("testRecipient") || "";
    const notes = formData.get("testNotes") || "";
    const smsPreview = smsMessageInput ? applyMergeFields(smsMessageInput.value) : "";
    const metadata = {
      campaignName: smsCampaignNameInput?.value?.trim() || null,
      segment: smsSegmentSelect?.value || null,
      notes: notes ? String(notes) : "",
      mergeFields: (smsMessageInput?.value.match(/{{\s*([\w.]+)\s*}}/g) || []).map((token) => token.replace(/[{}\s]/g, "")),
    };

    try {
      await queueTestSend({
        channel,
        recipient,
        notes,
        smsPreview,
        emailPreviewId: "template-draft",
        metadata,
        source: "marketing-ui",
      });
      showTestStatus(t("marketing.testModal.success", "Queued via marketing API — list updates below."));
      refreshTestQueue({ silent: true });
      window.setTimeout(() => {
        closeTestModal();
      }, 800);
    } catch (error) {
      showTestStatus(
        t("marketing.testModal.errorPrefix", "Error: {error}").replace("{error}", error.message),
        "error"
      );
    }
  });
}

function bindTemplateControls() {
  if (templateFilter) {
    templateFilter.addEventListener("change", filterTemplates);
  }
  if (btnAddTemplate && templateGrid) {
    btnAddTemplate.addEventListener("click", async () => {
      const name = window.prompt(t("marketing.emailBuilder.prompts.name", "Template name?"))?.trim();
      if (!name) return;
      const descriptionPrompt = t("marketing.emailBuilder.prompts.purpose", "What's the purpose?");
      const description =
        window.prompt(descriptionPrompt)?.trim() ||
        t("marketing.emailBuilder.prompts.descriptionFallback", "Outline your nurture touchpoints and CTA.");
      const segment = templateFilter && templateFilter.value !== "all" ? templateFilter.value : "b2c";
      try {
        const template = await createTemplateApi({
          title: name,
          description,
          segment,
          badge: segment.toUpperCase(),
        });
        templateCache = [template, ...templateCache.filter((tpl) => tpl.id !== template.id)];
        renderTemplates();
      } catch (error) {
        const message = t("marketing.emailBuilder.prompts.error", "Failed to save template: {error}").replace(
          "{error}",
          error.message
        );
        window.alert(message);
      }
    });
  }
  if (btnImportHtml) {
    btnImportHtml.addEventListener("click", () => {
      window.alert(
        t(
          "marketing.emailBuilder.prompts.importReminder",
          "POST your HTML to /api/marketing/templates with { html } once your inline CSS pipeline is ready."
        )
      );
    });
  }
}

function bindExperimentControls() {
  if (!btnAddExperiment || !experimentList) return;
  btnAddExperiment.addEventListener("click", () => {
    const idea = window.prompt(
      t("marketing.campaignDashboard.experiments.prompt", "Log your experiment hypothesis")
    )?.trim();
    if (!idea) return;
    const index = experimentList.children.length + 1;
    const template = t(
      "marketing.campaignDashboard.experiments.customPrefix",
      "{index}️⃣ {idea}"
    )
      .replace("{index}", index)
      .replace("{idea}", idea);
    const li = document.createElement("li");
    li.textContent = template;
    experimentList.appendChild(li);
  });
}

function bindRefreshControls() {
  if (refreshQueueBtn) {
    refreshQueueBtn.addEventListener("click", () => refreshTestQueue({ silent: false }));
  }
}

function bindAutomationControls() {
  if (addSequenceStepBtn && sequenceStepsContainer) {
    addSequenceStepBtn.addEventListener("click", () => createSequenceStepRow());
  }
  if (sequenceStepsContainer && !sequenceStepsContainer.childElementCount) {
    createSequenceStepRow();
  }

  if (smsTemplateForm) {
    smsTemplateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(smsTemplateForm);
      const payload = {
        title: formData.get("title")?.toString().trim() || "",
        segment: formData.get("segment")?.toString().trim() || "b2c",
        body: formData.get("body")?.toString().trim() || "",
      };
      if (!payload.title || !payload.body) {
        showInlineStatus(smsTemplateStatus, "Title and body required", "error");
        return;
      }
      try {
        const template = await createSmsTemplateApi(payload);
        smsTemplateCache = [template, ...smsTemplateCache];
        renderSmsTemplates();
        showInlineStatus(smsTemplateStatus, "SMS template saved • Plantilla guardada");
        smsTemplateForm.reset();
      } catch (error) {
        showInlineStatus(smsTemplateStatus, error.message || "Failed to save SMS template", "error");
      }
    });
  }

  if (emailSequenceForm) {
    emailSequenceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(emailSequenceForm);
      const steps = gatherSequenceSteps().filter((step) => step.subject || step.templateId);
      if (!steps.length) {
        showInlineStatus(emailSequenceStatus, "Add at least one step • Agrega un paso", "error");
        return;
      }
      const payload = {
        title: formData.get("title")?.toString().trim() || "",
        description: formData.get("description")?.toString().trim() || "",
        segment: formData.get("segment")?.toString().trim() || "b2c",
        frequency: formData.get("frequency")?.toString().trim() || "daily",
        steps,
      };
      if (!payload.title) {
        showInlineStatus(emailSequenceStatus, "Name required • Nombre requerido", "error");
        return;
      }
      try {
        const sequence = await createEmailSequenceApi(payload);
        emailSequenceCache = [sequence, ...emailSequenceCache.filter((s) => s.id !== sequence.id)];
        renderEmailSequences();
        syncDispatchTargets();
        showInlineStatus(emailSequenceStatus, "Sequence saved • Secuencia guardada");
        emailSequenceForm.reset();
        if (sequenceStepsContainer) {
          sequenceStepsContainer.innerHTML = "";
          createSequenceStepRow();
        }
      } catch (error) {
        showInlineStatus(emailSequenceStatus, error.message || "Failed to save sequence", "error");
      }
    });
  }

  if (dispatchForm) {
    dispatchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(dispatchForm);
      const targetId = formData.get("targetId")?.toString().trim() || "";
      if (!targetId) {
        showInlineStatus(dispatchStatus, "Select template or sequence • Selecciona un asset", "error");
        return;
      }
      const scheduledForRaw = formData.get("scheduledFor")?.toString().trim();
      const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
      const payload = {
        targetType: formData.get("targetType")?.toString().trim() || "template",
        targetId,
        frequency: formData.get("frequency")?.toString().trim() || "immediate",
        segment: formData.get("segment")?.toString().trim() || "b2c",
        scheduledFor: scheduledFor && !Number.isNaN(scheduledFor.valueOf()) ? scheduledFor.toISOString() : undefined,
        audienceCount: formData.get("audienceCount") ? Number(formData.get("audienceCount")) : undefined,
        notes: formData.get("notes")?.toString().trim() || "",
      };
      try {
        const item = await scheduleEmailDispatchApi(payload);
        dispatchCache = [item, ...dispatchCache];
        renderDispatches();
        showInlineStatus(dispatchStatus, "Dispatch queued");
        dispatchForm.reset();
        syncDispatchTargets();
      } catch (error) {
        showInlineStatus(dispatchStatus, error.message || "Failed to schedule", "error");
      }
    });
  }

  if (dispatchTypeSelect) {
    dispatchTypeSelect.addEventListener("change", () => syncDispatchTargets());
  }
  syncDispatchTargets();
}

function initCampaignStatusStyles() {
  const campaignList = document.getElementById("campaignList");
  if (!campaignList) return;
  const statusColors = {
    scheduled: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
    completed: "bg-gradient-to-r from-emerald-500 to-teal-500",
    draft: "bg-gradient-to-r from-sky-500 to-indigo-500",
  };
  campaignList.querySelectorAll("[data-status]").forEach((card) => {
    const status = card.dataset.status;
    const bar = card.querySelector(".h-full");
    if (status && bar) {
      bar.className = `h-full rounded-full ${statusColors[status] ?? "bg-slate-500"}`;
    }
  });
}

function initLanguageSync() {
  window.addEventListener("crm:language-change", () => {
    renderTemplates();
    renderTestQueue(lastQueueItems);
    renderProviders(lastProviders);
    renderSmsTemplates();
    renderEmailSequences();
    renderDispatches();
    updateSmsPreview();
  });
}

bindSmsPreviewControls();
bindTestModal();
bindTemplateControls();
bindExperimentControls();
bindRefreshControls();
bindAutomationControls();
initCampaignStatusStyles();
initLanguageSync();

hydrateTemplates();
hydrateSmsTemplates();
hydrateEmailSequences();
hydrateDispatches();
refreshTestQueue();
refreshProviders();
autoRefreshQueue();
window.addEventListener('crm:language-change', () => {
  updateSmsPreview();
});

