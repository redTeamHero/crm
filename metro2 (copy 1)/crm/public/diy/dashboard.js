(() => {
  const token = localStorage.getItem('diy_token');
  let currentUser = null;
  let currentReport = null;
  let violations = [];
  let diyStripeProducts = [];
  let wizardState = { step: 1, completed: [], strategy: '', markedSent: {}, badges: [] };

  const WIZARD_STEPS = [
    { num: 1, label: 'Import Report' },
    { num: 2, label: 'Violations' },
    { num: 3, label: 'Strategy' },
    { num: 4, label: 'Dispute Letters' },
    { num: 5, label: 'Progress Tracker' },
    { num: 6, label: 'Score Tools' }
  ];

  const BADGE_DEFS = [
    { id: 'report_uploaded', label: 'Report Uploaded', icon: '\uD83D\uDCC4' },
    { id: 'violation_found', label: 'Violation Found', icon: '\uD83D\uDD0D' },
    { id: 'first_dispute', label: 'First Dispute', icon: '\u2709\uFE0F' },
    { id: 'letters_sent', label: 'Letters Sent', icon: '\uD83D\uDCEE' },
    { id: 'score_goal_set', label: 'Score Goal Set', icon: '\uD83C\uDFAF' },
    { id: 'tradeline_browsed', label: 'Tradeline Browsed', icon: '\uD83D\uDCB3' }
  ];

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
    document.body.style.overflow = '';
    document.body.style.touchAction = '';

    if (sectionId === 'tradelines') { loadTradelines(); awardBadge('tradeline_browsed'); }
    if (sectionId === 'news') loadNews();
    if (sectionId === 'billing') loadBilling();
    if (sectionId === 'settings') loadSettings();
    if (sectionId === 'affiliate') loadDiyAffiliate();
    if (sectionId === 'cfpb') loadCfpbHistory();
  }

  document.querySelectorAll('.diy-nav-link[data-section]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var section = link.getAttribute('data-section');
      if (section) switchSection(section);
    });
  });

  document.addEventListener('click', function(e) {
    var trigger = e.target.closest('.diy-nav-trigger[data-section]');
    if (trigger) {
      e.preventDefault();
      var section = trigger.getAttribute('data-section');
      if (section) switchSection(section);
    }
  });

  var mobileMenuBtn = document.getElementById('mobileMenuBtn');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  var diySidebar = document.getElementById('diySidebar');
  function lockBodyScroll(lock) {
    document.body.style.overflow = lock ? 'hidden' : '';
    document.body.style.touchAction = lock ? 'none' : '';
  }
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', function() {
      var opening = !diySidebar.classList.contains('open');
      diySidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
      lockBodyScroll(opening);
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      diySidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      lockBodyScroll(false);
    });
  }

  window.addEventListener('resize', function() {
    if (window.innerWidth > 768 && diySidebar && diySidebar.classList.contains('open')) {
      diySidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
      lockBodyScroll(false);
    }
  });

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

      wizardState.step = currentUser.wizardStep || 1;
      wizardState.completed = currentUser.wizardCompleted || [];
      wizardState.strategy = currentUser.disputeStrategy || '';
      wizardState.markedSent = currentUser.markedSent || {};
      wizardState.badges = currentUser.badges || [];

      initWizard();
      loadCompanyMatch();
      loadReports();
      loadWizLetters();
      loadLetters();
      loadSpecialists();
      loadDiyProducts();
    } catch (e) {
      localStorage.removeItem('diy_token');
      window.location.href = '/diy/login';
    }
  }

  function initWizard() {
    renderWizardProgress();
    goToWizStep(wizardState.step);
    renderBadges();
    initWizUpload();
    initWizAudit();
    initWizStrategy();
    initWizLetterGen();
    initWizStep5Resolve();
    initWizScoreGoal();
    initWizSimulator();
    initWizNavButtons();
  }

  function renderWizardProgress() {
    var label = document.getElementById('wizProgressLabel');
    var pct = document.getElementById('wizProgressPct');
    var fill = document.getElementById('wizProgressFill');
    var stepsRow = document.getElementById('wizStepsRow');
    if (!stepsRow) return;

    var completedCount = wizardState.completed.length;
    var pctVal = Math.round((completedCount / 6) * 100);
    var stepInfo = WIZARD_STEPS.find(function(s) { return s.num === wizardState.step; }) || WIZARD_STEPS[0];

    if (label) label.textContent = 'Step ' + wizardState.step + ' of 6 \u2014 ' + stepInfo.label + (pctVal >= 100 ? ' \u2014 Complete!' : '');
    if (pct) pct.textContent = pctVal + '%';
    if (fill) fill.style.width = pctVal + '%';

    var dots = stepsRow.querySelectorAll('.wiz-step-dot');
    var lines = stepsRow.querySelectorAll('.wiz-step-line');
    dots.forEach(function(dot, i) {
      var num = i + 1;
      dot.classList.remove('active', 'completed');
      if (num === wizardState.step) dot.classList.add('active');
      else if (wizardState.completed.indexOf(num) !== -1) dot.classList.add('completed');
    });
    lines.forEach(function(line, i) {
      line.classList.toggle('completed', wizardState.completed.indexOf(i + 1) !== -1);
    });
  }

  function goToWizStep(num) {
    wizardState.step = num;
    document.querySelectorAll('.wiz-step-panel').forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('wizStep' + num);
    if (panel) panel.classList.add('active');
    renderWizardProgress();
  }

  function completeWizStep(num) {
    if (wizardState.completed.indexOf(num) === -1) {
      wizardState.completed.push(num);
    }
    renderWizardProgress();
    saveWizardState();
  }

  function saveWizardState() {
    if (!token) return;
    fetch('/api/diy/profile', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wizardStep: wizardState.step,
        wizardCompleted: wizardState.completed,
        disputeStrategy: wizardState.strategy,
        markedSent: wizardState.markedSent,
        badges: wizardState.badges
      })
    }).catch(function() {});
  }

  function awardBadge(badgeId) {
    if (wizardState.badges.indexOf(badgeId) !== -1) return;
    wizardState.badges.push(badgeId);
    renderBadges();
    saveWizardState();
  }

  function renderBadges() {
    var grid = document.getElementById('badgesGrid');
    if (!grid) return;
    grid.innerHTML = BADGE_DEFS.map(function(b) {
      var earned = wizardState.badges.indexOf(b.id) !== -1;
      return '<div class="wiz-badge ' + (earned ? 'earned' : 'locked') + '">' +
        '<span>' + b.icon + '</span>' +
        '<span>' + esc(b.label) + '</span>' +
        '</div>';
    }).join('');
  }

  function initWizNavButtons() {
    document.querySelectorAll('.wiz-step-dot[data-wiz]').forEach(function(dot) {
      dot.addEventListener('click', function() {
        var num = parseInt(dot.getAttribute('data-wiz'), 10);
        goToWizStep(num);
        saveWizardState();
      });
    });
    document.querySelectorAll('.wiz-next-btn[data-wiz-next]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var next = parseInt(btn.getAttribute('data-wiz-next'), 10);
        goToWizStep(next);
        saveWizardState();
      });
    });
    document.querySelectorAll('.wiz-prev-btn[data-wiz-prev]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var prev = parseInt(btn.getAttribute('data-wiz-prev'), 10);
        goToWizStep(prev);
        saveWizardState();
      });
    });
  }

  function initWizUpload() {
    var area = document.getElementById('wizUploadArea');
    var input = document.getElementById('wizFileInput');
    if (!area || !input) return;

    area.addEventListener('click', function() { input.click(); });
    area.addEventListener('dragover', function(e) { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', function() { area.classList.remove('dragover'); });
    area.addEventListener('drop', function(e) { e.preventDefault(); area.classList.remove('dragover'); if (e.dataTransfer.files.length) handleWizUpload(e.dataTransfer.files[0]); });
    input.addEventListener('change', function() { if (input.files.length) handleWizUpload(input.files[0]); });
  }

  function handleWizUpload(file) {
    var formData = new FormData();
    formData.append('report', file);
    var prog = document.getElementById('wizUploadProgress');
    var bar = document.getElementById('wizProgressBarUpload');
    var text = document.getElementById('wizProgressTextUpload');
    if (prog) prog.classList.remove('hidden');
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '0%';

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/diy/reports/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        var pct = Math.round((e.loaded / e.total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = pct + '%';
      }
    };
    xhr.onload = function() {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        currentReport = data.report;
        if (btnRunAudit) btnRunAudit.disabled = false;
        var done = document.getElementById('wizStep1Done');
        var doneText = document.getElementById('wizStep1DoneText');
        if (done) done.style.display = '';
        if (doneText) doneText.textContent = 'Report uploaded: ' + (data.report.originalName || 'success');
        var nextBtn = document.getElementById('wizBtn1Next');
        if (nextBtn) nextBtn.disabled = false;
        completeWizStep(1);
        awardBadge('report_uploaded');
        updateStep(2, 4);
        updateNextStep('Run an audit on your uploaded report to find violations.');
        updateMilestone('Report uploaded successfully!');
      } else {
        alert('Upload failed: ' + xhr.statusText);
      }
      setTimeout(function() { if (prog) prog.classList.add('hidden'); }, 1000);
    };
    xhr.onerror = function() { alert('Upload failed'); if (prog) prog.classList.add('hidden'); };
    xhr.send(formData);
  }

  function initWizAudit() {
    var btn = document.getElementById('wizBtnRunAudit');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      if (!currentReport) {
        alert('Please upload a report first (Step 1).');
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<svg style="width:16px;height:16px;" class="animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running Audit...';

      try {
        var res = await fetch('/api/diy/audit', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: currentReport.id })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Audit failed');
        violations = data.violations || [];
        renderWizViolations(violations);
        var nextBtn2 = document.getElementById('wizBtn2Next');
        if (nextBtn2) nextBtn2.disabled = false;

        if (violations.length > 0) {
          awardBadge('violation_found');
          if (noViolations) noViolations.style.display = 'none';
          if (violationsList) {
            violationsList.innerHTML = violations.map(function(v) {
              return '<div class="violation-item"><div style="display:flex;align-items:start;gap:10px;"><span style="color:#ef4444;margin-top:2px;">&#9888;</span><div style="flex:1;"><p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + esc(v.title || v.ruleId) + '</p><p style="font-size:13px;color:var(--diy-text-sub);margin-top:4px;">' + esc(v.explanation || v.description || '') + '</p>' + (v.bureau ? '<span style="display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;background:#f3f4f6;border-radius:6px;color:var(--diy-text-sub);">' + esc(v.bureau) + '</span>' : '') + '</div></div></div>';
            }).join('');
          }
          if (btnGenerateLetters) btnGenerateLetters.disabled = false;
          updateStep(3, 4);
          updateNextStep('Generate dispute letters based on the violations found.');
          updateReportSnapshot(violations.length + ' negative item' + (violations.length !== 1 ? 's' : '') + ' detected.');
          updateMilestone('Audit complete! ' + violations.length + ' violation' + (violations.length !== 1 ? 's' : '') + ' found.');
        } else {
          completeWizStep(2);
          updateMilestone('Audit complete! No violations found \u2014 your report looks clean.');
          updateNextStep('Your report looks good! Explore score improvement tools.');
        }
      } catch (e) {
        alert('Audit failed: ' + e.message);
      }
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> Run Audit on Report';
    });
  }

  function renderWizViolations(viols) {
    var container = document.getElementById('wizViolationCards');
    var noViols = document.getElementById('wizNoViolations');
    if (!container) return;
    if (!viols || viols.length === 0) {
      container.innerHTML = '';
      if (noViols) noViols.style.display = '';
      return;
    }
    if (noViols) noViols.style.display = 'none';
    container.innerHTML = viols.map(function(v, i) {
      var lawMap = {
        'FCRA': 'Fair Credit Reporting Act, 15 U.S.C. \u00A7 1681. Requires accurate reporting and gives consumers the right to dispute inaccurate information.',
        'FDCPA': 'Fair Debt Collection Practices Act, 15 U.S.C. \u00A7 1692. Prohibits abusive, unfair, or deceptive practices by debt collectors.',
        'Metro-2': 'Metro-2 Format Compliance. The industry standard for credit reporting data format. Violations indicate improperly formatted data fields.',
        'TILA': 'Truth in Lending Act, 15 U.S.C. \u00A7 1601. Requires clear disclosure of loan terms and costs.',
        'HIPAA': 'Health Insurance Portability and Accountability Act. Protects medical information from unauthorized disclosure in credit reports.'
      };
      var lawKey = (v.law || v.ruleId || '').toUpperCase();
      var citation = '';
      for (var k in lawMap) { if (lawKey.indexOf(k) !== -1) { citation = lawMap[k]; break; } }
      if (!citation) citation = 'This item may violate consumer credit reporting laws. Consult with a credit professional for specific legal guidance.';

      return '<div class="wiz-violation-card">' +
        '<div class="wiz-viol-header">' +
        '<span style="color:#ef4444;font-size:18px;">&#9888;</span>' +
        '<div class="wiz-viol-title">' + esc(v.title || v.ruleId || 'Violation #' + (i+1)) + '</div>' +
        (v.bureau ? '<span class="wiz-viol-bureau">' + esc(v.bureau) + '</span>' : '') +
        '</div>' +
        '<div class="wiz-viol-actions">' +
        '<button class="wiz-viol-btn-explain" data-explain="' + i + '" type="button">Explain</button>' +
        '<button class="wiz-viol-btn-dispute" data-dispute="' + i + '" type="button">Dispute This</button>' +
        '</div>' +
        '<div class="wiz-viol-explain" id="wizExplain' + i + '">' +
        '<strong style="color:var(--diy-text);display:block;margin-bottom:6px;">Legal Basis</strong>' +
        esc(citation) +
        (v.explanation || v.description ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06);"><strong style="color:var(--diy-text);display:block;margin-bottom:4px;">Details</strong>' + esc(v.explanation || v.description) + '</div>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.wiz-viol-btn-explain').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = btn.getAttribute('data-explain');
        var el = document.getElementById('wizExplain' + idx);
        if (el) el.classList.toggle('open');
        completeWizStep(2);
      });
    });

    container.querySelectorAll('.wiz-viol-btn-dispute').forEach(function(btn) {
      btn.addEventListener('click', function() {
        completeWizStep(2);
        goToWizStep(3);
        saveWizardState();
      });
    });
  }

  function initWizStrategy() {
    var cards = document.querySelectorAll('.wiz-strategy-card');
    var selectBtns = document.querySelectorAll('.wiz-strategy-select');
    var nextBtn = document.getElementById('wizBtn3Next');

    if (currentUser && currentUser.plan === 'free') {
      var advLock = document.getElementById('stratAdvLock');
      var legalLock = document.getElementById('stratLegalLock');
      if (advLock) advLock.style.display = 'flex';
      if (legalLock) legalLock.style.display = 'flex';
      var advCard = document.getElementById('stratAdvanced');
      var legalCard = document.getElementById('stratLegal');
      if (advCard) advCard.classList.add('locked');
      if (legalCard) legalCard.classList.add('locked');
    }

    if (wizardState.strategy) {
      var selected = document.querySelector('.wiz-strategy-card[data-strategy="' + wizardState.strategy + '"]');
      if (selected) selected.classList.add('selected');
      if (nextBtn) nextBtn.disabled = false;
    }

    selectBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var strategy = btn.getAttribute('data-strategy');
        if (currentUser && currentUser.plan === 'free' && strategy !== 'basic') {
          alert('Please upgrade to the DIY plan to use ' + strategy + ' strategy.');
          switchSection('billing');
          return;
        }
        cards.forEach(function(c) { c.classList.remove('selected'); });
        var card = btn.closest('.wiz-strategy-card');
        if (card) card.classList.add('selected');
        wizardState.strategy = strategy;
        if (nextBtn) nextBtn.disabled = false;
        completeWizStep(3);
        saveWizardState();
        setTimeout(function() { goToWizStep(4); saveWizardState(); }, 400);
      });
    });
  }

  function initWizLetterGen() {
    var btn = document.getElementById('wizBtnGenLetters');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      if (currentUser && currentUser.plan === 'free') {
        alert('Please upgrade to the DIY plan to generate dispute letters.');
        switchSection('billing');
        return;
      }
      if (!currentReport || violations.length === 0) {
        alert('Please upload a report and run an audit first to find violations.');
        return;
      }
      if (!wizardState.strategy) {
        alert('Please select a dispute strategy first (Step 3).');
        goToWizStep(3);
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<svg style="width:16px;height:16px;" class="animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';
      try {
        var res = await fetch('/api/diy/letters', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: currentReport ? currentReport.id : null, violations: violations })
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Letter generation failed');
        awardBadge('first_dispute');
        loadWizLetters();
        loadLetters();
      } catch (e) {
        alert('Letter generation failed: ' + e.message);
      }
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate Dispute Letters';
    });
  }

  async function loadWizLetters() {
    try {
      var res = await fetch('/api/diy/letters', { headers: { 'Authorization': 'Bearer ' + token } });
      var data = await res.json();
      var container = document.getElementById('wizLetterChecklist');
      var noEl = document.getElementById('wizNoLetters');
      if (!container) return;
      if (!data.letters || data.letters.length === 0) {
        container.innerHTML = '';
        if (noEl) noEl.style.display = '';
        return;
      }
      if (noEl) noEl.style.display = 'none';
      container.innerHTML = data.letters.map(function(letter) {
        var dateStr = letter.createdAt ? new Date(letter.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        var isSent = !!wizardState.markedSent[letter.id];
        return '<div class="wiz-letter-item">' +
          '<div class="wiz-letter-info">' +
          '<div class="wiz-letter-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>' +
          '<div><p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + esc(letter.bureau || 'Dispute Letter') + '</p>' +
          '<p style="font-size:12px;color:var(--diy-text-sub);">' + esc(dateStr) + '</p></div>' +
          '</div>' +
          '<div class="wiz-letter-actions">' +
          '<a href="/api/diy/letters/' + encodeURIComponent(letter.id) + '/download" class="diy-btn diy-btn-primary" style="padding:6px 14px;font-size:12px;text-decoration:none;">Download</a>' +
          '<button class="wiz-mark-sent' + (isSent ? ' sent' : '') + '" data-letter-id="' + esc(letter.id) + '" type="button">' + (isSent ? 'Sent' : 'Mark Sent') + '</button>' +
          '</div>' +
          '</div>';
      }).join('');

      container.querySelectorAll('.wiz-mark-sent').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var lid = btn.getAttribute('data-letter-id');
          var isSent = !!wizardState.markedSent[lid];
          if (isSent) {
            wizardState.markedSent[lid] = null;
          } else {
            wizardState.markedSent[lid] = new Date().toISOString();
          }
          btn.classList.toggle('sent');
          btn.textContent = wizardState.markedSent[lid] ? 'Sent' : 'Mark Sent';
          var allSent = data.letters.every(function(l) { return wizardState.markedSent[l.id]; });
          if (allSent) {
            awardBadge('letters_sent');
            completeWizStep(4);
          }
          updateTimeline();
          saveWizardState();
        });
      });

      updateTimeline();
    } catch (e) {
      console.error('Failed to load wizard letters:', e);
    }
  }

  function updateTimeline() {
    var sentEntries = Object.entries(wizardState.markedSent).filter(function(e) { return e[1] && e[1] !== false; });
    var anyMarkedSent = sentEntries.length > 0;
    var sentDate = document.getElementById('wizTlSentDate');
    var stages = document.querySelectorAll('#wizTimeline .wiz-tl-stage');
    var connectors = document.querySelectorAll('#wizTimeline .wiz-tl-connector');

    if (anyMarkedSent) {
      var firstSentTs = null;
      sentEntries.forEach(function(e) {
        if (typeof e[1] === 'string' || typeof e[1] === 'number') {
          var ts = new Date(e[1]).getTime();
          if (!firstSentTs || ts < firstSentTs) firstSentTs = ts;
        }
      });
      var sentDateObj = firstSentTs ? new Date(firstSentTs) : new Date();
      if (sentDate) sentDate.textContent = sentDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (stages[0]) { stages[0].classList.add('completed'); stages[0].classList.remove('active'); }
      if (stages[1]) stages[1].classList.add('active');
      if (connectors[0]) connectors[0].classList.add('completed');

      var processDate = document.getElementById('wizTlProcessDate');
      var future30 = new Date(sentDateObj.getTime()); future30.setDate(future30.getDate() + 30);
      if (processDate) processDate.textContent = 'Expected by ' + future30.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    if (wizardState.completed.indexOf(5) !== -1) {
      stages.forEach(function(s) { s.classList.remove('active'); s.classList.add('completed'); });
      connectors.forEach(function(c) { c.classList.add('completed'); });
    }
  }

  function initWizStep5Resolve() {
    var btn = document.getElementById('wizBtnResponseReceived');
    if (!btn) return;
    btn.addEventListener('click', function() {
      completeWizStep(5);
      var stages = document.querySelectorAll('.wiz-tl-stage');
      var connectors = document.querySelectorAll('.wiz-tl-connector');
      var today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      stages.forEach(function(s) { s.classList.remove('active'); s.classList.add('completed'); });
      connectors.forEach(function(c) { c.classList.add('completed'); });
      var responseDate = document.getElementById('wizTlResponseDate');
      var followDate = document.getElementById('wizTlFollowDate');
      var resolvedDate = document.getElementById('wizTlResolvedDate');
      if (responseDate) responseDate.textContent = today;
      if (followDate) followDate.textContent = 'Completed';
      if (resolvedDate) resolvedDate.textContent = today;
      btn.disabled = true;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Disputes Resolved';
      btn.style.background = '#10b981';
    });
  }

  function initWizScoreGoal() {
    var goalInput = document.getElementById('wizScoreGoal');
    var goalBtn = document.getElementById('wizBtnSetGoal');
    var goalConfirm = document.getElementById('wizGoalConfirm');
    if (!goalBtn || !goalInput) return;

    if (currentUser && currentUser.scoreGoal > 0) {
      goalInput.value = currentUser.scoreGoal;
    }

    goalBtn.addEventListener('click', function() {
      var goal = parseInt(goalInput.value, 10);
      if (!goal || goal < 300 || goal > 850) {
        alert('Please enter a score between 300 and 850.');
        return;
      }
      fetch('/api/diy/profile', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreGoal: goal })
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.ok) {
          awardBadge('score_goal_set');
          completeWizStep(6);
          if (goalConfirm) { goalConfirm.style.display = ''; setTimeout(function() { goalConfirm.style.display = 'none'; }, 3000); }
        }
      }).catch(function() {});
    });
  }

  function initWizSimulator() {
    var scoreInput = document.getElementById('wizSimScore');
    var projected = document.getElementById('wizSimProjected');
    var delta = document.getElementById('wizSimDelta');
    var cbs = document.querySelectorAll('.wiz-sim-cb');
    if (!scoreInput || !projected) return;

    var impacts = {
      wizSimTradeline: 35,
      wizSimUtilization: 30,
      wizSimCollection: 40,
      wizSimInquiry: 10,
      wizSimLatePay: 20
    };

    function recalc() {
      var base = parseInt(scoreInput.value, 10) || 620;
      var bonus = 0;
      cbs.forEach(function(cb) { if (cb.checked) bonus += (impacts[cb.id] || 0); });
      var total = Math.min(850, base + bonus);
      projected.textContent = total;
      if (bonus > 0) {
        delta.textContent = '+' + bonus + ' pts';
        delta.style.display = '';
        projected.style.color = '#10b981';
      } else {
        delta.style.display = 'none';
        projected.style.color = 'var(--diy-text)';
      }
    }

    scoreInput.addEventListener('input', recalc);
    cbs.forEach(function(cb) { cb.addEventListener('change', recalc); });
    recalc();
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
      basic: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'DIY' },
      pro: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'DIY' }
    };
    var c = colors[plan] || colors.free;
    planBadge.style.background = c.bg;
    planBadge.style.color = c.color;
    planBadge.textContent = (c.label) ? c.label : plan.charAt(0).toUpperCase() + plan.slice(1);
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
        var wizNextBtn = document.getElementById('wizBtn1Next');
        if (wizNextBtn) wizNextBtn.disabled = false;
        var done = document.getElementById('wizStep1Done');
        var doneText = document.getElementById('wizStep1DoneText');
        if (done) done.style.display = '';
        if (doneText) doneText.textContent = 'Report on file: ' + (currentReport.originalName || 'uploaded');
        if (wizardState.completed.indexOf(1) === -1) {
          completeWizStep(1);
          awardBadge('report_uploaded');
        }
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
      var lettersActions = document.getElementById('lettersActions');
      if (data.letters && data.letters.length > 0) {
        if (noLetters) noLetters.style.display = 'none';
        if (lettersActions) lettersActions.style.display = '';
        if (lettersList) {
          lettersList.innerHTML = data.letters.map(function(letter) {
            var dateStr = letter.createdAt ? new Date(letter.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            return '<div class="diy-card" style="margin-bottom:10px;">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>' +
              '</div>' +
              '<div>' +
              '<p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + esc(letter.bureau || 'Dispute Letter') + '</p>' +
              '<p style="font-size:12px;color:var(--diy-text-sub);">' + esc(dateStr) + '</p>' +
              '</div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
              '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:rgba(16,185,129,0.1);color:#10b981;font-weight:600;">Ready to Mail</span>' +
              '<a href="/api/diy/letters/' + encodeURIComponent(letter.id) + '/download" class="diy-btn diy-btn-primary" style="padding:6px 14px;font-size:12px;text-decoration:none;">Download PDF</a>' +
              '</div>' +
              '</div>' +
              '</div>';
          }).join('');
        }
        updateStep(4, 4);
        updateMilestone('Letters generated! Send them to start disputes.');
      } else {
        if (noLetters) noLetters.style.display = '';
        if (lettersActions) lettersActions.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to load letters:', e);
    }
  }

  var diyCfpbLastResult = null;
  var diyCfpbLastPayload = null;

  var diyProofFiles = [];
  var diyUploadedProofKeys = [];

  async function loadCfpbHistory() {
    try {
      var res = await fetch('/api/diy/cfpb-complaints', { headers: { 'Authorization': 'Bearer ' + token } });
      var data = await res.json();
      var complaints = (data.complaints || []);
      var section = document.getElementById('diyCfpbHistorySection');
      var list = document.getElementById('diyCfpbHistoryList');
      if (!section || !list) return;
      if (!complaints.length) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      list.innerHTML = complaints.map(function(c) {
        var dateStr = c.generatedAt ? new Date(c.generatedAt).toLocaleDateString() : '';
        var vLabels = { no_response_30: '30-Day No Response', verified_inaccurate: 'Verified Inaccurate', reaged: 'Re-Aged Debt', continued_after_paid: 'Continued After Paid', not_mine: 'Not Mine / Identity Theft', other: 'Other' };
        var vLabel = vLabels[c.violationType] || c.violationType || '';
        var proofHtml = '';
        if (Array.isArray(c.proofFiles) && c.proofFiles.length) {
          proofHtml = '<div style="margin-top:6px;font-size:11px;color:#818cf8;">Proof: ' + c.proofFiles.map(function(f) { return '<a href="/api/diy/cfpb-proof/' + encodeURIComponent(f.key) + '" target="_blank" style="color:#818cf8;text-decoration:underline;margin-right:6px;">' + esc(f.name) + '</a>'; }).join('') + '</div>';
        }
        return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<strong style="font-size:13px;color:var(--diy-text);">' + esc(c.companyName || '') + '</strong>' +
          '<span style="font-size:11px;color:#9ca3af;">' + esc(dateStr) + '</span>' +
          '</div>' +
          (vLabel ? '<div style="font-size:11px;color:#818cf8;margin-bottom:6px;">' + esc(vLabel) + '</div>' : '') +
          '<details style="font-size:12px;"><summary style="cursor:pointer;color:#6b7280;">Show complaint</summary>' +
          '<div style="margin-top:6px;white-space:pre-wrap;color:var(--diy-text);line-height:1.6;">' + esc(c.narrative || '') + '</div>' +
          (c.resolution ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.07);white-space:pre-wrap;color:var(--diy-text);line-height:1.6;">' + esc(c.resolution) + '</div>' : '') +
          '</details>' + proofHtml + '</div>';
      }).join('');
    } catch (e) { console.error('CFPB history load error:', e); }
  }

  async function loadDiyNegativeItems() {
    var panel = document.getElementById('diyItemsCheckboxes');
    var controls = document.getElementById('diyItemsControls');
    var loading = document.getElementById('diyItemsLoading');
    if (!panel) return;
    panel.innerHTML = '';
    try {
      var res = await fetch('/api/diy/negative-items', { headers: { 'Authorization': 'Bearer ' + token } });
      var data = await res.json();
      var items = (data.items || []);
      if (!items.length) {
        loading.textContent = 'No negative items found. Use the custom field below.';
        loading.style.display = 'block';
        if (controls) controls.style.display = 'flex';
        panel.style.display = 'none';
        return;
      }
      loading.style.display = 'none';
      panel.style.display = 'block';
      if (controls) controls.style.display = 'flex';
      panel.innerHTML = items.map(function(item, idx) {
        var label = esc(item.name) + (item.accountNumber ? ' #' + esc(item.accountNumber) : '') + (item.bureaus && item.bureaus.length ? ' (' + esc(item.bureaus.join(', ')) + ')' : '');
        return '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;color:var(--diy-text);">' +
          '<input type="checkbox" class="diy-item-cb" value="' + esc(item.name) + (item.accountNumber ? ' #' + esc(item.accountNumber) : '') + '"> ' + label + '</label>';
      }).join('');
    } catch (e) {
      loading.textContent = 'Failed to load items. Use the custom field below.';
      loading.style.display = 'block';
      if (controls) controls.style.display = 'flex';
    }
  }

  function getDiySelectedItems() {
    var cbs = document.querySelectorAll('.diy-item-cb:checked');
    return Array.from(cbs).map(function(cb) { return cb.value; });
  }

  function getDiyResponseValue() {
    var sel = document.getElementById('diyResponse');
    if (!sel) return '';
    if (sel.value === 'other') return (document.getElementById('diyResponseOther') || {}).value || '';
    return sel.value;
  }

  function renderDiyProofList() {
    var list = document.getElementById('diyProofList');
    if (!list) return;
    if (!diyProofFiles.length) { list.innerHTML = ''; return; }
    list.innerHTML = diyProofFiles.map(function(f, i) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px;">' +
        '<span style="color:var(--diy-text);">' + esc(f.name) + '</span>' +
        '<span style="color:#6b7280;font-size:10px;">(' + (f.size / 1024).toFixed(1) + ' KB)</span>' +
        '<button type="button" data-diy-pidx="' + i + '" class="rm-diy-proof" style="color:#f87171;background:none;border:none;cursor:pointer;font-size:11px;">Remove</button>' +
        '</div>';
    }).join('');
  }

  async function uploadDiyProofFiles() {
    if (!diyProofFiles.length) return [];
    var formData = new FormData();
    diyProofFiles.forEach(function(f) { formData.append('files', f); });
    var res = await fetch('/api/diy/cfpb-proof', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Upload failed');
    return data.files || [];
  }

  (function initDiyCfpb() {
    var violationSelect = document.getElementById('diyViolationType');
    var otherBox = document.getElementById('diyOtherBox');
    if (violationSelect && otherBox) {
      violationSelect.addEventListener('change', function() {
        otherBox.style.display = violationSelect.value === 'other' ? 'block' : 'none';
      });
    }

    var responseSelect = document.getElementById('diyResponse');
    var responseOther = document.getElementById('diyResponseOther');
    if (responseSelect && responseOther) {
      responseSelect.addEventListener('change', function() {
        responseOther.style.display = responseSelect.value === 'other' ? 'block' : 'none';
      });
    }

    var selectAll = document.getElementById('diySelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function() {
        document.querySelectorAll('.diy-item-cb').forEach(function(cb) { cb.checked = selectAll.checked; });
      });
    }

    var addCustomBtn = document.getElementById('btnDiyAddCustomItem');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', function() {
        var input = document.getElementById('diyCustomItem');
        var val = (input || {}).value;
        if (!val || !val.trim()) return;
        val = val.trim();
        var panel = document.getElementById('diyItemsCheckboxes');
        if (!panel) return;
        panel.style.display = 'block';
        var label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;cursor:pointer;color:var(--diy-text);';
        label.innerHTML = '<input type="checkbox" class="diy-item-cb" value="' + esc(val) + '" checked> ' + esc(val) + ' <span style="color:#10b981;font-size:10px;">(custom)</span>';
        panel.appendChild(label);
        input.value = '';
      });
    }

    var proofArea = document.getElementById('diyProofArea');
    var proofInput = document.getElementById('diyProofInput');
    if (proofArea && proofInput) {
      proofArea.addEventListener('click', function() { proofInput.click(); });
      proofInput.addEventListener('change', function(e) {
        var allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
        for (var i = 0; i < e.target.files.length; i++) {
          if (diyProofFiles.length >= 5) break;
          var f = e.target.files[i];
          var ext = '.' + f.name.split('.').pop().toLowerCase();
          if (allowed.indexOf(ext) === -1 || f.size > 10 * 1024 * 1024) continue;
          diyProofFiles.push(f);
        }
        e.target.value = '';
        diyUploadedProofKeys = [];
        renderDiyProofList();
      });
    }
    var proofList = document.getElementById('diyProofList');
    if (proofList) {
      proofList.addEventListener('click', function(e) {
        var btn = e.target.closest('.rm-diy-proof');
        if (!btn) return;
        diyProofFiles.splice(parseInt(btn.dataset.diyPidx, 10), 1);
        diyUploadedProofKeys = [];
        renderDiyProofList();
      });
    }

    var genBtn = document.getElementById('btnDiyCfpbGenerate');
    if (genBtn) {
      genBtn.addEventListener('click', async function() {
        var company = (document.getElementById('diyCompany') || {}).value || '';
        var vtype = (document.getElementById('diyViolationType') || {}).value || '';
        var otherText = (document.getElementById('diyOtherText') || {}).value || '';
        var errEl = document.getElementById('diyCfpbError');
        company = company.trim(); vtype = vtype.trim();
        if (!company) { errEl.textContent = 'Company name is required.'; errEl.style.display = 'block'; return; }
        if (!vtype) { errEl.textContent = 'Please select a violation type.'; errEl.style.display = 'block'; return; }
        if (vtype === 'other' && !otherText.trim()) { errEl.textContent = 'Please describe the violation.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        var itemsDisputed = getDiySelectedItems();
        var sentDate = (document.getElementById('diySentDate') || {}).value || '';
        var response = getDiyResponseValue();
        var notes = ((document.getElementById('diyNotes') || {}).value || '').trim();
        var tone = (document.getElementById('diyTone') || {}).value || 'professional';
        var complaintGoal = (document.getElementById('diyGoal') || {}).value || '';
        var origText = genBtn.textContent;
        genBtn.disabled = true; genBtn.textContent = 'Generating…';
        try {
          var res = await fetch('/api/diy/cfpb-complaint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ companyName: company, violationType: vtype, otherViolationText: otherText, itemsDisputed: itemsDisputed, disputeSentDate: sentDate, responseOutcome: response, additionalNotes: notes, tone: tone, complaintGoal: complaintGoal, save: false })
          });
          var data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Generation failed');
          diyCfpbLastResult = { narrative: data.narrative, resolution: data.resolution };
          diyCfpbLastPayload = { companyName: company, violationType: vtype, otherViolationText: otherText, itemsDisputed: itemsDisputed, disputeSentDate: sentDate, responseOutcome: response, additionalNotes: notes, tone: tone, complaintGoal: complaintGoal };
          var narEl = document.getElementById('diyCfpbNarrative');
          var resEl = document.getElementById('diyCfpbResolution');
          var resultSection = document.getElementById('diyCfpbResult');
          var saveMsg = document.getElementById('diyCfpbSaveMsg');
          if (narEl) narEl.textContent = data.narrative || '';
          if (resEl) resEl.textContent = data.resolution || '';
          if (saveMsg) saveMsg.style.display = 'none';
          if (resultSection) { resultSection.style.display = 'block'; resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        } catch (e) {
          errEl.textContent = e.message || 'Failed to generate complaint'; errEl.style.display = 'block';
        } finally {
          genBtn.disabled = false; genBtn.textContent = origText;
        }
      });
    }

    var copyBtn = document.getElementById('btnDiyCfpbCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        if (!diyCfpbLastResult) return;
        var text = 'WHAT HAPPENED:\n' + diyCfpbLastResult.narrative + '\n\nWHAT RESOLUTION I AM SEEKING:\n' + diyCfpbLastResult.resolution;
        navigator.clipboard.writeText(text).then(function() { copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy All'; }, 2000); });
      });
    }

    var saveBtn = document.getElementById('btnDiyCfpbSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        if (!diyCfpbLastPayload || !diyCfpbLastResult) return;
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        try {
          var savedProofFiles = diyUploadedProofKeys;
          if (diyProofFiles.length && !diyUploadedProofKeys.length) {
            savedProofFiles = await uploadDiyProofFiles();
            diyUploadedProofKeys = savedProofFiles;
          }
          var res = await fetch('/api/diy/cfpb-complaint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(Object.assign({}, diyCfpbLastPayload, { proofFiles: savedProofFiles, save: true }))
          });
          var data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Save failed');
          var saveMsg = document.getElementById('diyCfpbSaveMsg');
          if (saveMsg) saveMsg.style.display = 'block';
          loadCfpbHistory();
        } catch (e) { alert('Save failed: ' + e.message); }
        finally { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
      });
    }

    loadDiyNegativeItems();
  })();

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
            '<span style="font-weight:600;color:var(--diy-text);">' + esc(localSelection.name) + '</span>' +
            '<span style="font-size:12px;color:var(--diy-text-sub);margin-left:8px;">' + esc(localSelection.serviceArea || '') + '</span>';
          return;
        }
        companyMatch.innerHTML =
          '<span style="color:var(--diy-text-sub);">No specialist selected.</span>' +
          '<a href="#specialists" class="diy-nav-trigger" data-section="specialists" style="color:var(--diy-accent);font-weight:600;margin-left:8px;text-decoration:none;">Find one &rarr;</a>';
        return;
      }
      companyMatch.innerHTML =
        '<span style="font-weight:600;color:var(--diy-text);">' + esc(data.company.name) + '</span>' +
        '<span style="font-size:12px;color:var(--diy-text-sub);margin-left:8px;">' + esc(data.company.serviceArea || '') + '</span>';
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
        var m = company.metrics || {};
        var hasMetrics = Object.keys(m).length > 0;
        var rating = hasMetrics && m.reviewScore ? parseFloat(m.reviewScore.toFixed(1)) : null;
        var activeClients = hasMetrics && m.activeClients ? m.activeClients : null;
        var avgDays = hasMetrics && m.avgResponseTimeDays ? parseFloat(m.avgResponseTimeDays.toFixed(1)) : null;
        var successRate = hasMetrics && m.disputeSuccessRate ? Math.round(m.disputeSuccessRate * 100) : null;
        var badges = '';
        if (successRate !== null && successRate > 85) badges += '<span class="specialist-badge badge-verified">High Success</span>';
        if (avgDays !== null && avgDays < 3) badges += '<span class="specialist-badge badge-fast">Fast Response</span>';
        if (company.isBoosted) badges += '<span class="specialist-badge badge-boosted">Featured</span>';
        if (idx === 0) badges += '<span class="specialist-badge badge-top">Top Pick</span>';

        var ratingDisplay = rating !== null ? renderStars(Math.round(rating)) + '<span class="specialist-reviews">(' + esc(rating) + ')</span>' : '<span class="specialist-reviews">New</span>';
        var clientsDisplay = activeClients !== null ? activeClients : 'New';
        var avgDaysDisplay = avgDays !== null ? avgDays + 'd' : 'N/A';
        var successDisplay = successRate !== null ? successRate + '%' : 'New';

        return '<div class="specialist-card" data-company-id="' + esc(company.companyId || company.id || idx) + '">' +
          '<div class="specialist-header">' +
          '<div class="specialist-avatar" style="background:' + esc(color) + ';">' + esc(initial) + '</div>' +
          '<div style="flex:1;">' +
          '<div class="specialist-name">' + esc(company.name || 'Credit Company') + '</div>' +
          '<div class="specialist-location">' + esc(company.serviceArea || 'Nationwide') + '</div>' +
          '<div class="specialist-rating" style="margin-top:4px;">' +
          ratingDisplay +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="specialist-stats">' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + esc(clientsDisplay) + '</div><div class="specialist-stat-label">Active Clients</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + esc(avgDaysDisplay) + '</div><div class="specialist-stat-label">Avg. Response</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + esc(successDisplay) + '</div><div class="specialist-stat-label">Success Rate</div></div>' +
          '</div>' +
          (badges ? '<div class="specialist-badges">' + badges + '</div>' : '') +
          '<button class="diy-btn diy-btn-primary" style="width:100%;margin-top:12px;" type="button" data-select-company="' + esc(company.companyId || company.id || idx) + '">Choose This Specialist</button>' +
          '</div>';
      }).join('');

      specialistsList.querySelectorAll('[data-select-company]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var companyId = btn.getAttribute('data-select-company');
          var company = companies.find(function(c) { return String(c.companyId || c.id) === companyId; }) || companies[0];
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
        body: JSON.stringify({ companyId: company.companyId || company.id })
      });
    } catch (e) {}
    localStorage.setItem(LOCAL_COMPANY_SELECTION_KEY, JSON.stringify(company));
    loadCompanyMatch();
    switchSection('overview');
  }

  // ─── TRADE LINES ───
  var tradelineRangeSelect = document.getElementById('tradelineRange');
  var tradelineBankSelect = document.getElementById('tradelineBank');
  var tradelineListEl = document.getElementById('tradelinesList');
  var noTradelinesEl = document.getElementById('noTradelines');
  var tradelinePagination = document.getElementById('tradelinePagination');
  var tradelineCurrentPage = 1;
  var tradelineRanges = [];

  async function loadTradelines(page) {
    page = page || 1;
    tradelineCurrentPage = page;
    var rangeId = tradelineRangeSelect ? tradelineRangeSelect.value : '';

    if (!rangeId) {
      try {
        var res = await fetch('/api/tradelines');
        var data = await res.json();
        if (data.ranges) {
          tradelineRanges = data.ranges;
          if (tradelineRangeSelect) {
            tradelineRangeSelect.innerHTML = '<option value="">Select price range</option>' +
              data.ranges.map(function(r) {
                return '<option value="' + esc(r.id) + '">' + esc(r.label) + ' (' + esc(r.count) + ')</option>';
              }).join('');
          }
        }
      } catch (e) {
        console.error('Failed to load tradeline ranges:', e);
      }
      if (tradelineListEl) tradelineListEl.innerHTML = '';
      if (noTradelinesEl) noTradelinesEl.style.display = '';
      if (tradelinePagination) tradelinePagination.innerHTML = '';
      return;
    }

    if (noTradelinesEl) noTradelinesEl.style.display = 'none';
    if (tradelineListEl) tradelineListEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--diy-text-sub);">Loading tradelines...</div>';

    var bankFilter = tradelineBankSelect ? tradelineBankSelect.value : '';
    try {
      var url = '/api/tradelines?range=' + encodeURIComponent(rangeId) + '&page=' + page + '&perPage=10';
      if (bankFilter) url += '&bank=' + encodeURIComponent(bankFilter);
      var res = await fetch(url);
      var data = await res.json();

      if (data.banks && tradelineBankSelect) {
        var currentBank = tradelineBankSelect.value;
        tradelineBankSelect.innerHTML = '<option value="">All banks</option>' +
          data.banks.map(function(b) {
            return '<option value="' + esc(b) + '"' + (b === currentBank ? ' selected' : '') + '>' + esc(b) + '</option>';
          }).join('');
      }

      if (!data.tradelines || data.tradelines.length === 0) {
        tradelineListEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--diy-text-sub);">No tradelines found for this filter.</div>';
        if (tradelinePagination) tradelinePagination.innerHTML = '';
        return;
      }

      tradelineListEl.innerHTML = data.tradelines.map(function(tl) {
        var priceDisplay = tl.price != null ? '$' + Number(tl.price).toLocaleString() : '—';
        var limitDisplay = tl.limit ? '$' + Number(tl.limit).toLocaleString() : '—';
        return '<div class="tradeline-card">' +
          '<div class="tradeline-meta">' +
          '<div class="tradeline-field"><strong>' + esc(tl.bank || 'Unknown') + '</strong>Bank</div>' +
          '<div class="tradeline-field"><strong>' + esc(priceDisplay) + '</strong>Price</div>' +
          '<div class="tradeline-field"><strong>' + esc(limitDisplay) + '</strong>Credit Limit</div>' +
          '<div class="tradeline-field"><strong>' + esc(tl.age || '—') + '</strong>Age</div>' +
          (tl.reporting ? '<div class="tradeline-field"><strong>' + esc(tl.reporting) + '</strong>Reports To</div>' : '') +
          '</div>' +
          (tl.buy_link ? '<a href="' + esc(tl.buy_link) + '" target="_blank" rel="noopener" class="diy-btn diy-btn-primary" style="padding:8px 16px;font-size:12px;text-decoration:none;white-space:nowrap;">View Details</a>' : '') +
          '</div>';
      }).join('');

      if (tradelinePagination && data.totalPages > 1) {
        var html = '';
        if (page > 1) html += '<button class="page-btn" data-tl-page="' + (page - 1) + '">&laquo; Prev</button>';
        for (var i = 1; i <= Math.min(data.totalPages, 7); i++) {
          html += '<button class="page-btn' + (i === page ? ' active' : '') + '" data-tl-page="' + i + '">' + i + '</button>';
        }
        if (page < data.totalPages) html += '<button class="page-btn" data-tl-page="' + (page + 1) + '">Next &raquo;</button>';
        tradelinePagination.innerHTML = html;
        tradelinePagination.querySelectorAll('[data-tl-page]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            loadTradelines(parseInt(btn.getAttribute('data-tl-page'), 10));
          });
        });
      } else if (tradelinePagination) {
        tradelinePagination.innerHTML = '';
      }
    } catch (e) {
      console.error('Failed to load tradelines:', e);
      if (tradelineListEl) tradelineListEl.innerHTML = '<div style="text-align:center;padding:24px;color:#ef4444;">Failed to load tradelines. Please try again.</div>';
    }
  }

  if (tradelineRangeSelect) {
    tradelineRangeSelect.addEventListener('change', function() { loadTradelines(1); });
  }
  if (tradelineBankSelect) {
    tradelineBankSelect.addEventListener('change', function() { loadTradelines(1); });
  }

  // ─── NEWS ───
  var newsFeedEl = document.getElementById('newsFeed');
  var newsLoaded = false;

  async function loadNews() {
    if (newsLoaded) return;
    if (!newsFeedEl) return;
    try {
      var res = await fetch('/api/diy/news', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      newsLoaded = true;

      if (!data.items || data.items.length === 0) {
        newsFeedEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--diy-text-sub);"><p style="font-weight:500;">No news articles available right now.</p><p style="font-size:13px;margin-top:4px;">Check back later for the latest credit repair news and tips.</p></div>';
        return;
      }

      newsFeedEl.innerHTML = data.items.map(function(item) {
        var dateStr = item.pubDate ? new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        return '<a href="' + esc(item.link || '#') + '" target="_blank" rel="noopener" class="news-card" style="display:block;text-decoration:none;">' +
          '<div class="news-title">' + esc(item.title || 'Untitled') + '</div>' +
          (item.description ? '<div class="news-desc">' + esc(item.description) + '</div>' : '') +
          (dateStr ? '<div class="news-date">' + esc(dateStr) + '</div>' : '') +
          '</a>';
      }).join('');
    } catch (e) {
      console.error('Failed to load news:', e);
      newsFeedEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--diy-text-sub);"><p style="font-weight:500;">Unable to load news feed.</p></div>';
    }
  }

  // ─── UPGRADE & BILLING ───
  async function loadDiyProducts() {
    try {
      var res = await fetch('/api/stripe/products');
      var data = await res.json();
      if (data.ok) {
        diyStripeProducts = (data.products || []).filter(function(p) { return p.type === 'diy'; });
      }
    } catch (e) {
      console.warn('Could not load DIY products:', e);
    }
  }

  function loadBilling() {
    var currentPlanEl = document.getElementById('billingCurrentPlan');
    var planStatusEl = document.getElementById('billingPlanStatus');
    var periodEl = document.getElementById('billingPeriod');
    var manageBtnEl = document.getElementById('btnManageBilling');

    if (currentUser && currentPlanEl) {
      var plan = currentUser.plan || 'free';
      currentPlanEl.textContent = (plan === 'basic' || plan === 'pro') ? 'DIY' : plan.charAt(0).toUpperCase() + plan.slice(1);
    }

    document.querySelectorAll('.billing-plan-btn').forEach(function(btn) {
      var btnPlan = btn.getAttribute('data-plan');
      if (btnPlan === (currentUser ? currentUser.plan : 'free')) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
        btn.className = 'diy-btn diy-btn-secondary billing-plan-btn';
      } else {
        btn.textContent = btnPlan === 'basic' ? 'Upgrade to DIY' : 'Upgrade to ' + btnPlan.charAt(0).toUpperCase() + btnPlan.slice(1);
        btn.disabled = false;
        btn.className = 'diy-btn diy-btn-primary billing-plan-btn';
      }
    });

    if (currentUser && currentUser.stripeCustomerId && manageBtnEl) {
      manageBtnEl.style.display = '';
    }

    loadSubscriptionStatus();
  }

  async function loadSubscriptionStatus() {
    if (!currentUser) return;
    try {
      var res = await fetch('/api/stripe/subscription-status?mode=diy&userId=' + currentUser.id);
      var data = await res.json();
      var periodEl = document.getElementById('billingPeriod');
      if (data.ok && data.subscription) {
        if (periodEl) {
          var start = data.subscription.current_period_start ? new Date(data.subscription.current_period_start * 1000).toLocaleDateString() : '';
          var end = data.subscription.current_period_end ? new Date(data.subscription.current_period_end * 1000).toLocaleDateString() : '';
          periodEl.textContent = 'Current period: ' + start + ' – ' + end;
        }
      }
    } catch (e) {
      console.warn('Could not load subscription status:', e);
    }
  }

  document.querySelectorAll('.billing-plan-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var plan = btn.getAttribute('data-plan');
      if (!plan || plan === 'free') return;
      upgradePlan(plan);
    });
  });

  async function upgradePlan(plan) {
    var statusEl = document.getElementById('billingStatus');
    var product = diyStripeProducts.find(function(p) { return p.tier === plan; });

    if (product && product.prices && product.prices[0]) {
      var priceId = product.prices[0].id;
      try {
        if (statusEl) {
          statusEl.textContent = 'Redirecting to checkout...';
          statusEl.style.display = '';
          statusEl.style.background = 'rgba(99,102,241,0.1)';
          statusEl.style.color = 'var(--diy-accent)';
        }
        var res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            priceId: priceId,
            mode: 'diy',
            userId: currentUser ? currentUser.id : null,
            email: currentUser ? currentUser.email : null
          })
        });
        var data = await res.json();
        if (data.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(data.error || 'Checkout failed');
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = e.message;
          statusEl.style.display = '';
          statusEl.style.background = 'rgba(239,68,68,0.1)';
          statusEl.style.color = '#ef4444';
        }
        return;
      }
    }

    try {
      if (statusEl) {
        statusEl.textContent = 'Upgrading plan...';
        statusEl.style.display = '';
        statusEl.style.background = 'rgba(99,102,241,0.1)';
        statusEl.style.color = 'var(--diy-accent)';
      }
      var res = await fetch('/api/diy/upgrade', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: plan })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');
      localStorage.setItem('diy_token', data.token);
      currentUser = data.user;
      updatePlanBadge(currentUser.plan);
      if (statusEl) {
        statusEl.textContent = 'Plan updated to ' + ((plan === 'basic' || plan === 'pro') ? 'DIY' : plan.charAt(0).toUpperCase() + plan.slice(1)) + '!';
        statusEl.style.background = 'rgba(16,185,129,0.1)';
        statusEl.style.color = '#10b981';
      }
      loadBilling();
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = e.message;
        statusEl.style.display = '';
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = '#ef4444';
      }
    }
  }

  var manageBillingBtn = document.getElementById('btnManageBilling');
  if (manageBillingBtn) {
    manageBillingBtn.addEventListener('click', async function() {
      if (!currentUser || !currentUser.stripeCustomerId) {
        alert('No billing account found. Please upgrade your plan first.');
        return;
      }
      try {
        var res = await fetch('/api/stripe/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: currentUser.stripeCustomerId, mode: 'diy' })
        });
        var data = await res.json();
        if (data.ok && data.url) {
          window.location.href = data.url;
        } else {
          alert(data.error || 'Unable to open billing portal.');
        }
      } catch (e) {
        alert('Unable to open billing portal. Please try again.');
      }
    });
  }

  // ─── SETTINGS ───
  var settingsLoaded = false;

  async function loadSettings() {
    if (settingsLoaded) return;
    try {
      var res = await fetch('/api/diy/profile', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var data = await res.json();
      if (data.ok && data.user) {
        var u = data.user;
        var setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
        setVal('settingsFirstName', u.firstName);
        setVal('settingsLastName', u.lastName);
        setVal('settingsEmail', u.email);
        setVal('settingsPhone', u.phone);
        setVal('settingsAddress', u.address);
        setVal('settingsCity', u.city);
        setVal('settingsState', u.state);
        setVal('settingsZip', u.zip);
        currentUser.stripeCustomerId = u.stripeCustomerId || null;
        settingsLoaded = true;
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  var btnSaveSettings = document.getElementById('btnSaveSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async function() {
      var msgEl = document.getElementById('settingsMsg');
      var getVal = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

      btnSaveSettings.disabled = true;
      btnSaveSettings.textContent = 'Saving...';

      try {
        var res = await fetch('/api/diy/profile', {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            firstName: getVal('settingsFirstName'),
            lastName: getVal('settingsLastName'),
            phone: getVal('settingsPhone'),
            address: getVal('settingsAddress'),
            city: getVal('settingsCity'),
            state: getVal('settingsState'),
            zip: getVal('settingsZip')
          })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        currentUser = Object.assign(currentUser, data.user);
        updateWelcome();
        if (msgEl) {
          msgEl.textContent = 'Settings saved successfully!';
          msgEl.style.display = '';
          msgEl.style.background = 'rgba(16,185,129,0.1)';
          msgEl.style.color = '#10b981';
        }
      } catch (e) {
        if (msgEl) {
          msgEl.textContent = e.message;
          msgEl.style.display = '';
          msgEl.style.background = 'rgba(239,68,68,0.1)';
          msgEl.style.color = '#ef4444';
        }
      }
      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = 'Save Changes';
    });
  }

  var btnChangePassword = document.getElementById('btnChangePassword');
  if (btnChangePassword) {
    btnChangePassword.addEventListener('click', async function() {
      var msgEl = document.getElementById('passwordMsg');
      var currentPass = document.getElementById('settingsCurrentPass');
      var newPass = document.getElementById('settingsNewPass');
      var confirmPass = document.getElementById('settingsConfirmPass');

      if (!currentPass.value || !newPass.value) {
        if (msgEl) { msgEl.textContent = 'Please fill in all password fields.'; msgEl.style.display = ''; msgEl.style.background = 'rgba(239,68,68,0.1)'; msgEl.style.color = '#ef4444'; }
        return;
      }
      if (newPass.value.length < 8) {
        if (msgEl) { msgEl.textContent = 'New password must be at least 8 characters.'; msgEl.style.display = ''; msgEl.style.background = 'rgba(239,68,68,0.1)'; msgEl.style.color = '#ef4444'; }
        return;
      }
      if (newPass.value !== confirmPass.value) {
        if (msgEl) { msgEl.textContent = 'New passwords do not match.'; msgEl.style.display = ''; msgEl.style.background = 'rgba(239,68,68,0.1)'; msgEl.style.color = '#ef4444'; }
        return;
      }

      btnChangePassword.disabled = true;
      btnChangePassword.textContent = 'Updating...';

      try {
        var res = await fetch('/api/diy/change-password', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            currentPassword: currentPass.value,
            newPassword: newPass.value
          })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to change password');
        currentPass.value = '';
        newPass.value = '';
        confirmPass.value = '';
        if (msgEl) {
          msgEl.textContent = 'Password updated successfully!';
          msgEl.style.display = '';
          msgEl.style.background = 'rgba(16,185,129,0.1)';
          msgEl.style.color = '#10b981';
        }
      } catch (e) {
        if (msgEl) {
          msgEl.textContent = e.message;
          msgEl.style.display = '';
          msgEl.style.background = 'rgba(239,68,68,0.1)';
          msgEl.style.color = '#ef4444';
        }
      }
      btnChangePassword.disabled = false;
      btnChangePassword.textContent = 'Update Password';
    });
  }

  // ─── FILE UPLOAD ───
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

  // ─── AUDIT ───
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
                '<p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + esc(v.title || v.ruleId) + '</p>' +
                '<p style="font-size:13px;color:var(--diy-text-sub);margin-top:4px;">' + esc(v.explanation || v.description || '') + '</p>' +
                (v.bureau ? '<span style="display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;background:#f3f4f6;border-radius:6px;color:var(--diy-text-sub);">' + esc(v.bureau) + '</span>' : '') +
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

  // ─── GENERATE LETTERS ───
  function handleGenerateLetters() {
    if (violations.length === 0) return;
    if (currentUser && currentUser.plan === 'free') {
      alert('Please upgrade to the DIY plan to generate dispute letters.');
      switchSection('billing');
      return;
    }

    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<svg style="width:16px;height:16px;" class="animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';

    fetch('/api/diy/letters', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reportId: currentReport ? currentReport.id : null, violations: violations })
    }).then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.ok) throw new Error(data.error || 'Letter generation failed');
        loadLetters();
        updateStep(4, 4);
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate Letters';
        switchSection('letters');
      }).catch(function(e) {
        alert('Letter generation failed: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate Letters';
      });
  }

  if (btnGenerateLetters) {
    btnGenerateLetters.addEventListener('click', handleGenerateLetters);
  }

  var btnGenerateMoreLetters = document.getElementById('btnGenerateMoreLetters');
  if (btnGenerateMoreLetters) {
    btnGenerateMoreLetters.addEventListener('click', function() {
      handleGenerateLetters.call(btnGenerateMoreLetters);
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

  function esc(str){ return String(str ?? '').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function renderEducation(){
    var container = document.getElementById('education');
    if(!container) return;
    var activeTier = typeof window.getActiveTier === 'function' ? window.getActiveTier() : 'beginner';

    var tiers = {
      beginner: { data: window.EDUCATION_LESSONS || [], label: 'Beginner', icon: '📗', xpEach: 100, desc: 'Credit fundamentals', color: '#22c55e' },
      intermediate: { data: window.EDUCATION_INTERMEDIATE || [], label: 'Intermediate', icon: '📙', xpEach: 150, desc: 'FCRA, FDCPA, CFPB', color: '#f59e0b' },
      expert: { data: window.EDUCATION_EXPERT || [], label: 'Expert', icon: '📕', xpEach: 200, desc: 'Legal & regulatory', color: '#ef4444' }
    };

    var currentTier = tiers[activeTier] || tiers.beginner;
    var lessonData = currentTier.data;
    var statuses = typeof window.resolveStatuses === 'function' ? window.resolveStatuses(lessonData) : [];
    var lessons = lessonData.map(function(l, i){
      return { id: l.id, title: l.title, subtitle: l.subtitle, icon: l.icon, status: statuses[i] || 'locked' };
    });

    var allLessons = typeof window.getAllLessons === 'function' ? window.getAllLessons() : lessonData;
    var completedCount = typeof window.getCompletedCount === 'function' ? window.getCompletedCount() : 0;
    var totalXP = typeof window.getTotalXP === 'function' ? window.getTotalXP() : 0;
    var streak = typeof window.getStreak === 'function' ? window.getStreak() : { days: 0 };
    var level = Math.floor(totalXP / 800) + 1;
    var xpInLevel = totalXP % 800;
    var xpNeeded = 800;
    var xpPct = Math.min((xpInLevel / xpNeeded) * 100, 100);

    var header = document.querySelector('.edu-header');
    if(header){
      var levelBadge = header.querySelector('.edu-level-badge');
      if(levelBadge) levelBadge.textContent = 'Level ' + level;
      var xpLabel = header.querySelectorAll('.edu-xp-label span');
      if(xpLabel && xpLabel.length > 1) xpLabel[1].textContent = totalXP + ' / ' + (level * xpNeeded) + ' XP';
      var xpFill = header.querySelector('.edu-xp-fill');
      if(xpFill) xpFill.style.width = xpPct + '%';
      var statsLine = header.querySelector('.edu-xp-bar > div:last-child');
      if(statsLine && !statsLine.classList.contains('edu-xp-label') && !statsLine.classList.contains('edu-xp-track')) {
        statsLine.innerHTML = '<span>\uD83D\uDD25 ' + esc(streak.days || 0) + ' day streak</span><span>\u2705 ' + esc(completedCount) + ' of ' + esc(allLessons.length) + ' complete</span>';
      }
    }

    var tierCompleted = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(lessonData) : 0;
    var tabsHtml = '<div class="edu-tier-tabs">';
    ['beginner','intermediate','expert'].forEach(function(key){
      var t = tiers[key];
      var isActive = key === activeTier;
      var tc = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(t.data) : 0;
      tabsHtml += '<button class="edu-tier-tab' + (isActive ? ' active' : '') + '" data-tier="' + key + '" type="button" style="--tier-color:' + t.color + '">';
      tabsHtml += '<span class="edu-tier-tab-icon">' + t.icon + '</span>';
      tabsHtml += '<span class="edu-tier-tab-info">';
      tabsHtml += '<span class="edu-tier-tab-label">' + t.label + '</span>';
      tabsHtml += '<span class="edu-tier-tab-desc">' + t.desc + '</span>';
      tabsHtml += '</span>';
      tabsHtml += '<span class="edu-tier-tab-progress">' + tc + '/' + t.data.length + '</span>';
      tabsHtml += '</button>';
    });
    tabsHtml += '</div>';

    var tierInfoHtml = '<div class="edu-tier-info">';
    tierInfoHtml += '<span class="edu-tier-xp-badge" style="background:' + currentTier.color + '20;color:' + currentTier.color + '">' + currentTier.xpEach + ' XP per lesson</span>';
    tierInfoHtml += '<span class="edu-tier-count">' + tierCompleted + ' of ' + lessonData.length + ' complete</span>';
    tierInfoHtml += '</div>';

    var mapHtml = '';
    lessons.forEach(function(lesson, i){
      var align = i % 2 === 0 ? 'align-left' : 'align-right';
      var nodeClass = 'edu-node ' + lesson.status;
      var stepClass = 'edu-step ' + align + (lesson.status === 'locked' ? ' locked' : '');
      var inner = '';
      if(lesson.status === 'completed'){
        inner = '<span class="edu-check">\u2713</span>';
      } else if(lesson.status === 'current'){
        inner = lesson.icon;
      } else {
        inner = '<span class="edu-lock">\uD83D\uDD12</span>';
      }
      var clickable = lesson.status !== 'locked';
      var tag = clickable ? 'button' : 'div';
      var extra = clickable ? ' data-lesson-id="' + lesson.id + '" type="button"' : '';
      mapHtml += '<' + tag + ' class="' + stepClass + '"' + extra + '>' +
        '<div class="' + nodeClass + '">' + inner + '</div>' +
        '<div class="edu-lesson-info">' +
          '<div class="edu-lesson-title">' + esc(lesson.title) + '</div>' +
          '<div class="edu-lesson-subtitle">' + esc(lesson.subtitle) + '</div>' +
        '</div>' +
      '</' + tag + '>';
      if(i < lessons.length - 1){
        var connClass = 'edu-connector';
        if(lesson.status === 'completed' && (statuses[i+1] === 'completed' || statuses[i+1] === 'current')) connClass += ' completed';
        mapHtml += '<div class="' + connClass + '"></div>';
      }
    });

    var testsHtml = '';
    if(activeTier === 'beginner' && window.BEGINNER_TESTS){
      var testProgress = typeof window.getBeginnerTestProgress === 'function' ? window.getBeginnerTestProgress() : null;
      testsHtml += '<div class="edu-beginner-tests">';
      testsHtml += '<div class="edu-tests-header">Beginner Tests</div>';
      testsHtml += '<div class="edu-tests-grid">';
      window.BEGINNER_TESTS.forEach(function(t){
        var lessonsReady = typeof window.areTestLessonsComplete === 'function' && window.areTestLessonsComplete(t.subjects);
        var passed = testProgress && testProgress.isTestPassed(t.index);
        var cardClass = 'edu-test-card';
        if(passed) cardClass += ' passed';
        else if(!lessonsReady) cardClass += ' locked';
        testsHtml += '<div class="' + cardClass + '">';
        testsHtml += '<div class="edu-test-card-header">';
        testsHtml += '<span class="edu-test-label">' + t.label + '</span>';
        if(passed) testsHtml += '<span class="edu-test-passed-badge">\u2713 Passed</span>';
        else if(!lessonsReady) testsHtml += '<span class="edu-test-locked-badge">\uD83D\uDD12</span>';
        testsHtml += '</div>';
        testsHtml += '<div class="edu-test-subjects">';
        t.names.forEach(function(n){ testsHtml += '<div class="edu-test-subject">' + esc(n) + '</div>'; });
        testsHtml += '</div>';
        testsHtml += '<div class="edu-test-meta">' + t.count + ' questions \u00B7 15 min \u00B7 70% to pass</div>';
        if(lessonsReady && !passed){
          testsHtml += '<button class="edu-test-btn" data-test-index="' + t.index + '" type="button">Take Test</button>';
        } else if(passed){
          testsHtml += '<button class="edu-test-btn retake" data-test-index="' + t.index + '" type="button">Retake</button>';
        } else {
          testsHtml += '<button class="edu-test-btn disabled" disabled type="button">Complete Lessons First</button>';
        }
        testsHtml += '</div>';
      });
      testsHtml += '</div></div>';
    }

    var quizHtml = '';
    var tierAllComplete = typeof window.isTierComplete === 'function' && window.isTierComplete(activeTier);
    var tierQuizPassed = typeof window.isTierQuizPassed === 'function' && window.isTierQuizPassed(activeTier);

    quizHtml += '<div class="edu-tier-quiz-section' + (!tierAllComplete ? ' locked' : '') + '">';
    if(tierQuizPassed){
      quizHtml += '<div class="edu-quiz-passed">';
      quizHtml += '<span class="edu-quiz-passed-icon">🎓</span>';
      quizHtml += '<span class="edu-quiz-passed-text">' + currentTier.label + ' Tier Complete — Exam Passed!</span>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-cert-btn" data-cert-tier="' + activeTier + '" type="button">Download Certificate 📜</button>';
    } else if(tierAllComplete){
      quizHtml += '<div class="edu-quiz-available">';
      quizHtml += '<span class="edu-quiz-icon">📝</span>';
      quizHtml += '<div class="edu-quiz-info">';
      quizHtml += '<div class="edu-quiz-title">' + currentTier.label + ' Final Exam Available!</div>';
      quizHtml += '<div class="edu-quiz-desc">Pass the timed exam to earn bonus XP and your graduation certificate.</div>';
      quizHtml += '</div>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-quiz-btn" data-quiz-tier="' + activeTier + '" type="button">Take Final Exam</button>';
    } else {
      var remaining = lessonData.length - tierCompleted;
      quizHtml += '<div class="edu-quiz-locked">';
      quizHtml += '<span class="edu-quiz-locked-icon">🔒</span>';
      quizHtml += '<div class="edu-quiz-info">';
      quizHtml += '<div class="edu-quiz-title">' + currentTier.label + ' Final Exam</div>';
      quizHtml += '<div class="edu-quiz-desc">Complete all ' + lessonData.length + ' lessons to unlock the final exam. ' + remaining + ' lesson' + (remaining !== 1 ? 's' : '') + ' remaining.</div>';
      quizHtml += '</div>';
      quizHtml += '</div>';
      quizHtml += '<button class="edu-quiz-btn disabled" disabled type="button">Take Final Exam</button>';
    }
    quizHtml += '</div>';

    container.innerHTML = tabsHtml + tierInfoHtml + mapHtml + testsHtml + quizHtml;

    container.querySelectorAll('.edu-tier-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        var tier = tab.getAttribute('data-tier');
        if(typeof window.setActiveTier === 'function') window.setActiveTier(tier);
        renderEducation();
      });
    });

    container.querySelectorAll('[data-lesson-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var lid = btn.getAttribute('data-lesson-id');
        if(typeof window.openLesson === 'function') window.openLesson(lid);
      });
    });

    container.querySelectorAll('[data-quiz-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tier = btn.getAttribute('data-quiz-tier');
        if(typeof window.openTierQuiz === 'function') window.openTierQuiz(tier);
      });
    });

    container.querySelectorAll('[data-cert-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tier = btn.getAttribute('data-cert-tier');
        if(typeof window.generateCertificate === 'function') window.generateCertificate(tier);
      });
    });

    container.querySelectorAll('[data-test-index]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = parseInt(btn.getAttribute('data-test-index'), 10);
        if(typeof window.openBeginnerTest === 'function') window.openBeginnerTest(idx);
      });
    });
  }
  window.refreshEducation = renderEducation;
  renderEducation();

  var diyAffLoaded = false;
  var diyAffAvailableBalance = 0;

  function loadDiyAffiliate() {
    if (diyAffLoaded) return;
    diyAffLoaded = true;
    var diyToken = localStorage.getItem('diy_token');
    if (!diyToken) return;
    var hdrs = { 'Authorization': 'Bearer ' + diyToken, 'Content-Type': 'application/json' };

    fetch('/api/affiliate/me', { headers: hdrs })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok && data.affiliate) renderDiyAffDashboard(data.affiliate, data.stats);
      }).catch(function() {});

    fetch('/api/affiliate/commission-rates')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok || !d.rates) return;
        var r = d.rates;
        var el;
        el = document.getElementById('diyRateDiyBasic'); if (el) el.textContent = '$' + r.diy_basic;
        el = document.getElementById('diyRateDiyPro'); if (el) el.textContent = '$' + r.diy_pro;
        el = document.getElementById('diyRateDiyTradeline'); if (el) el.textContent = (r.diy_tradeline < 1 ? Math.round(r.diy_tradeline * 100) : r.diy_tradeline) + '%';
        el = document.getElementById('diyRateCrmStarter'); if (el) el.textContent = '$' + r.crm_starter;
        el = document.getElementById('diyRateCrmBusiness'); if (el) el.textContent = '$' + r.crm_business;
        el = document.getElementById('diyRateCrmEnterprise'); if (el) el.textContent = '$' + r.crm_enterprise;
      }).catch(function() {});

    var joinBtn = document.getElementById('diyJoinAffiliate');
    if (joinBtn) {
      joinBtn.addEventListener('click', function() {
        fetch('/api/affiliate/join', { method: 'POST', headers: hdrs })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.ok) {
              fetch('/api/affiliate/me', { headers: hdrs })
                .then(function(r) { return r.json(); })
                .then(function(d) {
                  if (d.ok && d.affiliate) renderDiyAffDashboard(d.affiliate, d.stats);
                });
            }
          }).catch(function() {});
      });
    }

    var copyBtn = document.getElementById('diyAffCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var input = document.getElementById('diyAffLink');
        if (input) {
          navigator.clipboard.writeText(input.value).then(function() {
            copyBtn.textContent = 'Copied!';
            setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
          });
        }
      });
    }

    var payoutBtn = document.getElementById('diyBtnRequestPayout');
    var payoutModal = document.getElementById('diyPayoutModal');
    var payoutModalClose = document.getElementById('diyPayoutModalClose');
    var payoutMethod = document.getElementById('diyPayoutMethod');
    var payoutEmailLabel = document.getElementById('diyPayoutEmailLabel');
    var payoutEmailGroup = document.getElementById('diyPayoutEmailGroup');
    var payoutEmail = document.getElementById('diyPayoutEmail');
    var payoutError = document.getElementById('diyPayoutError');
    var payoutSubmit = document.getElementById('diyPayoutSubmit');

    if (payoutBtn && payoutModal) {
      payoutBtn.addEventListener('click', function() {
        var balEl = document.getElementById('diyPayoutModalBalance');
        if (balEl) balEl.textContent = '$' + diyAffAvailableBalance.toFixed(2);
        if (payoutError) { payoutError.style.display = 'none'; payoutError.textContent = ''; }
        if (payoutEmail) payoutEmail.value = '';
        if (payoutMethod) payoutMethod.value = 'paypal';
        if (payoutEmailLabel) payoutEmailLabel.textContent = 'PayPal Email';
        if (payoutEmailGroup) payoutEmailGroup.style.display = '';
        if (payoutEmail) payoutEmail.placeholder = 'you@example.com';
        payoutModal.style.display = 'flex';
      });
    }

    if (payoutModalClose && payoutModal) {
      payoutModalClose.addEventListener('click', function() {
        payoutModal.style.display = 'none';
      });
    }

    if (payoutModal) {
      payoutModal.addEventListener('click', function(e) {
        if (e.target === payoutModal) payoutModal.style.display = 'none';
      });
    }

    if (payoutMethod) {
      payoutMethod.addEventListener('change', function() {
        var val = payoutMethod.value;
        if (val === 'paypal') {
          if (payoutEmailLabel) payoutEmailLabel.textContent = 'PayPal Email';
          if (payoutEmailGroup) payoutEmailGroup.style.display = '';
          if (payoutEmail) payoutEmail.placeholder = 'you@example.com';
        } else if (val === 'venmo') {
          if (payoutEmailLabel) payoutEmailLabel.textContent = 'Venmo Username or Phone';
          if (payoutEmailGroup) payoutEmailGroup.style.display = '';
          if (payoutEmail) payoutEmail.placeholder = '@username or phone';
        } else {
          if (payoutEmailLabel) payoutEmailLabel.textContent = 'Mailing Address';
          if (payoutEmailGroup) payoutEmailGroup.style.display = '';
          if (payoutEmail) payoutEmail.placeholder = '123 Main St, City, ST 12345';
        }
      });
    }

    if (payoutSubmit) {
      payoutSubmit.addEventListener('click', function() {
        var method = payoutMethod ? payoutMethod.value : 'paypal';
        var details = payoutEmail ? payoutEmail.value.trim() : '';
        if (!details) {
          if (payoutError) { payoutError.textContent = 'Please enter your payout details.'; payoutError.style.display = ''; }
          return;
        }
        if (diyAffAvailableBalance <= 0) {
          if (payoutError) { payoutError.textContent = 'No available balance to request a payout.'; payoutError.style.display = ''; }
          return;
        }
        payoutSubmit.disabled = true;
        payoutSubmit.textContent = 'Submitting...';
        var body = { method: method };
        body.payoutEmail = details;

        fetch('/api/affiliate/payout', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify(body)
        })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            payoutSubmit.disabled = false;
            payoutSubmit.textContent = 'Submit Payout Request';
            if (data.ok) {
              if (payoutModal) payoutModal.style.display = 'none';
              diyAffLoaded = false;
              loadDiyAffiliate();
            } else {
              if (payoutError) { payoutError.textContent = data.error || 'Failed to submit payout request.'; payoutError.style.display = ''; }
            }
          })
          .catch(function() {
            payoutSubmit.disabled = false;
            payoutSubmit.textContent = 'Submit Payout Request';
            if (payoutError) { payoutError.textContent = 'Network error. Please try again.'; payoutError.style.display = ''; }
          });
      });
    }
  }

  function diyPayoutStatusBadge(status) {
    var colors = {
      pending: 'background:rgba(250,204,21,0.15);color:#facc15;',
      approved: 'background:rgba(96,165,250,0.15);color:#60a5fa;',
      paid: 'background:rgba(74,222,128,0.15);color:#4ade80;',
      rejected: 'background:rgba(239,68,68,0.15);color:#ef4444;',
      cancelled: 'background:rgba(156,163,175,0.15);color:#9ca3af;'
    };
    var s = colors[status] || colors.pending;
    return '<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;' + s + '">' + esc(status) + '</span>';
  }

  function cancelDiyPayout(payoutId) {
    var diyToken = localStorage.getItem('diy_token');
    if (!diyToken) return;
    var hdrs = { 'Authorization': 'Bearer ' + diyToken, 'Content-Type': 'application/json' };
    fetch('/api/affiliate/payout/' + encodeURIComponent(payoutId) + '/cancel', {
      method: 'POST',
      headers: hdrs
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          diyAffLoaded = false;
          loadDiyAffiliate();
        }
      })
      .catch(function() {});
  }

  function renderDiyAffDashboard(aff, stats) {
    var notJoined = document.getElementById('diyAffNotJoined');
    var dashboard = document.getElementById('diyAffDashboard');
    if (notJoined) notJoined.style.display = 'none';
    if (dashboard) dashboard.style.display = '';

    var link = location.origin + '/api/affiliate/track/' + aff.refCode;
    var linkInput = document.getElementById('diyAffLink');
    if (linkInput) linkInput.value = link;

    var el = function(id) { return document.getElementById(id); };
    if (el('diyStatClicks')) el('diyStatClicks').textContent = stats.clicks || 0;
    if (el('diyStatSignups')) el('diyStatSignups').textContent = stats.conversions || 0;
    if (el('diyStatEarned')) el('diyStatEarned').textContent = '$' + (stats.totalEarned || 0).toFixed(2);
    if (el('diyStatRate')) el('diyStatRate').textContent = (stats.conversionRate || '0.0') + '%';

    var totalEarned = stats.totalEarned || 0;
    var totalPaid = stats.totalPaid || 0;
    var pendingPayouts = stats.pendingPayoutTotal || 0;
    diyAffAvailableBalance = stats.availableBalance != null ? stats.availableBalance : (totalEarned - totalPaid - pendingPayouts);

    if (el('diyEarningsTotalEarned')) el('diyEarningsTotalEarned').textContent = '$' + totalEarned.toFixed(2);
    if (el('diyEarningsPaidOut')) el('diyEarningsPaidOut').textContent = '$' + totalPaid.toFixed(2);
    if (el('diyEarningsPending')) el('diyEarningsPending').textContent = '$' + pendingPayouts.toFixed(2);
    if (el('diyEarningsAvailable')) el('diyEarningsAvailable').textContent = '$' + diyAffAvailableBalance.toFixed(2);

    var payoutTbody = document.getElementById('diyPayoutTable');
    if (payoutTbody) {
      var payouts = aff.payouts || [];
      if (payouts.length > 0) {
        payoutTbody.innerHTML = payouts.slice().reverse().map(function(p) {
          var date = new Date(p.requestedAt || p.date).toLocaleDateString();
          var cancelBtn = p.status === 'pending' ? '<button onclick="cancelDiyPayout(\'' + esc(p.id) + '\')" style="background:none;border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Cancel</button>' : '';
          return '<tr style="border-bottom:1px solid var(--diy-border);"><td style="padding:8px;">' + date + '</td><td style="padding:8px;">$' + (p.amount || 0).toFixed(2) + '</td><td style="padding:8px;text-transform:capitalize;">' + esc(p.method || 'paypal') + '</td><td style="padding:8px;">' + diyPayoutStatusBadge(p.status || 'pending') + '</td><td style="padding:8px;">' + cancelBtn + '</td></tr>';
        }).join('');
      } else {
        payoutTbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--diy-text-sub);">No payout requests yet.</td></tr>';
      }
    }

    var tbody = document.getElementById('diyAffTable');
    if (tbody && aff.referrals && aff.referrals.length > 0) {
      tbody.innerHTML = aff.referrals.slice().reverse().map(function(r) {
        var date = new Date(r.date).toLocaleDateString();
        var sc = r.status === 'paid' ? 'color:#4ade80' : 'color:#facc15';
        return '<tr style="border-bottom:1px solid var(--diy-border);"><td style="padding:8px;">' + date + '</td><td style="padding:8px;text-transform:uppercase;font-weight:600;font-size:11px;">' + (r.type || 'diy') + '</td><td style="padding:8px;">' + (r.plan || '-') + '</td><td style="padding:8px;color:#4ade80;">$' + (r.earned || 0).toFixed(2) + '</td><td style="padding:8px;' + sc + '">' + (r.status || 'pending') + '</td></tr>';
      }).join('');
    }
  }

  window.cancelDiyPayout = cancelDiyPayout;

  init();
})();
