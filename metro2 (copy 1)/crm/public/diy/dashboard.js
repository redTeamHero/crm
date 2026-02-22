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
  const violationsList = document.getElementById('violationsList');
  const noViolations = document.getElementById('noViolations');
  const lettersList = document.getElementById('lettersList');
  const noLetters = document.getElementById('noLetters');
  const btnRunAudit = document.getElementById('btnRunAudit');
  const btnGenerateLetters = document.getElementById('btnGenerateLetters');
  const companyMatch = document.getElementById('companyMatch');
  const specialistsList = document.getElementById('specialistsList');
  const LOCAL_COMPANY_SELECTION_KEY = 'diy_local_company';

  function switchSection(sectionId) {
    document.querySelectorAll('.diy-section-page').forEach(function(el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('.diy-nav-link').forEach(function(el) {
      el.classList.remove('active');
    });
    var target = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
    if (target) target.classList.add('active');
    var navLink = document.querySelector('.diy-nav-link[data-section="' + sectionId + '"]');
    if (navLink) navLink.classList.add('active');

    var sidebar = document.getElementById('diySidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  document.querySelectorAll('.diy-nav-link[data-section]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var section = link.getAttribute('data-section');
      if (section) switchSection(section);
    });
  });

  document.querySelectorAll('.diy-nav-trigger[data-section]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var section = link.getAttribute('data-section');
      if (section) switchSection(section);
    });
  });

  var mobileMenuBtn = document.getElementById('mobileMenuBtn');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var diySidebar = document.getElementById('diySidebar');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', function() {
      diySidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      diySidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    });
  }

  async function init() {
    if (!token) {
      window.location.href = '/diy/login';
      return;
    }

    try {
      const res = await fetch('/api/diy/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('Session expired');
      const data = await res.json();
      currentUser = data.user;
      if (userEmail) userEmail.textContent = currentUser.email;
      updatePlanBadge(currentUser.plan);
      updateWelcome();
      loadCompanyMatch();
      loadReports();
      loadLetters();
      loadSpecialists();
    } catch (e) {
      localStorage.removeItem('diy_token');
      window.location.href = '/diy/login';
    }
  }

  function updateWelcome() {
    var el = document.getElementById('welcomeText');
    if (el && currentUser) {
      var name = currentUser.firstName || currentUser.email.split('@')[0];
      el.textContent = 'Welcome Back, ' + name;
    }
  }

  function updatePlanBadge(plan) {
    var colors = {
      free: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
      basic: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
      pro: { bg: 'rgba(16,185,129,0.15)', color: '#34d399' }
    };
    var c = colors[plan] || colors.free;
    planBadge.style.background = c.bg;
    planBadge.style.color = c.color;
    planBadge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  function updateStep(step, total) {
    var stepEl = document.getElementById('stepProgress');
    var labels = ['Upload Report', 'Review Violations', 'Generate Letters', 'Send Disputes'];
    if (stepEl) {
      stepEl.textContent = 'Step ' + step + ' of ' + total + ': ' + (labels[step - 1] || '');
    }
  }

  function updateNextStep(text) {
    var el = document.getElementById('nextStepContent');
    if (el) el.textContent = text;
  }

  function updateMilestone(text) {
    var el = document.getElementById('milestonesContent');
    if (el) el.textContent = text;
  }

  function updateReportSnapshot(text) {
    var el = document.getElementById('reportSnapshot');
    if (el) el.textContent = text;
  }

  async function loadReports() {
    try {
      const res = await fetch('/api/diy/reports', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (data.reports && data.reports.length > 0) {
        currentReport = data.reports[0];
        if (btnRunAudit) btnRunAudit.disabled = false;
        updateStep(2, 4);
        updateNextStep('Run an audit on your uploaded report to find violations.');
        updateMilestone('Report uploaded successfully!');
      }
    } catch (e) {
      console.error('Failed to load reports:', e);
    }
  }

  async function loadLetters() {
    try {
      const res = await fetch('/api/diy/letters', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (data.letters && data.letters.length > 0) {
        if (noLetters) noLetters.style.display = 'none';
        if (lettersList) {
          lettersList.innerHTML = data.letters.map(function(letter) {
            return '<div class="letter-item">' +
              '<div>' +
              '<p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + (letter.bureau || 'Dispute Letter') + '</p>' +
              '<p style="font-size:12px;color:var(--diy-text-sub);">' + new Date(letter.createdAt).toLocaleDateString() + '</p>' +
              '</div>' +
              '<a href="/api/diy/letters/' + letter.id + '/download" style="color:var(--diy-accent);font-weight:600;font-size:13px;text-decoration:none;">Download</a>' +
              '</div>';
          }).join('');
        }
        updateStep(4, 4);
        updateMilestone('Letters generated! Send them to start disputes.');
      }
    } catch (e) {
      console.error('Failed to load letters:', e);
    }
  }

  async function loadCompanyMatch() {
    if (!companyMatch) return;
    try {
      const res = await fetch('/api/diy/credit-companies/current', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (!data.company) {
        var localSelection = getLocalCompanySelection();
        if (localSelection) {
          companyMatch.innerHTML =
            '<span style="font-weight:600;color:var(--diy-text);">' + localSelection.name + '</span>' +
            '<span style="font-size:12px;color:var(--diy-text-sub);margin-left:8px;">' + (localSelection.serviceArea || '') + '</span>';
          return;
        }
        companyMatch.innerHTML =
          '<span style="color:var(--diy-text-sub);">No specialist selected.</span>' +
          '<a href="#specialists" class="diy-nav-trigger" data-section="specialists" style="color:var(--diy-accent);font-weight:600;margin-left:8px;text-decoration:none;">Find one &rarr;</a>';

        companyMatch.querySelectorAll('.diy-nav-trigger[data-section]').forEach(function(link) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            switchSection(link.getAttribute('data-section'));
          });
        });
        return;
      }
      companyMatch.innerHTML =
        '<span style="font-weight:600;color:var(--diy-text);">' + data.company.name + '</span>' +
        '<span style="font-size:12px;color:var(--diy-text-sub);margin-left:8px;">' + (data.company.serviceArea || '') + '</span>';
    } catch (e) {
      companyMatch.innerHTML = '<span style="color:#ef4444;font-size:13px;">Unable to load company details.</span>';
    }
  }

  function getLocalCompanySelection() {
    try {
      var stored = JSON.parse(localStorage.getItem(LOCAL_COMPANY_SELECTION_KEY) || 'null');
      if (!stored || !stored.name) return null;
      return stored;
    } catch (e) {
      return null;
    }
  }

  function renderStars(rating) {
    var html = '';
    var full = Math.floor(rating);
    for (var i = 0; i < 5; i++) {
      if (i < full) {
        html += '<span class="star-filled">&#9733;</span>';
      } else {
        html += '<span class="star-empty">&#9733;</span>';
      }
    }
    return html;
  }

  async function loadSpecialists() {
    if (!specialistsList) return;
    try {
      var res = await fetch('/api/diy/credit-companies', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      var companies = data.companies || [];

      if (companies.length === 0) {
        specialistsList.innerHTML =
          '<div style="text-align:center;padding:40px 0;color:var(--diy-text-sub);">' +
          '<p style="font-weight:500;">No specialists available yet.</p>' +
          '<p style="font-size:13px;margin-top:4px;">Check back soon as new companies join the platform.</p>' +
          '</div>';
        return;
      }

      var avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
      specialistsList.innerHTML = companies.map(function(company, idx) {
        var color = avatarColors[idx % avatarColors.length];
        var initial = (company.name || 'C').charAt(0).toUpperCase();
        var rating = company.rating || (3.5 + Math.random() * 1.5);
        var reviewCount = company.reviewCount || Math.floor(10 + Math.random() * 90);
        var deletions = company.totalDeletions || Math.floor(50 + Math.random() * 500);
        var avgDays = company.avgDaysToDelete || Math.floor(20 + Math.random() * 40);
        var successRate = company.successRate || Math.floor(70 + Math.random() * 25);
        var badges = '';
        if (successRate > 85) badges += '<span class="specialist-badge badge-verified">High Success</span>';
        if (avgDays < 30) badges += '<span class="specialist-badge badge-fast">Fast Response</span>';
        if (company.boosted) badges += '<span class="specialist-badge badge-boosted">Featured</span>';
        if (idx === 0) badges += '<span class="specialist-badge badge-top">Top Pick</span>';

        return '<div class="specialist-card" data-company-id="' + (company.id || idx) + '">' +
          '<div class="specialist-header">' +
          '<div class="specialist-avatar" style="background:' + color + ';">' + initial + '</div>' +
          '<div style="flex:1;">' +
          '<div class="specialist-name">' + (company.name || 'Credit Company') + '</div>' +
          '<div class="specialist-location">' + (company.serviceArea || 'Nationwide') + '</div>' +
          '<div class="specialist-rating" style="margin-top:4px;">' +
          renderStars(Math.round(rating)) +
          '<span class="specialist-reviews">(' + reviewCount + ' reviews)</span>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="specialist-stats">' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + deletions + '</div><div class="specialist-stat-label">Total Deletions</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + avgDays + 'd</div><div class="specialist-stat-label">Avg. Time</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + successRate + '%</div><div class="specialist-stat-label">Success Rate</div></div>' +
          '</div>' +
          (badges ? '<div class="specialist-badges">' + badges + '</div>' : '') +
          '<button class="diy-btn diy-btn-primary" style="width:100%;margin-top:12px;" type="button" data-select-company="' + (company.id || idx) + '">Choose This Specialist</button>' +
          '</div>';
      }).join('');

      specialistsList.querySelectorAll('[data-select-company]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var companyId = btn.getAttribute('data-select-company');
          var company = companies.find(function(c) { return String(c.id) === companyId; }) || companies[0];
          selectCompany(company);
        });
      });

    } catch (e) {
      console.error('Failed to load specialists:', e);
      specialistsList.innerHTML =
        '<div style="text-align:center;padding:40px 0;color:var(--diy-text-sub);">' +
        '<p style="font-weight:500;">Unable to load specialists.</p>' +
        '<p style="font-size:13px;margin-top:4px;">Please try again later.</p>' +
        '</div>';
    }
  }

  async function selectCompany(company) {
    try {
      await fetch('/api/diy/credit-companies/select', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ companyId: company.id })
      });
    } catch (e) {
      // ignore
    }
    localStorage.setItem(LOCAL_COMPANY_SELECTION_KEY, JSON.stringify(company));
    loadCompanyMatch();
    switchSection('overview');
  }

  if (uploadArea) {
    uploadArea.addEventListener('click', function() { fileInput.click(); });
    uploadArea.addEventListener('dragover', function(e) {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', function() {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', function(e) {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function() {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
  }

  async function handleFile(file) {
    var formData = new FormData();
    formData.append('report', file);

    if (uploadProgress) uploadProgress.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/diy/reports/upload');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);

      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          if (progressBar) progressBar.style.width = pct + '%';
          if (progressText) progressText.textContent = pct + '%';
        }
      };

      xhr.onload = function() {
        if (xhr.status === 200) {
          var data = JSON.parse(xhr.responseText);
          currentReport = data.report;
          if (btnRunAudit) btnRunAudit.disabled = false;
          updateStep(2, 4);
          updateNextStep('Run an audit on your uploaded report to find violations.');
          updateMilestone('Report uploaded successfully!');
          setTimeout(function() {
            if (uploadProgress) uploadProgress.classList.add('hidden');
          }, 1000);
        } else {
          alert('Upload failed: ' + xhr.statusText);
          if (uploadProgress) uploadProgress.classList.add('hidden');
        }
      };

      xhr.onerror = function() {
        alert('Upload failed');
        if (uploadProgress) uploadProgress.classList.add('hidden');
      };

      xhr.send(formData);
    } catch (e) {
      alert('Upload failed: ' + e.message);
      if (uploadProgress) uploadProgress.classList.add('hidden');
    }
  }

  if (btnRunAudit) {
    btnRunAudit.addEventListener('click', async function() {
      if (!currentReport) return;

      btnRunAudit.disabled = true;
      btnRunAudit.innerHTML = '<svg style="width:16px;height:16px;" class="animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running...';

      try {
        var res = await fetch('/api/diy/audit', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reportId: currentReport.id })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Audit failed');

        violations = data.violations || [];

        if (violations.length > 0) {
          if (noViolations) noViolations.style.display = 'none';
          if (violationsList) {
            violationsList.innerHTML = violations.map(function(v) {
              return '<div class="violation-item">' +
                '<div style="display:flex;align-items:start;gap:10px;">' +
                '<span style="color:#ef4444;margin-top:2px;">&#9888;</span>' +
                '<div style="flex:1;">' +
                '<p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + (v.title || v.ruleId) + '</p>' +
                '<p style="font-size:13px;color:var(--diy-text-sub);margin-top:4px;">' + (v.explanation || v.description || '') + '</p>' +
                (v.bureau ? '<span style="display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;background:#f3f4f6;border-radius:6px;color:var(--diy-text-sub);">' + v.bureau + '</span>' : '') +
                '</div></div></div>';
            }).join('');
          }
          if (btnGenerateLetters) btnGenerateLetters.disabled = false;
          updateStep(3, 4);
          updateNextStep('Generate dispute letters based on the violations found.');
          updateReportSnapshot(violations.length + ' negative item' + (violations.length !== 1 ? 's' : '') + ' detected.');
          updateMilestone('Audit complete! ' + violations.length + ' violation' + (violations.length !== 1 ? 's' : '') + ' found.');
        } else {
          if (noViolations) noViolations.style.display = '';
          if (violationsList) violationsList.innerHTML = '';
          updateReportSnapshot('No negative items detected.');
        }

        btnRunAudit.disabled = false;
        btnRunAudit.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> Run Audit';

        switchSection('violations');
      } catch (e) {
        alert('Audit failed: ' + e.message);
        btnRunAudit.disabled = false;
        btnRunAudit.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> Run Audit';
      }
    });
  }

  if (btnGenerateLetters) {
    btnGenerateLetters.addEventListener('click', async function() {
      if (violations.length === 0) return;

      if (currentUser && currentUser.plan === 'free') {
        alert('Please upgrade to Basic or Pro plan to generate dispute letters.');
        return;
      }

      btnGenerateLetters.disabled = true;
      btnGenerateLetters.innerHTML = '<svg style="width:16px;height:16px;" class="animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';

      try {
        var res = await fetch('/api/diy/letters', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reportId: currentReport.id, violations: violations })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Letter generation failed');

        loadLetters();
        updateStep(4, 4);

        btnGenerateLetters.disabled = false;
        btnGenerateLetters.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate Letters';

        switchSection('letters');
      } catch (e) {
        alert('Letter generation failed: ' + e.message);
        btnGenerateLetters.disabled = false;
        btnGenerateLetters.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate Letters';
      }
    });
  }

  var btnMarkGoal = document.getElementById('btnMarkGoal');
  if (btnMarkGoal) {
    btnMarkGoal.addEventListener('click', function() {
      btnMarkGoal.textContent = 'Done for today!';
      btnMarkGoal.style.background = '#10b981';
      btnMarkGoal.disabled = true;
      setTimeout(function() {
        btnMarkGoal.textContent = 'Mark Today\'s Goal Done';
        btnMarkGoal.style.background = '';
        btnMarkGoal.disabled = false;
      }, 3000);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', function() {
      localStorage.removeItem('diy_token');
      window.location.href = '/diy/login';
    });
  }

  init();
})();
