(() => {
  const token = localStorage.getItem('diy_token');
  let currentUser = null;
  let currentReport = null;
  let violations = [];

  const userEmail = document.getElementById('userEmail');
  const planBadge = document.getElementById('planBadge');
  const btnLogout = document.getElementById('btnLogout');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const violationsSection = document.getElementById('violationsSection');
  const violationsList = document.getElementById('violationsList');
  const noViolations = document.getElementById('noViolations');
  const lettersSection = document.getElementById('lettersSection');
  const lettersList = document.getElementById('lettersList');
  const noLetters = document.getElementById('noLetters');
  const btnRunAudit = document.getElementById('btnRunAudit');
  const btnGenerateLetters = document.getElementById('btnGenerateLetters');
  const upgradeCard = document.getElementById('upgradeCard');

  async function init() {
    if (!token) {
      window.location.href = '/diy/login';
      return;
    }

    try {
      const res = await fetch('/api/diy/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Session expired');
      const data = await res.json();
      currentUser = data.user;
      userEmail.textContent = currentUser.email;
      userEmail.classList.remove('hidden');
      updatePlanBadge(currentUser.plan);

      if (currentUser.plan === 'free') {
        upgradeCard.classList.remove('hidden');
      }

      loadReports();
      loadLetters();
    } catch (e) {
      localStorage.removeItem('diy_token');
      window.location.href = '/diy/login';
    }
  }

  function updatePlanBadge(plan) {
    const colors = {
      free: 'bg-slate-100 text-slate-600',
      basic: 'bg-blue-100 text-blue-700',
      pro: 'bg-emerald-100 text-emerald-700'
    };
    planBadge.className = `text-xs px-2 py-0.5 rounded-full ${colors[plan] || colors.free}`;
    planBadge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  function updateStepStatus(stepNum, status) {
    const el = document.getElementById(`step${stepNum}`);
    if (!el) return;
    el.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ';
    if (status === 'complete') {
      el.className += 'bg-emerald-500 text-white';
      el.innerHTML = '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>';
    } else if (status === 'active') {
      el.className += 'bg-emerald-500 text-white';
      el.textContent = stepNum;
    } else {
      el.className += 'bg-slate-200 text-slate-500';
      el.textContent = stepNum;
    }
  }

  async function loadReports() {
    try {
      const res = await fetch('/api/diy/reports', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.reports && data.reports.length > 0) {
        currentReport = data.reports[0];
        btnRunAudit.disabled = false;
        updateStepStatus(1, 'complete');
      }
    } catch (e) {
      console.error('Failed to load reports:', e);
    }
  }

  async function loadLetters() {
    try {
      const res = await fetch('/api/diy/letters', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.letters && data.letters.length > 0) {
        lettersSection.classList.remove('hidden');
        noLetters.classList.add('hidden');
        lettersList.innerHTML = data.letters.map(letter => `
          <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p class="font-medium text-slate-800">${letter.bureau || 'Dispute Letter'}</p>
              <p class="text-xs text-slate-500">${new Date(letter.createdAt).toLocaleDateString()}</p>
            </div>
            <a href="/api/diy/letters/${letter.id}/download" class="text-sm text-blue-600 hover:underline">Download</a>
          </div>
        `).join('');
        updateStepStatus(3, 'complete');
      }
    } catch (e) {
      console.error('Failed to load letters:', e);
    }
  }

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('border-emerald-400', 'bg-emerald-50');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('border-emerald-400', 'bg-emerald-50');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('border-emerald-400', 'bg-emerald-50');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      handleFile(fileInput.files[0]);
    }
  });

  async function handleFile(file) {
    const formData = new FormData();
    formData.append('report', file);

    uploadProgress.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = '0%';

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/diy/reports/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = pct + '%';
          progressText.textContent = pct + '%';
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          currentReport = data.report;
          btnRunAudit.disabled = false;
          updateStepStatus(1, 'complete');
          setTimeout(() => {
            uploadProgress.classList.add('hidden');
          }, 1000);
        } else {
          alert('Upload failed: ' + xhr.statusText);
          uploadProgress.classList.add('hidden');
        }
      };

      xhr.onerror = () => {
        alert('Upload failed');
        uploadProgress.classList.add('hidden');
      };

      xhr.send(formData);
    } catch (e) {
      alert('Upload failed: ' + e.message);
      uploadProgress.classList.add('hidden');
    }
  }

  btnRunAudit.addEventListener('click', async () => {
    if (!currentReport) return;

    btnRunAudit.disabled = true;
    btnRunAudit.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running audit...';

    try {
      const res = await fetch(`/api/diy/reports/${currentReport.id}/audit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Audit failed');

      violations = data.violations || [];
      violationsSection.classList.remove('hidden');

      if (violations.length > 0) {
        noViolations.classList.add('hidden');
        violationsList.innerHTML = violations.map(v => `
          <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div class="flex items-start gap-3">
              <span class="text-red-500 mt-0.5">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
              </span>
              <div class="flex-1">
                <p class="font-medium text-slate-800">${v.title || v.ruleId}</p>
                <p class="text-sm text-slate-600 mt-1">${v.explanation || v.description || ''}</p>
                ${v.bureau ? `<span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">${v.bureau}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('');
        btnGenerateLetters.disabled = false;
        updateStepStatus(2, 'complete');
      } else {
        noViolations.classList.remove('hidden');
        violationsList.innerHTML = '';
      }

      btnRunAudit.disabled = false;
      btnRunAudit.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> Run Audit';
    } catch (e) {
      alert('Audit failed: ' + e.message);
      btnRunAudit.disabled = false;
      btnRunAudit.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> Run Audit';
    }
  });

  btnGenerateLetters.addEventListener('click', async () => {
    if (violations.length === 0) return;

    if (currentUser.plan === 'free') {
      alert('Please upgrade to Basic or Pro plan to generate dispute letters.');
      return;
    }

    btnGenerateLetters.disabled = true;
    btnGenerateLetters.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';

    try {
      const res = await fetch(`/api/diy/reports/${currentReport.id}/letters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ violations })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Letter generation failed');

      loadLetters();
      updateStepStatus(3, 'complete');

      btnGenerateLetters.disabled = false;
      btnGenerateLetters.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generate Letters';
    } catch (e) {
      alert('Letter generation failed: ' + e.message);
      btnGenerateLetters.disabled = false;
      btnGenerateLetters.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generate Letters';
    }
  });

  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('diy_token');
    window.location.href = '/diy/login';
  });

  init();
})();
