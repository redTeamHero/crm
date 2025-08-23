
const QUESTIONS = [
  {
    q: "Which hotkey opens the help panel?",
    a: ["H", "E", "U", "G"],
    correct: 0,
  },
  {
    q: "What does R do on the CRM page?",
    a: ["Removes focused card or current report", "Refreshes page", "Runs analyzer", "Renames consumer"],
    correct: 0,
  },
  {
    q: "Which key starts a new consumer?",
    a: ["N", "C", "S", "A"],
    correct: 0,
  },
  {
    q: "When the Edit modal is open, what does S do?",
    a: ["Save form", "Select all bureaus", "Start quiz", "Search consumer"],
    correct: 0,
  },
  {
    q: "Which hotkey toggles Identity Theft special mode?",
    a: ["I", "D", "S", "A"],
    correct: 0,
  },
  {
    q: "Which hotkey clears (cancel/filters/mode) depending on state?",
    a: ["C", "R", "H", "U"],
    correct: 0,
  },
    {
    q: "What does G do on the CRM screen?",
    a: ["Generate letters", "Open Help", "Remove card", "Upload report"],
    correct: 0
  },
  {
    q: "Which key removes/hides the focused tradeline card?",
    a: ["R", "D", "A", "Esc"],
    correct: 1
  },
  {
    q: "Which keys toggle special tagging modes?",
    a: ["I / D / S", "N / E / U", "G / P / H", "C / A / R"],
    correct: 0
  },
  {
    q: "What does C do?",
    a: ["Create consumer", "Clear (context-aware)", "Copy tradeline", "Cancel printing"],
    correct: 1
  },
  {
    q: "On the letters page, what does P do?",
    a: ["Preview first letter", "Print last previewed/first", "Open HTML", "Go to previous page"],
    correct: 1
  },
  {
    q: "On the letters page, what does H do?",
    a: ["Open HTML of last previewed/first", "Open Help", "Hide card", "Highlight conflicts"],
    correct: 0
  }
];

const LS_KEY = "crm_hotkey_quiz_best";

function el(tag, attrs={}, ...children){
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if (k === "class") n.className = v;
    else if (k === "for") n.htmlFor = v;
    else n.setAttribute(k, v);
  });
  children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

function renderQuiz(){
  const form = el("form", { id:"quizForm", class:"space-y-3" });

  const best = Number(localStorage.getItem(LS_KEY) || "0");
  form.appendChild(el("div", { class:"text-sm muted" }, `Best score: ${best}/${QUESTIONS.length}`));

  QUESTIONS.forEach((item, i)=>{
    const block = el("div", { class:"glass card" });
    block.appendChild(el("div", { class:"font-medium mb-2" }, `${i+1}. ${item.q}`));
    const opts = el("div", { class:"space-y-1" });
    item.a.forEach((opt, j)=>{
      const id = `q${i}_${j}`;
      const row = el("label", { class:"flex items-center gap-2 cursor-pointer" });
      row.appendChild(el("input", { type:"radio", name:`q${i}`, value:String(j), id }));
      row.appendChild(el("span", { }, opt));
      opts.appendChild(row);
    });
    block.appendChild(opts);
    form.appendChild(block);
  });

  const result = el("div", { id:"quizResult", class:"text-sm" });
  form.appendChild(result);

  // mount into #quizRoot via bridge the main page provided
  window.__quiz_mount?.(form);

  // expose submit
  window.__quiz_submit = () => {
    const data = new FormData(form);
    let score = 0;
    QUESTIONS.forEach((q, i)=>{
      const v = Number(data.get(`q${i}`));
      if (v === q.correct) score++;
    });
    const bestNow = Math.max(score, Number(localStorage.getItem(LS_KEY) || "0"));
    localStorage.setItem(LS_KEY, String(bestNow));

    result.textContent = `Score: ${score}/${QUESTIONS.length}  •  Best: ${bestNow}/${QUESTIONS.length}`;
  };
}

// public hook to re-render when the modal opens
window.__quiz_render = renderQuiz;
