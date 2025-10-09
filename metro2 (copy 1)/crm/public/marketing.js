import { api } from "./common.js";

const API_BASE = "/api/marketing";

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
let queueRefreshTimer = null;

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

async function fetchTestQueue(limit = 6) {
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
  badge.textContent = template.badge || template.segment?.toUpperCase();
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
    : "Draft";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    window.dispatchEvent(
      new CustomEvent("marketing:template-edit", { detail: template })
    );
    alert(
      `Hook up your template editor to template ${template.title}. Use /api/marketing/templates to persist changes.`
    );
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
    const empty = document.createElement("p");
    empty.className = "rounded-lg border border-dashed border-slate-300 bg-white/50 p-4 text-sm text-slate-500";
    empty.textContent = "No templates yet. Crea uno nuevo para comenzar.";
    templateGrid.appendChild(empty);
  } else {
    for (const tpl of templateCache) {
      templateGrid.appendChild(buildTemplateCard(tpl));
    }
  }
  filterTemplates();
}

function filterTemplates() {
  if (!templateFilter || !templateGrid) return;
  const value = templateFilter.value;
  const cards = templateGrid.querySelectorAll(".template-card");
  cards.forEach((card) => {
    if (value === "all" || card.dataset.segment === value) {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  });
}

function setQueueMessage(text, tone = "info") {
  if (!testQueueList) return;
  testQueueList.innerHTML = "";
  const li = document.createElement("li");
  li.className = "rounded-lg border border-dashed border-slate-300 bg-white/50 p-3";
  if (tone === "error") {
    li.classList.remove("border-slate-300", "bg-white/50");
    li.classList.add("border-rose-200", "bg-rose-50", "text-rose-600");
  }
  li.textContent = text;
  testQueueList.appendChild(li);
}

function renderTestQueue(items) {
  if (!testQueueList) return;
  testQueueList.innerHTML = "";
  if (!items.length) {
    setQueueMessage("Queue is empty — send a test to populate it.");
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
    body.textContent = campaign || item.notes || "Preview ready for dispatch.";

    const footer = document.createElement("div");
    footer.className = "mt-2 text-[10px] uppercase text-slate-400 flex flex-wrap gap-2";
    const segment = item.metadata?.segment;
    if (segment) {
      const tag = document.createElement("span");
      tag.textContent = `Segment: ${segment}`;
      footer.appendChild(tag);
    }
    if (item.messageLength) {
      const tag = document.createElement("span");
      tag.textContent = `${item.messageLength} chars`;
      footer.appendChild(tag);
    }
    const createdBy = item.createdBy;
    if (createdBy) {
      const tag = document.createElement("span");
      tag.textContent = `By ${createdBy}`;
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
  providerStatusList.innerHTML = "";
  if (!providers.length) {
    const li = document.createElement("li");
    li.className = "rounded-lg border border-dashed border-slate-300 bg-white/50 p-3";
    li.textContent = "Register providers via PATCH /api/marketing/providers/:id.";
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
    badge.textContent = provider.status === "ready" ? "Ready" : provider.status === "error" ? "Check" : "Pending";
    header.appendChild(label);
    header.appendChild(badge);

    const notes = document.createElement("p");
    notes.className = "mt-1 text-xs text-slate-500";
    notes.textContent = provider.notes || "Documenta requisitos de cumplimiento.";

    const env = document.createElement("div");
    env.className = "mt-2 text-[10px] uppercase text-slate-400";
    env.textContent = `Env: ${(provider.env || []).join(", ")}`;

    li.appendChild(header);
    li.appendChild(notes);
    li.appendChild(env);
    if (provider.lastConfiguredAt) {
      const stamp = document.createElement("div");
      stamp.className = "mt-1 text-[10px] uppercase text-slate-400";
      stamp.textContent = `Updated ${new Date(provider.lastConfiguredAt).toLocaleString()}`;
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
    templatesEmpty.textContent = "Loading templates from API…";
  }
  try {
    templateCache = await fetchTemplates();
    renderTemplates();
  } catch (error) {
    if (templatesEmpty) {
      templatesEmpty.textContent = `API error: ${error.message}`;
      templatesEmpty.classList.add("text-rose-600");
    }
  }
}

async function refreshTestQueue(options = {}) {
  if (!testQueueList) return;
  if (!options.silent) {
    setQueueMessage("Loading queue…");
  }
  try {
    const items = await fetchTestQueue();
    renderTestQueue(items);
  } catch (error) {
    setQueueMessage(`API error: ${error.message}`, "error");
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
    li.textContent = `Provider API error: ${error.message}`;
    providerStatusList.appendChild(li);
  }
}

function autoRefreshQueue() {
  if (queueRefreshTimer) window.clearInterval(queueRefreshTimer);
  queueRefreshTimer = window.setInterval(() => {
    refreshTestQueue({ silent: true });
  }, 30_000);
}

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
    setTimeout(() => {
      smsPreviewBubble.classList.remove("ring-4", "ring-white", "ring-offset-2", "ring-offset-slate-900");
    }, 600);
  });
}

const testModal = document.getElementById("testModal");
const testForm = document.getElementById("testForm");
const testStatus = document.getElementById("testStatus");

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
}

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

