(() => {
  const token = localStorage.getItem('diy_token');
  let currentUser = null;
  let currentReport = null;
  let violations = [];
  let diyStripeProducts = [];

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

    if (sectionId === 'tradelines') loadTradelines();
    if (sectionId === 'news') loadNews();
    if (sectionId === 'billing') loadBilling();
    if (sectionId === 'settings') loadSettings();
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
      loadDiyProducts();
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
              '<p style="font-weight:600;color:var(--diy-text);font-size:14px;">' + (letter.bureau || 'Dispute Letter') + '</p>' +
              '<p style="font-size:12px;color:var(--diy-text-sub);">' + dateStr + '</p>' +
              '</div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
              '<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:rgba(16,185,129,0.1);color:#10b981;font-weight:600;">Ready to Mail</span>' +
              '<a href="/api/diy/letters/' + letter.id + '/download" class="diy-btn diy-btn-primary" style="padding:6px 14px;font-size:12px;text-decoration:none;">Download PDF</a>' +
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

        var ratingDisplay = rating !== null ? renderStars(Math.round(rating)) + '<span class="specialist-reviews">(' + rating + ')</span>' : '<span class="specialist-reviews">New</span>';
        var clientsDisplay = activeClients !== null ? activeClients : 'New';
        var avgDaysDisplay = avgDays !== null ? avgDays + 'd' : 'N/A';
        var successDisplay = successRate !== null ? successRate + '%' : 'New';

        return '<div class="specialist-card" data-company-id="' + (company.companyId || company.id || idx) + '">' +
          '<div class="specialist-header">' +
          '<div class="specialist-avatar" style="background:' + color + ';">' + initial + '</div>' +
          '<div style="flex:1;">' +
          '<div class="specialist-name">' + (company.name || 'Credit Company') + '</div>' +
          '<div class="specialist-location">' + (company.serviceArea || 'Nationwide') + '</div>' +
          '<div class="specialist-rating" style="margin-top:4px;">' +
          ratingDisplay +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="specialist-stats">' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + clientsDisplay + '</div><div class="specialist-stat-label">Active Clients</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + avgDaysDisplay + '</div><div class="specialist-stat-label">Avg. Response</div></div>' +
          '<div class="specialist-stat"><div class="specialist-stat-value">' + successDisplay + '</div><div class="specialist-stat-label">Success Rate</div></div>' +
          '</div>' +
          (badges ? '<div class="specialist-badges">' + badges + '</div>' : '') +
          '<button class="diy-btn diy-btn-primary" style="width:100%;margin-top:12px;" type="button" data-select-company="' + (company.companyId || company.id || idx) + '">Choose This Specialist</button>' +
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
                return '<option value="' + r.id + '">' + r.label + ' (' + r.count + ')</option>';
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
            return '<option value="' + b + '"' + (b === currentBank ? ' selected' : '') + '>' + b + '</option>';
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
          '<div class="tradeline-field"><strong>' + (tl.bank || 'Unknown') + '</strong>Bank</div>' +
          '<div class="tradeline-field"><strong>' + priceDisplay + '</strong>Price</div>' +
          '<div class="tradeline-field"><strong>' + limitDisplay + '</strong>Credit Limit</div>' +
          '<div class="tradeline-field"><strong>' + (tl.age || '—') + '</strong>Age</div>' +
          (tl.reporting ? '<div class="tradeline-field"><strong>' + tl.reporting + '</strong>Reports To</div>' : '') +
          '</div>' +
          (tl.buy_link ? '<a href="' + tl.buy_link + '" target="_blank" rel="noopener" class="diy-btn diy-btn-primary" style="padding:8px 16px;font-size:12px;text-decoration:none;white-space:nowrap;">View Details</a>' : '') +
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
        return '<a href="' + (item.link || '#') + '" target="_blank" rel="noopener" class="news-card" style="display:block;text-decoration:none;">' +
          '<div class="news-title">' + (item.title || 'Untitled') + '</div>' +
          (item.description ? '<div class="news-desc">' + item.description + '</div>' : '') +
          (dateStr ? '<div class="news-date">' + dateStr + '</div>' : '') +
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
      currentPlanEl.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    }

    document.querySelectorAll('.billing-plan-btn').forEach(function(btn) {
      var btnPlan = btn.getAttribute('data-plan');
      if (btnPlan === (currentUser ? currentUser.plan : 'free')) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
        btn.className = 'diy-btn diy-btn-secondary billing-plan-btn';
      } else {
        btn.textContent = 'Upgrade to ' + btnPlan.charAt(0).toUpperCase() + btnPlan.slice(1);
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
        statusEl.textContent = 'Plan updated to ' + plan.charAt(0).toUpperCase() + plan.slice(1) + '!';
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

  // ─── GENERATE LETTERS ───
  function handleGenerateLetters() {
    if (violations.length === 0) return;
    if (currentUser && currentUser.plan === 'free') {
      alert('Please upgrade to Basic or Pro plan to generate dispute letters.');
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

  init();
})();
