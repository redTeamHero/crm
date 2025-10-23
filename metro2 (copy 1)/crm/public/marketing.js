import { api, getTranslation, getCurrentLanguage } from "./common.js";
import { setupPageTour } from "./tour-guide.js";

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
const htmlImportInput = document.getElementById("htmlImportInput");

const campaignListEl = document.getElementById("campaignList");
const campaignEmptyState = document.getElementById("campaignEmpty");
const btnAddCampaign = document.getElementById("btnAddCampaign");
const btnExportCampaigns = document.getElementById("btnExportCampaigns");
const campaignModal = document.getElementById("campaignModal");
const campaignForm = document.getElementById("campaignForm");
const campaignStatusMessage = document.getElementById("campaignStatus");
const campaignNameInput = document.getElementById("campaignName");
const campaignSegmentSelect = document.getElementById("campaignSegment");
const campaignStatusSelect = document.getElementById("campaignStatusSelect");
const campaignNextTouchInput = document.getElementById("campaignNextTouch");
const campaignKpiTargetInput = document.getElementById("campaignKpiTarget");
const campaignSummaryInput = document.getElementById("campaignSummary");
const campaignProgressInput = document.getElementById("campaignProgress");
const campaignProgressValue = document.getElementById("campaignProgressValue");

const MAX_IMPORTED_FILE_SIZE = 200 * 1024; // 200 KB
const MAX_IMPORTED_HTML_LENGTH = 20000;

const templateEditorModal = document.getElementById("templateEditorModal");
const templateEditorForm = document.getElementById("templateEditorForm");
const templateEditorTitleInput = document.getElementById("templateEditorTitle");
const templateEditorDescriptionInput = document.getElementById("templateEditorDescription");
const templateEditorSegmentSelect = document.getElementById("templateEditorSegment");
const templateEditorBadgeInput = document.getElementById("templateEditorBadge");
const templateEditorHtmlInput = document.getElementById("templateEditorHtml");
const templateEditorPreview = document.getElementById("templateEditorPreview");
const templateEditorMeta = document.getElementById("templateEditorMeta");
const templateEditorStatus = document.getElementById("templateEditorStatus");
const templateEditorHeading = document.getElementById("templateEditorHeading");

const btnAddExperiment = document.getElementById("btnAddExperiment");
const experimentList = document.getElementById("experimentIdeas");
const testChannelSelect = document.getElementById("testChannel");
const channelBadge = document.getElementById("marketingChannelBadge");

const SEGMENT_GRADIENTS = {
  b2c: "from-violet-100/80 to-white",
  b2b: "from-sky-100/70 to-white",
  attorneys: "from-amber-100/70 to-white",
  inactive: "from-rose-100/70 to-white",
};

const SEGMENT_LABELS = {
  b2c: "B2C",
  b2b: "B2B",
  attorneys: "Attorneys",
  inactive: "Inactive",
};

const CAMPAIGN_STATUS_COLORS = {
  draft: "bg-gradient-to-r from-slate-400 to-slate-600",
  scheduled: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
  running: "bg-gradient-to-r from-sky-500 to-indigo-500",
  paused: "bg-gradient-to-r from-amber-500 to-orange-500",
  completed: "bg-gradient-to-r from-emerald-500 to-teal-500",
};

const SAMPLE_DATA = {
  first_name: "Alex",
  last_name: "Ramirez",
  credit_score: "687",
  dispute_stage: "Round 2 Review",
  account_type: "Auto Loan",
  cta_link: "https://go.revolv.ai/next",
};

const activeChannel = detectActiveChannel(
  typeof window !== "undefined" ? window.location.pathname : ""
);
const shouldLoadSmsFeatures = !activeChannel || activeChannel === "sms";
const shouldLoadEmailFeatures = !activeChannel || activeChannel === "email";