if (testForm) {
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
      mergeFields: (smsMessageInput?.value.match(/{{\s*([\w.]+)\s*}}/g) || []).map((token) => token.replace(/[{\s}]/g, "")),
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
      showTestStatus("Queued via marketing API — refresh below.");
      refreshTestQueue({ silent: true });
      window.setTimeout(() => {
        closeTestModal();
      }, 800);
    } catch (error) {
      showTestStatus(`Error: ${error.message}`, "error");
    }
  });
}

if (btnAddTemplate && templateGrid) {
  btnAddTemplate.addEventListener("click", async () => {
    const title = window.prompt("Template name?")?.trim();
    if (!title) return;
    const description =
      window.prompt("What's the purpose?")?.trim() || "Outline your nurture touchpoints and CTA.";
    const segment = templateFilter && templateFilter.value !== "all" ? templateFilter.value : "b2c";
    try {
      const template = await createTemplateApi({
        title,
        description,
        segment,
        badge: segment.toUpperCase(),
      });
      templateCache = [template, ...templateCache.filter((tpl) => tpl.id !== template.id)];
      renderTemplates();
    } catch (error) {
      window.alert(`Failed to save template: ${error.message}`);
    }
  });
}

if (templateFilter) {
  templateFilter.addEventListener("change", filterTemplates);
  testForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(testForm);
    const payload = {
      channel: formData.get("testChannel"),
      recipient: formData.get("testRecipient"),
      notes: formData.get("testNotes"),
      smsPreview: smsMessageInput ? applyMergeFields(smsMessageInput.value) : "",
      emailPreviewId: "template-draft",
      createdAt: new Date().toISOString(),
    };

    const queue = JSON.parse(localStorage.getItem("marketing-test-queue") ?? "[]");
    queue.unshift(payload);
    queue.splice(10);
    localStorage.setItem("marketing-test-queue", JSON.stringify(queue));

    if (testStatus) {
      testStatus.textContent = "Queued locally — ready for backend webhook integration.";
      testStatus.classList.remove("hidden");
      testStatus.classList.add("flex", "items-center", "gap-2");
      setTimeout(() => {
        testStatus.classList.add("hidden");
        testStatus.classList.remove("flex", "items-center", "gap-2");
      }, 4000);
    }

    testForm.reset();
    updateSmsPreview();
    closeTestModal();
  });
}

const btnAddTemplate = document.getElementById("btnAddTemplate");
const templateGrid = document.getElementById("emailTemplateGrid");
const templateFilter = document.getElementById("templateFilter");
const btnImportHtml = document.getElementById("btnImportHtml");

function buildTemplateCard({ title, description, segment, badge = "Custom" }) {
  const article = document.createElement("article");
  article.className = "template-card glass card bg-gradient-to-br from-amber-100/70 to-white";
  article.dataset.segment = segment;
  article.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-lg font-semibold">${title}</h3>
      <span class="chip text-xs">${badge}</span>
    </div>
    <p class="text-sm text-slate-600">${description}</p>
    <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
      <span>Draft • ${new Date().toLocaleDateString()}</span>
      <button class="btn" type="button">Edit</button>
    </div>
  `;
  return article;
}

if (btnAddTemplate && templateGrid) {
  btnAddTemplate.addEventListener("click", () => {
    const name = prompt("Template name?")?.trim();
    if (!name) return;
    const description = prompt("What's the purpose?")?.trim() || "Outline your nurture touchpoints and CTA.";
    const segment = templateFilter?.value && templateFilter.value !== "all" ? templateFilter.value : "b2c";
    const card = buildTemplateCard({
      title: name,
      description,
      segment,
      badge: segment.toUpperCase(),
    });
    templateGrid.prepend(card);
    const filterEvent = new Event("change");
    templateFilter?.dispatchEvent(filterEvent);
  });
}

if (templateFilter && templateGrid) {
  const filterTemplates = () => {
    const value = templateFilter.value;
    templateGrid.querySelectorAll(".template-card").forEach((card) => {
      if (value === "all" || card.dataset.segment === value) {
        card.classList.remove("hidden");
      } else {
        card.classList.add("hidden");
      }
    });
  };
  templateFilter.addEventListener("change", filterTemplates);
  filterTemplates();
}

if (btnImportHtml) {
  btnImportHtml.addEventListener("click", () => {
    window.alert(
      "POST your HTML to /api/marketing/templates with { html } once your inline CSS pipeline is ready."
    );
  });
}

if (btnAddExperiment && experimentList) {
  btnAddExperiment.addEventListener("click", () => {
    const idea = window.prompt("Log your experiment hypothesis")?.trim();
    alert("Upload feature coming soon — connect your HTML to inline CSS and store in template library.");
  });
}

const btnAddExperiment = document.getElementById("btnAddExperiment");
const experimentList = document.getElementById("experimentIdeas");

if (btnAddExperiment && experimentList) {
  btnAddExperiment.addEventListener("click", () => {
    const idea = prompt("Log your experiment hypothesis")?.trim();
    if (!idea) return;
    const index = experimentList.children.length + 1;
    const li = document.createElement("li");
    li.textContent = `${index}️⃣ ${idea}`;
    experimentList.appendChild(li);
  });
}

if (refreshQueueBtn) {
  refreshQueueBtn.addEventListener("click", () => refreshTestQueue({ silent: false }));
const campaignList = document.getElementById("campaignList");

if (campaignList) {
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTestModal();
  }
});

hydrateTemplates();
refreshTestQueue();
refreshProviders();
autoRefreshQueue();

