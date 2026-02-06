(() => {
  const token = localStorage.getItem('diy_token');
  let currentUser = null;
  let currentCompanyId = null;
  const LOCAL_COMPANY_PREFIX = 'local-company:';
  const LOCAL_COMPANY_SELECTION_KEY = 'diy_local_company';

  const userEmail = document.getElementById('userEmail');
  const planBadge = document.getElementById('planBadge');
  const companyList = document.getElementById('companyList');
  const currentCompany = document.getElementById('currentCompany');
  const upgradeStatus = document.getElementById('upgradeStatus');
  const upgradeButtons = document.querySelectorAll('.upgrade-btn');

  if (!token) {
    window.location.href = '/diy/login';
    return;
  }

  async function init() {
    await loadUser();
    await Promise.all([loadCompanies(), loadCurrentCompany()]);
    bindUpgradeButtons();
  }

  async function loadUser() {
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

  async function loadCompanies() {
    companyList.innerHTML = '<div class="text-sm text-gray-500">Loading ranked picks...</div>';
    try {
      const res = await fetch('/api/diy/credit-companies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load companies');

      const localCompany = getLocalCompanyProfile();
      const companies = Array.isArray(data.companies) ? [...data.companies] : [];
      if (localCompany && !companies.some(company => company.name?.toLowerCase() === localCompany.name.toLowerCase())) {
        companies.unshift(localCompany);
      }

      if (companies.length === 0) {
        companyList.innerHTML = '<div class="text-sm text-gray-500">No companies available for your plan.</div>';
        return;
      }

      companyList.innerHTML = companies.map(renderCompanyCard).join('');
      companyList.querySelectorAll('.select-company').forEach(button => {
        button.addEventListener('click', () => handleSelectCompany(button.dataset.companyId));
      });
    } catch (e) {
      companyList.innerHTML = `<div class="text-sm text-red-500">${e.message}</div>`;
    }
  }

  async function loadCurrentCompany() {
    try {
      const res = await fetch('/api/diy/credit-companies/current', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.company) {
        const localSelection = getLocalCompanySelection();
        if (localSelection) {
          currentCompanyId = localSelection.companyId;
          currentCompany.innerHTML = `
            <p class="font-semibold text-gray-900">${localSelection.name}</p>
            <p class="text-xs text-gray-500">${localSelection.serviceArea} · Min plan: ${formatPlan(localSelection.minPlan)}</p>
          `;
          return;
        }
        currentCompanyId = null;
        currentCompany.innerHTML = '<p>No company selected yet.</p><a href="#companyList" class="text-emerald-600 font-medium">Browse top picks →</a>';
        return;
      }
      clearLocalCompanySelection();
      currentCompanyId = data.company.id;
      currentCompany.innerHTML = `
        <p class="font-semibold text-gray-900">${data.company.name}</p>
        <p class="text-xs text-gray-500">${data.company.serviceArea} · Min plan: ${formatPlan(data.company.minPlan)}</p>
      `;
    } catch (e) {
      currentCompany.textContent = 'Unable to load current selection.';
    }
  }

  function renderCompanyCard(company) {
    const badges = [];
    if (Number.isFinite(company.metrics?.disputeSuccessRate) && company.metrics.disputeSuccessRate >= 0.85) {
      badges.push(renderBadge('High success rate', 'emerald'));
    }
    if (Number.isFinite(company.metrics?.avgResponseTimeDays) && company.metrics.avgResponseTimeDays <= 3) {
      badges.push(renderBadge('Fast response', 'blue'));
    }
    if (company.isBoosted) {
      badges.push(renderBadge('Boosted placement', 'amber'));
    }

    const successRate = Number.isFinite(company.metrics?.disputeSuccessRate)
      ? `${Math.round(company.metrics.disputeSuccessRate * 100)}%`
      : '—';
    const avgResponse = Number.isFinite(company.metrics?.avgResponseTimeDays)
      ? `${company.metrics.avgResponseTimeDays.toFixed(1)}d`
      : '—';
    const reviewScore = Number.isFinite(company.metrics?.reviewScore)
      ? company.metrics.reviewScore.toFixed(1)
      : '—';

    const buttonDisabled = !company.eligible;
    const buttonLabel = buttonDisabled ? `Upgrade to ${formatPlan(company.minPlan)}` : 'Select';

    return `
      <div class="card p-5 border border-gray-100">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-gray-400 font-semibold">Rank ${company.rank}</p>
            <h3 class="text-lg font-semibold text-gray-900 mt-1">${company.name}</h3>
            <p class="text-sm text-gray-600 mt-1">${company.focus}</p>
            <p class="text-xs text-gray-500 mt-2">${company.serviceArea} · Min plan: ${formatPlan(company.minPlan)}</p>
          </div>
          <button class="select-company btn-primary text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed" data-company-id="${company.companyId}" ${buttonDisabled ? 'disabled' : ''}>
            ${buttonLabel}
          </button>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          ${badges.join('')}
        </div>
        <div class="mt-4 grid grid-cols-3 gap-4 text-xs text-gray-500">
          <div>
            <p class="font-semibold text-gray-700">${successRate}</p>
            <p>Success rate</p>
          </div>
          <div>
            <p class="font-semibold text-gray-700">${avgResponse}</p>
            <p>Avg response</p>
          </div>
          <div>
            <p class="font-semibold text-gray-700">${reviewScore}</p>
            <p>Review score</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderBadge(label, tone) {
    const styles = {
      emerald: 'bg-emerald-100 text-emerald-700',
      blue: 'bg-blue-100 text-blue-700',
      amber: 'bg-amber-100 text-amber-700'
    };
    return `<span class="inline-flex items-center rounded-full ${styles[tone]} px-2 py-0.5 text-xs font-medium">${label}</span>`;
  }

  function formatPlan(plan) {
    if (!plan) return 'Free';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  function getLocalCompanyProfile() {
    const info = JSON.parse(localStorage.getItem('companyInfo') || '{}');
    if (!info.name) return null;
    const companyId = `${LOCAL_COMPANY_PREFIX}${slugify(info.name) || 'profile'}`;
    return {
      companyId,
      name: info.name,
      serviceArea: info.address || 'Local only',
      minPlan: 'basic',
      focus: 'Local company profile',
      eligible: true,
      isBoosted: false,
      rank: 'Local',
      metrics: {}
    };
  }

  function getLocalCompanySelection() {
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_COMPANY_SELECTION_KEY) || 'null');
      if (!stored || !stored.name) return null;
      return stored;
    } catch {
      return null;
    }
  }

  function setLocalCompanySelection(company) {
    localStorage.setItem(LOCAL_COMPANY_SELECTION_KEY, JSON.stringify(company));
  }

  function clearLocalCompanySelection() {
    localStorage.removeItem(LOCAL_COMPANY_SELECTION_KEY);
  }

  async function handleSelectCompany(companyId) {
    if (companyId?.startsWith(LOCAL_COMPANY_PREFIX)) {
      const localCompany = getLocalCompanyProfile();
      if (!localCompany) {
        alert('Company profile missing. Please update your company info first.');
        return;
      }
      setLocalCompanySelection(localCompany);
      currentCompanyId = localCompany.companyId;
      currentCompany.innerHTML = `
        <p class="font-semibold text-gray-900">${localCompany.name}</p>
        <p class="text-xs text-gray-500">${localCompany.serviceArea} · Min plan: ${formatPlan(localCompany.minPlan)}</p>
      `;
      return;
    }
    clearLocalCompanySelection();
    try {
      let dissatisfiedReason = null;
      if (currentCompanyId && currentCompanyId !== companyId) {
        dissatisfiedReason = window.prompt('Optional: share why you are switching companies (helps improve rankings).', '');
      }
      const res = await fetch('/api/diy/credit-companies/select', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ companyId, dissatisfiedReason: dissatisfiedReason || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Selection failed');
      await loadCurrentCompany();
    } catch (e) {
      alert(e.message);
    }
  }

  function bindUpgradeButtons() {
    upgradeButtons.forEach(button => {
      button.addEventListener('click', () => upgradePlan(button.dataset.plan));
    });
  }

  async function upgradePlan(plan) {
    try {
      const res = await fetch('/api/diy/upgrade', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');
      localStorage.setItem('diy_token', data.token);
      currentUser = data.user;
      updatePlanBadge(currentUser.plan);
      upgradeStatus.textContent = `Plan updated to ${formatPlan(currentUser.plan)}.`;
      upgradeStatus.classList.remove('hidden');
      await loadCompanies();
    } catch (e) {
      upgradeStatus.textContent = e.message;
      upgradeStatus.classList.remove('hidden');
      upgradeStatus.classList.add('text-red-500');
    }
  }

  init();
})();