const marketingTourSteps = (() => {
  if (activeChannel === "sms") {
    return [
      {
        id: "marketing-nav",
        title: "Navigate growth tabs",
        text: `<p class="font-semibold">Stay close to Dashboard, Leads, and Billing.</p>
               <p class="mt-1 text-xs text-slate-600">Swap between revenue views as you launch SMS campaigns.</p>`,
        attachTo: { element: "#primaryNav", on: "bottom" }
      },
      {
        id: "marketing-sms-builder",
        title: "Build premium SMS", 
        text: `<p class="font-semibold">Draft compliant outreach that feels concierge.</p>
               <p class="mt-1 text-xs text-slate-600">Personalize copy, set KPIs, and prep upsells before you wire Twilio.</p>`,
        attachTo: { element: "#marketingSmsBuilder", on: "top" }
      },
      {
        id: "marketing-sms-templates",
        title: "Template manager",
        text: `<p class="font-semibold">Store go-to scripts for every segment.</p>
               <p class="mt-1 text-xs text-slate-600">Save compliant messaging so closers stay on-brand.</p>`,
        attachTo: { element: "#smsTemplateForm", on: "left" }
      },
      {
        id: "marketing-test-queue",
        title: "Test queue",
        text: `<p class="font-semibold">Validate payloads before they go live.</p>
               <p class="mt-1 text-xs text-slate-600">Track test sends, CTA performance, and vendor readiness.</p>`,
        attachTo: { element: "#testQueueList", on: "top" }
      },
      {
        id: "marketing-providers",
        title: "Provider status",
        text: `<p class="font-semibold">Keep Twilio and SendGrid greenlit.</p>
               <p class="mt-1 text-xs text-slate-600">Document keys and mark integrations ready for automations.</p>`,
        attachTo: { element: "#providerStatusList", on: "top" }
      }
    ];
  }
  if (activeChannel === "email") {
    return [
      {
        id: "marketing-nav",
        title: "Navigate growth tabs",
        text: `<p class="font-semibold">Stay close to Dashboard, Leads, and Billing.</p>
               <p class="mt-1 text-xs text-slate-600">Flip between revenue views while you plan email flows.</p>`,
        attachTo: { element: "#primaryNav", on: "bottom" }
      },
      {
        id: "marketing-email-builder",
        title: "Design email assets",
        text: `<p class="font-semibold">Craft premium templates with polished copy.</p>
               <p class="mt-1 text-xs text-slate-600">Preview the journey and prep HTML before connecting SendGrid.</p>`,
        attachTo: { element: "#marketingEmailBuilder", on: "top" }
      },
      {
        id: "marketing-email-sequence",
        title: "Sequence builder",
        text: `<p class="font-semibold">Map nurture flows that convert.</p>
               <p class="mt-1 text-xs text-slate-600">Stack steps, merge in templates, and bundle upsells into every drip.</p>`,
        attachTo: { element: "#emailSequenceForm", on: "left" }
      },
      {
        id: "marketing-dispatch",
        title: "Dispatch scheduler",
        text: `<p class="font-semibold">Schedule sends and track cadence.</p>
               <p class="mt-1 text-xs text-slate-600">Log segments, targets, and KPIs before pushing to workers.</p>`,
        attachTo: { element: "#dispatchForm", on: "left" }
      },
      {
        id: "marketing-integration",
        title: "Integration checklist",
        text: `<p class="font-semibold">Wire API credentials without guesswork.</p>
               <p class="mt-1 text-xs text-slate-600">Document keys, curl tests, and provider readiness for dev handoff.</p>`,
        attachTo: { element: "#marketingIntegration", on: "top" }
      }
    ];
  }
  return [
    {
      id: "marketing-nav",
      title: "Navigate growth tabs",
      text: `<p class="font-semibold">Jump between Dashboard, Leads, Billing, and Marketing.</p>
             <p class="mt-1 text-xs text-slate-600">Use each to improve Lead→Consult%, Consult→Purchase%, and AOV.</p>`,
      attachTo: { element: "#primaryNav", on: "bottom" }
    },
    {
      id: "marketing-sms-builder",
      title: "SMS campaign builder",
      text: `<p class="font-semibold">Prototype compliant SMS before automating.</p>
             <p class="mt-1 text-xs text-slate-600">Document KPIs and upsells so revenue teams stay aligned.</p>`,
      attachTo: { element: "#marketingSmsBuilder", on: "top" }
    },
    {
      id: "marketing-email-builder",
      title: "Email template designer",
      text: `<p class="font-semibold">Draft conversion-first email assets.</p>
             <p class="mt-1 text-xs text-slate-600">Prep HTML and segmentation tags before wiring to providers.</p>`,
      attachTo: { element: "#marketingEmailBuilder", on: "top" }
    },
    {
      id: "marketing-automation",
      title: "Automation control center",
      text: `<p class="font-semibold">Manage templates, sequences, and dispatch queues.</p>
             <p class="mt-1 text-xs text-slate-600">Plan how each asset flows into your automation workers.</p>`,
      attachTo: { element: "#marketingAutomation", on: "top" }
    },
    {
      id: "marketing-integration",
      title: "Integration checklist",
      text: `<p class="font-semibold">Hand devs a clear activation plan.</p>
             <p class="mt-1 text-xs text-slate-600">Store keys, provider status, and curl tests so nothing stalls.</p>`,
      attachTo: { element: "#marketingIntegration", on: "top" }
    }
  ];
})();

setupPageTour('marketing', { steps: marketingTourSteps });

let templateCache = [];
let lastQueueItems = [];
let lastProviders = [];
let queueRefreshTimer = null;
let smsTemplateCache = [];
let emailSequenceCache = [];
let dispatchCache = [];
let campaignCache = [];
let sequenceStepIndex = 0;
let activeTemplateId = null;
let templateEditorLastUpdated = "";
let activeCampaignId = null;

function t(key, fallback = "") {
  return getTranslation(key, getCurrentLanguage()) || fallback;
}

function normalizePathname(pathname = "") {
  return String(pathname || "")
    .replace(/\/+$/u, "")
    .toLowerCase();
}

function detectActiveChannel(pathname = "") {
  const normalized = normalizePathname(pathname);
  if (!normalized) return null;
  if (normalized.endsWith("/marketing/sms")) return "sms";
  if (normalized.endsWith("/marketing/email")) return "email";
  return null;
}

