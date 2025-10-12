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
    updateSmsPreview();
  });
}

bindSmsPreviewControls();
bindTestModal();
bindTemplateControls();
bindExperimentControls();
bindRefreshControls();
initCampaignStatusStyles();
initLanguageSync();

hydrateTemplates();
refreshTestQueue();
refreshProviders();
autoRefreshQueue();
