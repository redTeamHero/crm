import"./evolv-light-CscajxBz.js";/* empty css              */import"./common-cmR40mwU.js";function e(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}var t=e=>document.querySelector(e),n=t(`#quiz`),r=t(`#result`),i=[{q:`Which hotkey opens the help panel?`,a:[`H`,`E`,`U`,`G`],correct:0},{q:`What does R do on the CRM page?`,a:[`Removes focused card or current report`,`Refreshes page`,`Records note`,`Renames consumer`],correct:0},{q:`Which key starts a new consumer?`,a:[`N`,`C`,`S`,`A`],correct:0},{q:`When the Edit modal is open, what does S do?`,a:[`Save form`,`Select all bureaus`,`Start quiz`,`Search consumer`],correct:0},{q:`Which hotkey toggles Identity Theft special mode?`,a:[`I`,`D`,`S`,`A`],correct:0},{q:`Which hotkey clears (cancel/filters/mode) depending on state?`,a:[`C`,`R`,`H`,`U`],correct:0}];function a(){n.innerHTML=``,i.forEach((t,r)=>{let i=document.createElement(`div`);i.className=`border rounded-xl p-4 bg-slate-50`,i.innerHTML=`
      <div class="font-medium mb-2">${r+1}. ${e(t.q)}</div>
      <div class="grid md:grid-cols-2 gap-2">
        ${t.a.map((t,n)=>`
          <label class="flex items-center gap-2 border rounded p-2 bg-white">
            <input type="radio" name="q${r}" value="${n}" />
            <span>${e(t)}</span>
          </label>
        `).join(``)}
      </div>
    `,n.appendChild(i)}),r.textContent=``}a(),t(`#btnRetry`).addEventListener(`click`,a),t(`#btnSubmit`).addEventListener(`click`,()=>{let e=0;i.forEach((t,n)=>{Number((document.querySelector(`input[name="q${n}"]:checked`)||{}).value)===t.correct&&e++}),r.textContent=`Score: ${e} / ${i.length} ${e===i.length?`🎉`:``}`});