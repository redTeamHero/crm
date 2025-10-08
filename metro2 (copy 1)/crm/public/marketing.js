const smsMessageInput = document.getElementById("smsMessage");
const smsPreviewBubble = document.getElementById("smsPreviewBubble");
const smsCharCount = document.getElementById("smsCharCount");
const smsPreviewBtn = document.getElementById("smsPreviewBtn");
const smsTestBtn = document.getElementById("smsTestBtn");
const mergeFieldSelect = document.getElementById("mergeFieldSelect");

const SAMPLE_DATA = {
  first_name: "Alex",
  last_name: "Ramirez",
  credit_score: "687",
  dispute_stage: "Round 2 Review",
  account_type: "Auto Loan",
  cta_link: "https://go.revolv.ai/next",
};

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