function getCampaignStatusLabel(status) {
  const key = String(status || "draft").toLowerCase();
  const fallback = {
    draft: "Draft",
    scheduled: "Scheduled",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
  }[key] || key;
  return t(`marketing.campaigns.status.${key}`, fallback);
}

function getSegmentLabel(segment) {
  const key = String(segment || "b2c").toLowerCase();
  const fallback = SEGMENT_LABELS[key] || key.toUpperCase();
  return t(`marketing.campaigns.segment.${key}`, fallback);
}

function getCampaignStatusGradient(status) {
  const key = String(status || "draft").toLowerCase();
  return CAMPAIGN_STATUS_COLORS[key] || CAMPAIGN_STATUS_COLORS.draft;
}

function formatCampaignDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric" });
}

function isoToLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function localInputValueToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

function formatCampaignSubtitle(campaign) {
  const parts = [];
  if (campaign.nextTouchAt) {
    parts.push(
      t("marketing.campaigns.meta.nextTouch", "Next touch: {date}").replace(
        "{date}",
        formatCampaignDate(campaign.nextTouchAt)
      )
    );
  }
  parts.push(
    t("marketing.campaigns.meta.segment", "Segment: {segment}").replace(
      "{segment}",
      getSegmentLabel(campaign.segment)
    )
  );
  if (campaign.kpiTarget) {
    parts.push(
      t("marketing.campaigns.meta.kpi", "KPI: {kpi}").replace(
        "{kpi}",
        campaign.kpiTarget
      )
    );
  }
  return parts.join(" • ");
}

function applyChannelVisibility(channel) {
  if (typeof document === "undefined") return;
  if (document.body) {
    if (channel) document.body.dataset.marketingChannel = channel;
    else delete document.body.dataset.marketingChannel;
  }
  if (!channel) {
    document
      .querySelectorAll("[data-channel]")
      .forEach((el) => {
        el.classList.remove("channel-hidden");
        if (el.getAttribute("aria-hidden") === "true") {
          el.removeAttribute("aria-hidden");
        }
      });
    return;
  }
  document.querySelectorAll("[data-channel]").forEach((el) => {
    const raw = el.dataset.channel || "";
    const channels = raw
      .split(/[\s,]+/u)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const isVisible = channels.includes(channel);
    el.classList.toggle("channel-hidden", !isVisible);
    if (!isVisible) {
      el.setAttribute("aria-hidden", "true");
    } else if (el.getAttribute("aria-hidden") === "true") {
      el.removeAttribute("aria-hidden");
    }
  });
}

function configureChannelBadge(channel) {
  if (!channelBadge) return;
  if (!channel) {
    channelBadge.classList.add("hidden");
    channelBadge.textContent = "";
    return;
  }
  const key =
    channel === "sms" ? "marketing.channelBadges.sms" : "marketing.channelBadges.email";
  channelBadge.textContent = t(
    key,
    channel === "sms" ? "SMS Focus" : "Email Focus"
  );
  channelBadge.classList.remove("hidden");
}

function highlightActiveNavLink(channel) {
  if (typeof document === "undefined" || !channel) return;
  const targetSuffix = `/marketing/${channel}`;
  document
    .querySelectorAll('#primaryNavLinks a[href^="/marketing"]')
    .forEach((link) => {
      const href = normalizePathname(link.getAttribute("href") || "");
      const isActive = href.endsWith(targetSuffix);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
}

function configureTestModalChannel(channel) {
  if (!testChannelSelect) return;
  const options = Array.from(testChannelSelect.options || []);
  if (!channel) {
    options.forEach((option) => {
      option.hidden = false;
    });
    return;
  }
  let matched = false;
  options.forEach((option) => {
    const value = (option.value || "").toLowerCase();
    const shouldShow = value === channel;
    option.hidden = !shouldShow;
    if (shouldShow) {
      option.selected = true;
      matched = true;
    }
  });
  if (!matched) {
    testChannelSelect.value = channel;
  }
}

function updateDocumentTitleForChannel(channel) {
  if (typeof document === "undefined" || !channel) return;
  const key = channel === "sms" ? "marketing.meta.smsTitle" : "marketing.meta.emailTitle";
  const fallback =
    channel === "sms" ? "Marketing • SMS" : "Marketing • Email";
  const title = t(key, fallback);
  if (title) document.title = title;
}

applyChannelVisibility(activeChannel);
configureChannelBadge(activeChannel);
highlightActiveNavLink(activeChannel);
configureTestModalChannel(activeChannel);
updateDocumentTitleForChannel(activeChannel);

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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Failed to read file"));
    });
    reader.readAsText(file);
  });
}

