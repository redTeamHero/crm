// public/quiz.js
const Q = (s) => document.querySelector(s);
const quizEl = Q("#quiz");
const resultEl = Q("#result");

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
];

function render(){
  quizEl.innerHTML = "";
  QUESTIONS.forEach((item, idx)=>{
    const block = document.createElement("div");
    block.className = "border rounded-xl p-4 bg-slate-50";
    block.innerHTML = `
      <div class="font-medium mb-2">${idx+1}. ${item.q}</div>
      <div class="grid md:grid-cols-2 gap-2">
        ${item.a.map((opt,i)=>`
          <label class="flex items-center gap-2 border rounded p-2 bg-white">
            <input type="radio" name="q${idx}" value="${i}" />
            <span>${opt}</span>
          </label>
        `).join("")}
      </div>
    `;
    quizEl.appendChild(block);
  });
  resultEl.textContent = "";
}
render();

Q("#btnRetry").addEventListener("click", render);

Q("#btnSubmit").addEventListener("click", ()=>{
  let score = 0;
  QUESTIONS.forEach((item, idx)=>{
    const v = Number((document.querySelector(`input[name="q${idx}"]:checked`)||{}).value);
    if (v === item.correct) score++;
  });
  resultEl.textContent = `Score: ${score} / ${QUESTIONS.length} ${score===QUESTIONS.length ? "🎉" : ""}`;
});