function deriveTemplateTitleFromFile(fileName) {
  if (!fileName) {
    return t(
      "marketing.emailBuilder.prompts.importDefaultTitle",
      "Imported Template"
    );
  }
  return fileName
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

async function importHtmlFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORTED_FILE_SIZE) {
    window.alert(
      t(
        "marketing.emailBuilder.prompts.importTooLarge",
        "Your HTML file is over 200 KB. Minify inline CSS and try again."
      )
    );
    return;
  }

  try {
    const rawContent = await readFileAsText(file);
    const safeContent = (rawContent || "").slice(0, MAX_IMPORTED_HTML_LENGTH);
    if (!safeContent.trim()) {
      window.alert(
        t(
          "marketing.emailBuilder.prompts.importEmpty",
          "The selected HTML file was empty. Please upload a populated template."
        )
      );
      return;
    }

    const segment =
      templateFilter && templateFilter.value && templateFilter.value !== "all"
        ? templateFilter.value
        : "b2c";

    const title =
      deriveTemplateTitleFromFile(file.name).slice(0, 120) ||
      t("marketing.emailBuilder.prompts.importDefaultTitle", "Imported Template");

    openTemplateEditor(
      {
        title,
        description: t(
          "marketing.emailBuilder.prompts.importDescription",
          "Imported from uploaded HTML. Review copy before sending."
        ),
        segment,
        badge: segment.toUpperCase(),
        html: safeContent,
      },
      { segment }
    );

    setTemplateEditorStatus(
      t(
        "marketing.emailBuilder.prompts.importSuccess",
        "HTML loaded. Review, personalize, and save."
      )
    );
  } catch (error) {
    console.error("Failed to import HTML", error);
    window.alert(
      t("marketing.emailBuilder.prompts.importError", "Failed to import HTML: {error}").replace(
        "{error}",
        error?.message || "Unknown error"
      )
    );
  }
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

async function updateTemplateApi(id, template) {
  const res = await marketingRequest(`/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(template),
  });
  return res.template;
}

async function fetchCampaignsApi() {
  const res = await marketingRequest("/campaigns");
  return res.campaigns || [];
}

async function createCampaignApi(payload) {
  const res = await marketingRequest("/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.campaign;
}

async function updateCampaignApi(id, payload) {
  const res = await marketingRequest(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res.campaign;
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

function resetTemplateEditor() {
  if (templateEditorForm) {
    templateEditorForm.reset();
  }
  activeTemplateId = null;
  templateEditorLastUpdated = "";
  if (templateEditorStatus) {
    templateEditorStatus.textContent = "";
    templateEditorStatus.classList.add("hidden");
    templateEditorStatus.classList.remove(
      "bg-emerald-100",
      "text-emerald-700",
      "bg-rose-100",
      "text-rose-700"
    );
  }
  if (templateEditorBadgeInput && templateEditorSegmentSelect) {
    const segment = templateEditorSegmentSelect.value || "b2c";
    templateEditorBadgeInput.value = segment.toUpperCase();
  }
  if (templateEditorPreview) {
    templateEditorPreview.innerHTML = `<p class="text-xs text-slate-400">${t(
      "marketing.emailBuilder.editor.previewEmpty",
      "Add HTML to render preview."
    )}</p>`;
  }
  if (templateEditorMeta) {
    templateEditorMeta.textContent = "";
  }
}

function setTemplateEditorStatus(message, tone = "success") {
  if (!templateEditorStatus) return;
  templateEditorStatus.textContent = message;
  templateEditorStatus.classList.remove("hidden");
  templateEditorStatus.classList.remove(
    "bg-emerald-100",
    "text-emerald-700",
    "bg-rose-100",
    "text-rose-700"
  );
  if (tone === "error") {
    templateEditorStatus.classList.add("bg-rose-100", "text-rose-700");
  } else {
    templateEditorStatus.classList.add("bg-emerald-100", "text-emerald-700");
  }
}

function updateTemplatePreview() {
  if (!templateEditorPreview || !templateEditorHtmlInput) return;
  const raw = templateEditorHtmlInput.value || "";
  if (raw.trim()) {
    templateEditorPreview.innerHTML = applyMergeFields(raw);
  } else {
    templateEditorPreview.innerHTML = `<p class="text-xs text-slate-400">${t(
      "marketing.emailBuilder.editor.previewEmpty",
      "Add HTML to render preview."
    )}</p>`;
  }
  if (templateEditorMeta) {
    const parts = [];
    if (templateEditorLastUpdated) {
      parts.push(
        t("marketing.emailBuilder.editor.updatedLabel", "Updated {timestamp}").replace(
          "{timestamp}",
          templateEditorLastUpdated
        )
      );
    }
    parts.push(
      t("marketing.emailBuilder.editor.charCount", "{count} chars").replace(
        "{count}",
        raw.length
      )
    );
    templateEditorMeta.textContent = parts.join(" • ");
  }
}

function openTemplateEditor(template = null, { segment } = {}) {
  if (!templateEditorModal || !templateEditorForm) return;
  resetTemplateEditor();
  activeTemplateId = template?.id ?? null;
  templateEditorLastUpdated = template?.updatedAt
    ? new Date(template.updatedAt).toLocaleString()
    : template?.createdAt
    ? new Date(template.createdAt).toLocaleString()
    : "";
  if (templateEditorHeading) {
    templateEditorHeading.textContent = template
      ? t("marketing.emailBuilder.editor.headingEdit", "Edit Email Template")
      : t("marketing.emailBuilder.editor.headingNew", "New Email Template");
  }
  if (templateEditorTitleInput) {
    templateEditorTitleInput.value = template?.title || "";
  }
  if (templateEditorDescriptionInput) {
    templateEditorDescriptionInput.value = template?.description || "";
  }
  const defaultSegment = template?.segment || segment || "b2c";
  if (templateEditorSegmentSelect) {
    templateEditorSegmentSelect.value = defaultSegment;
  }
  if (templateEditorBadgeInput) {
    const badgeValue = template?.badge || defaultSegment.toUpperCase();
    templateEditorBadgeInput.value = badgeValue;
  }
  if (templateEditorHtmlInput) {
    templateEditorHtmlInput.value = template?.html || "";
  }
  updateTemplatePreview();
  templateEditorModal.classList.remove("hidden");
  templateEditorModal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
  if (templateEditorTitleInput) {
    templateEditorTitleInput.focus();
  }
}

function closeTemplateEditor() {
  if (!templateEditorModal) return;
  templateEditorModal.classList.add("hidden");
  templateEditorModal.classList.remove("flex");
  document.body.classList.remove("overflow-hidden");
  resetTemplateEditor();
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
  const stamp = template.updatedAt || template.createdAt;
  left.textContent = stamp
    ? new Date(stamp).toLocaleDateString()
    : t("marketing.emailBuilder.template.draftLabel", "Draft");
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn";
  editButton.textContent = t("marketing.emailBuilder.template.editButton", "Edit");
  editButton.addEventListener("click", () => {
    openTemplateEditor(template);
  });
  footer.appendChild(left);
  footer.appendChild(editButton);

  article.appendChild(header);
  article.appendChild(description);
  article.appendChild(footer);
  return article;
}

function renderTemplates() {
  if (!shouldLoadEmailFeatures || !templateGrid) return;
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
  if (!shouldLoadSmsFeatures || !smsTemplateList) return;
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
        showInlineStatus(smsTemplateStatus, "SMS template copied");
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
  if (!shouldLoadEmailFeatures || !emailSequenceList) return;
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
  if (!shouldLoadEmailFeatures || !dispatchList) return;
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

function updateCampaignProgressDisplay(value) {
  if (!campaignProgressValue) return;
  const num = Math.max(0, Math.min(Number(value) || 0, 100));
  campaignProgressValue.textContent = `${num}%`;
}

function resetCampaignModal() {
  if (campaignForm) {
    campaignForm.reset();
  }
  activeCampaignId = null;
  updateCampaignProgressDisplay(0);
  if (campaignStatusMessage) {
    campaignStatusMessage.textContent = "";
    campaignStatusMessage.classList.add("hidden");
    campaignStatusMessage.classList.remove(
      "bg-emerald-100",
      "text-emerald-700",
      "bg-rose-100",
      "text-rose-700"
    );
  }
}

function closeCampaignModal() {
  if (!campaignModal) return;
  campaignModal.classList.add("hidden");
  campaignModal.classList.remove("flex");
  document.body?.classList.remove("overflow-hidden");
  resetCampaignModal();
}

function openCampaignModal(campaign = null) {
  if (!campaignModal) return;
  resetCampaignModal();
  activeCampaignId = campaign?.id || null;
  if (campaignNameInput) campaignNameInput.value = campaign?.name || "";
  if (campaignSegmentSelect) campaignSegmentSelect.value = campaign?.segment || "b2c";
  if (campaignStatusSelect) campaignStatusSelect.value = campaign?.status || "draft";
  if (campaignProgressInput) {
    const progress = Math.max(0, Math.min(Number(campaign?.progress) || 0, 100));
    campaignProgressInput.value = String(progress);
    updateCampaignProgressDisplay(progress);
  }
  if (campaignNextTouchInput) {
    campaignNextTouchInput.value = isoToLocalInputValue(campaign?.nextTouchAt);
  }
  if (campaignKpiTargetInput) campaignKpiTargetInput.value = campaign?.kpiTarget || "";
  if (campaignSummaryInput) campaignSummaryInput.value = campaign?.summary || "";

  campaignModal.classList.remove("hidden");
  campaignModal.classList.add("flex");
  document.body?.classList.add("overflow-hidden");
  if (campaignNameInput) campaignNameInput.focus();
}

function createCampaignCard(campaign) {
  const article = document.createElement("article");
  article.className = "glass card bg-white/70 space-y-3 p-4";
  article.dataset.status = campaign.status || "draft";
  article.dataset.campaignId = campaign.id;

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3 text-sm";

  const titleWrap = document.createElement("div");
  titleWrap.className = "flex flex-col gap-1";
  const title = document.createElement("span");
  title.className = "font-semibold text-slate-800";
  title.textContent = campaign.name || t("marketing.campaigns.untitled", "Untitled campaign");
  titleWrap.appendChild(title);

  const subtitle = document.createElement("span");
  subtitle.className = "text-xs text-slate-500";
  subtitle.textContent = formatCampaignSubtitle(campaign);
  titleWrap.appendChild(subtitle);

  const actionWrap = document.createElement("div");
  actionWrap.className = "flex flex-col items-end gap-2";

  const statusChip = document.createElement("span");
  statusChip.className = "chip capitalize";
  statusChip.textContent = getCampaignStatusLabel(campaign.status);
  actionWrap.appendChild(statusChip);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn text-xs";
  editBtn.textContent = t("marketing.campaigns.actions.edit", "Edit");
  editBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openCampaignModal(campaign);
  });
  actionWrap.appendChild(editBtn);

  header.appendChild(titleWrap);
  header.appendChild(actionWrap);
  article.appendChild(header);

  if (campaign.summary) {
    const summary = document.createElement("p");
    summary.className = "text-xs text-slate-600";
    summary.textContent = campaign.summary;
    article.appendChild(summary);
  }

  const progressWrapper = document.createElement("div");
  progressWrapper.className = "h-2 w-full overflow-hidden rounded-full bg-slate-200";
  const progressInner = document.createElement("div");
  progressInner.className = `h-full rounded-full ${getCampaignStatusGradient(campaign.status)}`;
  const progressValue = Math.max(0, Math.min(Number(campaign.progress) || 0, 100));
  progressInner.style.width = `${progressValue}%`;
  progressWrapper.appendChild(progressInner);
  article.appendChild(progressWrapper);

  const meta = document.createElement("p");
  meta.className = "text-[11px] uppercase tracking-wide text-slate-400";
  const updated = campaign.updatedAt || campaign.createdAt;
  const updatedText = updated ? new Date(updated).toLocaleString() : new Date().toLocaleString();
  meta.textContent = t("marketing.campaigns.meta.updated", "Updated {timestamp}").replace(
    "{timestamp}",
    updatedText
  );
  article.appendChild(meta);

  article.addEventListener("click", () => {
    openCampaignModal(campaign);
  });

  return article;
}

function renderCampaigns() {
  if (!campaignListEl) return;
  campaignListEl.innerHTML = "";
  const sorted = campaignCache
    .slice()
    .sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
  if (!sorted.length) {
    if (campaignEmptyState) campaignEmptyState.classList.remove("hidden");
    return;
  }
  if (campaignEmptyState) campaignEmptyState.classList.add("hidden");
  sorted.forEach((campaign) => {
    campaignListEl.appendChild(createCampaignCard(campaign));
  });
}

async function hydrateCampaigns() {
  if (!campaignListEl) return;
  try {
    campaignCache = await fetchCampaignsApi();
  } catch (error) {
    console.error("Failed to load campaigns", error);
    campaignCache = [];
  }
  renderCampaigns();
}

function exportCampaignsToCsv() {
  if (!campaignCache.length) {
    window.alert(
      t("marketing.campaigns.export.empty", "Add a campaign before exporting.")
    );
    return;
  }
  const headers = [
    "Name",
    "Status",
    "Segment",
    "Progress",
    "Next Touch",
    "KPI Target",
    "Summary",
    "Updated At",
  ];
  const rows = campaignCache.map((campaign) => [
    campaign.name || "",
    getCampaignStatusLabel(campaign.status),
    getSegmentLabel(campaign.segment),
    Math.max(0, Math.min(Number(campaign.progress) || 0, 100)),
    campaign.nextTouchAt ? new Date(campaign.nextTouchAt).toISOString() : "",
    campaign.kpiTarget || "",
    campaign.summary || "",
    campaign.updatedAt || campaign.createdAt || "",
  ]);
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const str = value === null || value === undefined ? "" : String(value);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  if (!shouldLoadEmailFeatures || !dispatchTargetSelect) return;
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
  if (!shouldLoadEmailFeatures || !templateFilter || !templateGrid) return;
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
    header.className = "flex items-start justify-between gap-2 text-xs font-semibold text-slate-600";
    const channel = document.createElement("span");
    channel.textContent = `${item.channel?.toUpperCase() || "SMS"} • ${item.recipient}`;
    const meta = document.createElement("div");
    meta.className = "flex flex-col items-end gap-1 text-right";
    const timestamp = document.createElement("span");
    timestamp.className = "text-[10px] uppercase text-slate-400";
    timestamp.textContent = new Date(item.createdAt).toLocaleString();
    meta.appendChild(timestamp);

    if (item.status) {
      const status = String(item.status).toLowerCase();
      const fallbackMap = {
        queued: "Queued",
        sending: "Sending",
        sent: "Sent",
        failed: "Failed",
      };
      const statusLabel = t(`marketing.testQueue.status.${status}`, fallbackMap[status] || fallbackMap.queued);
      const statusClasses = {
        queued: "bg-amber-100 text-amber-700",
        sending: "bg-sky-100 text-sky-700",
        sent: "bg-emerald-100 text-emerald-700",
        failed: "bg-rose-100 text-rose-700",
      };
      const badge = document.createElement("span");
      badge.className = `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        statusClasses[status] || statusClasses.queued
      }`;
      badge.textContent = statusLabel;
      meta.appendChild(badge);
    }

    header.appendChild(channel);
    header.appendChild(meta);

    const body = document.createElement("p");
    body.className = "mt-1 text-xs text-slate-500";
    const campaign = item.metadata?.campaignName;
    body.textContent =
      campaign || item.notes || t("marketing.testQueue.previewFallback", "Preview ready for dispatch.");

    const footer = document.createElement("div");
    footer.className = "mt-2 flex flex-wrap gap-2 text-[10px] uppercase text-slate-400";
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
    if (item.deliveredAt) {
      const delivered = document.createElement("span");
      delivered.textContent = t(
        "marketing.testQueue.deliveredLabel",
        "Delivered {value}"
      ).replace("{value}", new Date(item.deliveredAt).toLocaleString());
      footer.appendChild(delivered);
    }

    li.appendChild(header);
    li.appendChild(body);
    if (footer.childElementCount) {
      li.appendChild(footer);
    }
    if (item.error) {
      const error = document.createElement("p");
      error.className = "mt-2 text-[11px] text-rose-600";
      error.textContent = t("marketing.testQueue.errorLabel", "Error: {error}").replace(
        "{error}",
        item.error
      );
      li.appendChild(error);
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
  if (!shouldLoadEmailFeatures || !templateGrid) return;
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
  if (!shouldLoadSmsFeatures || !smsTemplateList) return;
  try {
    smsTemplateCache = await fetchSmsTemplatesApi();
    renderSmsTemplates();
  } catch (error) {
    showInlineStatus(smsTemplateStatus, error.message || "Failed to load SMS templates", "error");
  }
}

async function hydrateEmailSequences() {
  if (!shouldLoadEmailFeatures || !emailSequenceList) return;
  try {
    emailSequenceCache = await fetchEmailSequencesApi();
    renderEmailSequences();
    syncDispatchTargets();
  } catch (error) {
    showInlineStatus(emailSequenceStatus, error.message || "Failed to load sequences", "error");
  }
}

async function hydrateDispatches() {
  if (!shouldLoadEmailFeatures || !dispatchList) return;
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

function bindTemplateEditor() {
  document.querySelectorAll("[data-close-template-editor]").forEach((btn) => {
    btn.addEventListener("click", closeTemplateEditor);
  });
  if (templateEditorModal) {
    templateEditorModal.addEventListener("click", (event) => {
      if (event.target === templateEditorModal) {
        closeTemplateEditor();
      }
    });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && templateEditorModal && !templateEditorModal.classList.contains("hidden")) {
      closeTemplateEditor();
    }
  });
  if (templateEditorHtmlInput) {
    templateEditorHtmlInput.addEventListener("input", updateTemplatePreview);
  }
  if (templateEditorSegmentSelect) {
    templateEditorSegmentSelect.addEventListener("change", () => {
      if (templateEditorBadgeInput && !templateEditorBadgeInput.value.trim()) {
        templateEditorBadgeInput.value = templateEditorSegmentSelect.value.toUpperCase();
      }
    });
  }
  if (!templateEditorForm) return;
  templateEditorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = templateEditorTitleInput?.value?.trim() || "";
    if (!title) {
      setTemplateEditorStatus(
        t("marketing.emailBuilder.editor.titleRequired", "Title required"),
        "error"
      );
      return;
    }
    const segment = templateEditorSegmentSelect?.value?.trim() || "b2c";
    const payload = {
      title,
      description: templateEditorDescriptionInput?.value?.trim() || "",
      segment,
      badge: templateEditorBadgeInput?.value?.trim() || segment.toUpperCase(),
      html: templateEditorHtmlInput?.value || "",
    };
    try {
      const template = activeTemplateId
        ? await updateTemplateApi(activeTemplateId, payload)
        : await createTemplateApi(payload);
      templateCache = [template, ...templateCache.filter((tpl) => tpl.id !== template.id)];
      renderTemplates();
      refreshStepTemplateOptions();
      syncDispatchTargets();
      templateEditorLastUpdated = template.updatedAt
        ? new Date(template.updatedAt).toLocaleString()
        : template.createdAt
        ? new Date(template.createdAt).toLocaleString()
        : new Date().toLocaleString();
      updateTemplatePreview();
      setTemplateEditorStatus(
        t("marketing.emailBuilder.editor.saveSuccess", "Template saved")
      );
      window.setTimeout(() => {
        closeTemplateEditor();
      }, 800);
    } catch (error) {
      setTemplateEditorStatus(
        t("marketing.emailBuilder.editor.saveError", "Failed to save template: {error}").replace(
          "{error}",
          error.message
        ),
        "error"
      );
    }
  });
}

function bindCampaignControls() {
  if (btnAddCampaign) {
    btnAddCampaign.addEventListener("click", () => {
      openCampaignModal();
    });
  }
  if (btnExportCampaigns) {
    btnExportCampaigns.addEventListener("click", exportCampaignsToCsv);
  }
  if (campaignModal) {
    campaignModal.addEventListener("click", (event) => {
      if (event.target === campaignModal) {
        closeCampaignModal();
      }
    });
  }
  document.querySelectorAll("[data-close-campaign]").forEach((btn) => {
    btn.addEventListener("click", closeCampaignModal);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && campaignModal && !campaignModal.classList.contains("hidden")) {
      closeCampaignModal();
    }
  });
  if (campaignProgressInput) {
    campaignProgressInput.addEventListener("input", (event) => {
      updateCampaignProgressDisplay(event.target.value);
    });
  }
  if (!campaignForm) return;
  campaignForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = campaignNameInput?.value?.trim() || "";
    if (!name) {
      showInlineStatus(
        campaignStatusMessage,
        t("marketing.campaigns.form.nameRequired", "Name required"),
        "error"
      );
      return;
    }
    const nextTouchIso = localInputValueToIso(campaignNextTouchInput?.value?.trim() || "");
    const payload = {
      name,
      segment: campaignSegmentSelect?.value?.trim() || "b2c",
      status: campaignStatusSelect?.value?.trim() || "draft",
      progress: Math.max(0, Math.min(Number(campaignProgressInput?.value || 0), 100)),
      nextTouchAt: nextTouchIso,
      kpiTarget: campaignKpiTargetInput?.value?.trim() || "",
      summary: campaignSummaryInput?.value?.trim() || "",
    };
    try {
      const campaign = activeCampaignId
        ? await updateCampaignApi(activeCampaignId, payload)
        : await createCampaignApi(payload);
      campaignCache = [campaign, ...campaignCache.filter((item) => item.id !== campaign.id)];
      renderCampaigns();
      showInlineStatus(
        campaignStatusMessage,
        activeCampaignId
          ? t("marketing.campaigns.form.updated", "Campaign updated")
          : t("marketing.campaigns.form.saved", "Campaign saved")
      );
      window.setTimeout(() => {
        closeCampaignModal();
      }, 600);
    } catch (error) {
      showInlineStatus(
        campaignStatusMessage,
        error.message || t("marketing.campaigns.form.error", "Failed to save campaign"),
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
    btnAddTemplate.addEventListener("click", () => {
      const segment = templateFilter && templateFilter.value !== "all" ? templateFilter.value : "b2c";
      openTemplateEditor(null, { segment });
    });
  }
  if (btnImportHtml && htmlImportInput) {
    btnImportHtml.addEventListener("click", () => {
      htmlImportInput.value = "";
      htmlImportInput.click();
    });
    htmlImportInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await importHtmlFile(file);
      htmlImportInput.value = "";
    });
  } else if (btnImportHtml) {
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
  if (shouldLoadEmailFeatures && addSequenceStepBtn && sequenceStepsContainer) {
    addSequenceStepBtn.addEventListener("click", () => createSequenceStepRow());
  }
  if (
    shouldLoadEmailFeatures &&
    sequenceStepsContainer &&
    !sequenceStepsContainer.childElementCount
  ) {
    createSequenceStepRow();
  }

  if (shouldLoadSmsFeatures && smsTemplateForm) {
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
        showInlineStatus(smsTemplateStatus, "SMS template saved");
        smsTemplateForm.reset();
      } catch (error) {
        showInlineStatus(smsTemplateStatus, error.message || "Failed to save SMS template", "error");
      }
    });
  }

  if (shouldLoadEmailFeatures && emailSequenceForm) {
    emailSequenceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(emailSequenceForm);
      const steps = gatherSequenceSteps().filter((step) => step.subject || step.templateId);
      if (!steps.length) {
        showInlineStatus(emailSequenceStatus, "Add at least one step", "error");
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
        showInlineStatus(emailSequenceStatus, "Name required", "error");
        return;
      }
      try {
        const sequence = await createEmailSequenceApi(payload);
        emailSequenceCache = [sequence, ...emailSequenceCache.filter((s) => s.id !== sequence.id)];
        renderEmailSequences();
        syncDispatchTargets();
        showInlineStatus(emailSequenceStatus, "Sequence saved");
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

  if (shouldLoadEmailFeatures && dispatchForm) {
    dispatchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(dispatchForm);
      const targetId = formData.get("targetId")?.toString().trim() || "";
      if (!targetId) {
        showInlineStatus(dispatchStatus, "Select template or sequence", "error");
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

  if (shouldLoadEmailFeatures && dispatchTypeSelect) {
    dispatchTypeSelect.addEventListener("change", () => syncDispatchTargets());
  }
  syncDispatchTargets();
}

function initCampaignStatusStyles() {
  renderCampaigns();
}

function initLanguageSync() {
  window.addEventListener("crm:language-change", () => {
    renderTemplates();
    renderTestQueue(lastQueueItems);
    renderProviders(lastProviders);
    renderSmsTemplates();
    renderEmailSequences();
    renderDispatches();
    renderCampaigns();
    updateSmsPreview();
    configureChannelBadge(activeChannel);
    updateDocumentTitleForChannel(activeChannel);
    highlightActiveNavLink(activeChannel);
  });
}

if (shouldLoadSmsFeatures) {
  bindSmsPreviewControls();
}
bindTestModal();
if (shouldLoadEmailFeatures) {
  bindTemplateEditor();
  bindTemplateControls();
}
bindExperimentControls();
bindRefreshControls();
bindAutomationControls();
bindCampaignControls();
initCampaignStatusStyles();
initLanguageSync();

if (shouldLoadEmailFeatures) {
  resetTemplateEditor();
  hydrateTemplates();
  hydrateEmailSequences();
  hydrateDispatches();
} else {
  resetTemplateEditor();
}
if (shouldLoadSmsFeatures) {
  hydrateSmsTemplates();
}
hydrateCampaigns();
refreshTestQueue();
refreshProviders();
autoRefreshQueue();
window.addEventListener('crm:language-change', () => {
  updateSmsPreview();
});

