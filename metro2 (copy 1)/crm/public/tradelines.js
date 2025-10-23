import { setupPageTour } from './tour-guide.js';

setupPageTour('tradelines', {
  steps: [
    {
      id: 'tradelines-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Switch between Tradelines, Clients, and Billing.</p>
             <p class="mt-1 text-xs text-slate-600">Use this flow to prep upsells and financing plans.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'tradelines-overview',
      title: 'Educate first',
      text: `<p class="font-semibold">Set expectations before pitching tradelines.</p>
             <p class="mt-1 text-xs text-slate-600">Stay compliance-safe by focusing on education and budgeting.</p>`,
      attachTo: { element: '#tradelinesOverview', on: 'top' }
    },
    {
      id: 'tradelines-range',
      title: 'Select price ranges',
      text: `<p class="font-semibold">Segment offers by budget.</p>
             <p class="mt-1 text-xs text-slate-600">Match price tiers to buyer personas before showing banks.</p>`,
      attachTo: { element: '#tradelinesRangeSection', on: 'top' }
    },
    {
      id: 'tradelines-bank',
      title: 'Choose banks',
      text: `<p class="font-semibold">Filter by lenders clients already trust.</p>
             <p class="mt-1 text-xs text-slate-600">Capture preferences before confirming availability.</p>`,
      attachTo: { element: '#tradelinesBankSection', on: 'top' }
    },
    {
      id: 'tradelines-results',
      title: 'Review tradelines',
      text: `<p class="font-semibold">Compare price, limit, age, and cadence.</p>
             <p class="mt-1 text-xs text-slate-600">Log results and remind buyers there are no guaranteed score changes.</p>`,
      attachTo: { element: '#tradelinesResultsSection', on: 'top' }
    }
  ]
});

/* public/tradelines.js */
document.addEventListener('DOMContentLoaded', () => {
  const priceRangeGrid = document.getElementById('price-range-grid');
  const bankGrid = document.getElementById('bank-grid');
  const bankHint = document.getElementById('bank-hint');
  const resetRangeBtn = document.getElementById('reset-range');
  const tradelineContainer = document.getElementById('tradeline-container');
  const searchInput = document.getElementById('search');
  const sortSelect = document.getElementById('sort');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const pageIndicator = document.getElementById('page-indicator');
  const resultsMeta = document.getElementById('results-meta');
  const titleEl = document.getElementById('title');
  const rangeHeading = document.getElementById('range-heading');
  const rangeSubheading = document.getElementById('range-subheading');
  const bankHeading = document.getElementById('bank-heading');
  const bankSubheading = document.getElementById('bank-subheading');
  const resultsHeading = document.getElementById('results-heading');
  const resultsSubheading = document.getElementById('results-subheading');
  const rangeKpi = document.getElementById('range-kpi');
  const mobileBuy = document.getElementById('mobile-buy');
  const overviewHeading = document.getElementById('overview-heading');
  const overviewDescription = document.getElementById('overview-description');
  const howHeading = document.getElementById('how-heading');
  const howList = document.getElementById('how-list');
  const expectHeading = document.getElementById('expect-heading');
  const expectList = document.getElementById('expect-list');
  const complianceNote = document.getElementById('compliance-note');

  const CLIENT_PAGE_SIZE = 9;

  const COPY = {
      title: '📊 Browse Tradelines',
      rangeHeading: '1. Select a price range',
      rangeSubheading: 'Filter by retail price to match your client\'s budget.',
      rangeCta: 'View offers',
      rangeCount: (count) => `${count} offers`,
      bankHeading: '2. Choose a bank',
      bankSubheading: 'Highlight banks your buyer already trusts.',
      bankAll: 'All banks',
      bankHint: (rangeLabel, count) =>
        rangeLabel
          ? `Range selected: ${rangeLabel}. ${count} offers ready.`
          : 'Pick a price range to load banks.',
      resetRange: 'Change price range',
      resultsHeading: '3. Review tradelines',
      resultsSubheading: 'Preview retail price, credit limit, and reporting cadence.',
      searchPlaceholder: 'Search within results',
      sortLabel: 'Sort',
      emptyState: 'Select a range and bank to preview tradelines.',
      emptyAfterFilter: '🔍 No tradelines found. Refine your filters or try another bank.',
      metaSummary: (count, bank) => {
        if (!count) return 'No tradelines loaded yet.';
        if (bank) return `${count} tradelines loaded for ${bank}.`;
        return `${count} tradelines loaded in this price range.`;
      },
      prev: 'Prev',
      next: 'Next',
      kpi: 'Conversion KPI: Range-to-Bank CTR',
      mobileBuy: 'Buy Now',
      analyticsNote: 'Track: range_selected, bank_selected, tradeline_checkout',
      rangesLoading: 'Loading ranges...',
      rangesError: 'Unable to load ranges.',
      rangesEmpty: 'No ranges available.',
      loadError: 'Unable to load tradelines. Try again.',
      overviewHeading: 'How tradelines support your plan',
      overviewDescription:
        'Use authorized-user tradelines to add positive history for qualified clients while reinforcing education and budgeting habits.',
      howHeading: 'How they work',
      howItems: [
        'Clients are added as authorized users to seasoned revolving accounts with on-time history.',
        'Banks report the new authorized user during the next statement cycle shared with all three bureaus.',
        'Access is rental-based: after the term ends we remove the authorized user while your team reviews the impact.',
      ],
      expectHeading: 'What to expect',
      expectItems: [
        'Identity verification is required before we request a bank to add the authorized user.',
        'Seat confirmations generally take one statement cycle; exact timing depends on bank cut-off dates.',
        'Encourage clients to monitor all three bureaus and capture screenshots once the tradeline appears.',
        'We never promise score boosts—use tradelines with education, budgeting, and dispute strategies.',
      ],
      complianceNote:
        'Keep records of consent and educate buyers that results vary by bureau, data furnisher, and existing credit profile.',
  };

  const state = {
    ranges: [],
    selectedRange: null,
    selectedRangeMeta: null,
    banks: [],
    selectedBank: null,
    allItems: [],
    filteredItems: [],
    page: 1,
  };

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function applyCopy() {
    titleEl.textContent = COPY.title;
    rangeHeading.textContent = COPY.rangeHeading;
    rangeSubheading.textContent = COPY.rangeSubheading;
    bankHeading.textContent = COPY.bankHeading;
    bankSubheading.textContent = COPY.bankSubheading;
    resultsHeading.textContent = COPY.resultsHeading;
    resultsSubheading.textContent = COPY.resultsSubheading;
    rangeKpi.textContent = COPY.kpi;
    searchInput.placeholder = COPY.searchPlaceholder;
    sortSelect.options[0].textContent = COPY.sortLabel;
    prevBtn.textContent = COPY.prev;
    nextBtn.textContent = COPY.next;
    mobileBuy.textContent = COPY.mobileBuy;
    resetRangeBtn.textContent = COPY.resetRange;
    overviewHeading.textContent = COPY.overviewHeading;
    overviewDescription.textContent = COPY.overviewDescription;
    howHeading.textContent = COPY.howHeading;
    howList.innerHTML = COPY.howItems.map((text) => `<li>${text}</li>`).join('');
    expectHeading.textContent = COPY.expectHeading;
    expectList.innerHTML = COPY.expectItems.map((text) => `<li>${text}</li>`).join('');
    complianceNote.textContent = COPY.complianceNote;
    renderRanges();
    renderBanks();
    renderTradelines();
  }

  async function loadRanges() {
    priceRangeGrid.innerHTML = `<div class="text-sm text-gray-500">${COPY.rangesLoading}</div>`;
    try {
      const data = await fetchJson('/api/tradelines');
      state.ranges = data.ranges || [];
      renderRanges();
    } catch (err) {
      console.error('Failed to load tradeline ranges', err);
      priceRangeGrid.innerHTML = `<div class="text-sm text-red-500">${COPY.rangesError}</div>`;
    }
  }

  async function loadRangeData(rangeId, bank = '') {
    if (!rangeId) return;
    const params = new URLSearchParams({ range: rangeId, perPage: '400' });
    if (bank) params.set('bank', bank);
    const url = `/api/tradelines?${params.toString()}`;
    try {
      const data = await fetchJson(url);
      const isNewRange = state.selectedRange !== rangeId;
      state.selectedRange = rangeId;
      state.selectedRangeMeta = data.range || null;
      state.banks = data.banks || [];
      state.selectedBank = bank || null;
      const aggregatedItems = Array.isArray(data.tradelines) ? [...data.tradelines] : [];
      const totalPagesRaw = Number.parseInt(data.totalPages, 10);
      const totalPages = Number.isFinite(totalPagesRaw) ? totalPagesRaw : 1;
      if (totalPages > 1) {
        const perPageValue = data.perPage || params.get('perPage') || '400';
        for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
          const extraParams = new URLSearchParams({ range: rangeId, page: String(nextPage), perPage: String(perPageValue) });
          if (bank) extraParams.set('bank', bank);
          try {
            const pageData = await fetchJson(`/api/tradelines?${extraParams.toString()}`);
            if (Array.isArray(pageData.tradelines)) {
              aggregatedItems.push(...pageData.tradelines);
            }
          } catch (pageError) {
            console.error('Failed to load tradelines page', pageError);
          }
        }
      }
      state.allItems = aggregatedItems;
      if (isNewRange) {
        searchInput.value = '';
        sortSelect.value = '';
      }
      filterAndSortItems(true);
      renderBanks();
      renderTradelines();
    } catch (err) {
      console.error('Failed to load tradelines', err);
      bankHint.textContent = COPY.loadError;
  }
}

function renderRanges() {
    const copy = COPY;
    priceRangeGrid.innerHTML = '';
    if (!state.ranges.length) {
      priceRangeGrid.innerHTML = `<div class="text-sm text-gray-500">${COPY.rangesEmpty}</div>`;
      return;
    }
    state.ranges.forEach((range) => {
      const isActive = state.selectedRange === range.id;
      const button = document.createElement('button');
      button.className = `p-4 rounded-xl border text-left transition shadow-sm hover:shadow-md focus:ring-2 focus:ring-blue-500 ${
        isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200'
      }`;
      button.dataset.rangeId = range.id;
      button.innerHTML = `
        <div class="text-sm uppercase tracking-wide mb-1">${copy.rangeHeading.split('.')[0]}</div>
        <div class="text-2xl font-semibold">${range.label}</div>
        <div class="text-sm mt-2 opacity-80">${copy.rangeCount(range.count || 0)}</div>
        <div class="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
          ${copy.rangeCta}
          <span aria-hidden="true">➜</span>
        </div>
      `;
      button.addEventListener('click', () => {
        if (state.selectedRange === range.id) return;
        loadRangeData(range.id);
      });
      priceRangeGrid.appendChild(button);
    });
  }

  function renderBanks() {
    const copy = COPY;
    bankGrid.innerHTML = '';
    const rangeLabel = state.selectedRangeMeta?.label || '';
    const totalInRange = state.ranges.find((r) => r.id === state.selectedRange)?.count || 0;
    bankHint.textContent = copy.bankHint(rangeLabel, totalInRange);

    if (!state.selectedRange) {
      resetRangeBtn.classList.add('hidden');
      return;
    }
    resetRangeBtn.classList.remove('hidden');

    const allButton = document.createElement('button');
    allButton.className = `px-4 py-2 rounded-full border transition ${
      !state.selectedBank ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200'
    }`;
    allButton.textContent = copy.bankAll;
    allButton.addEventListener('click', () => loadRangeData(state.selectedRange));
    bankGrid.appendChild(allButton);

    state.banks.forEach(({ bank, count }) => {
      const btn = document.createElement('button');
      const isActive = state.selectedBank === bank;
      btn.className = `px-4 py-2 rounded-full border transition hover:shadow ${
        isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200'
      }`;
      btn.textContent = `${bank} (${count})`;
      btn.addEventListener('click', () => loadRangeData(state.selectedRange, bank));
      bankGrid.appendChild(btn);
    });

    const note = document.createElement('div');
    note.className = 'mt-4 text-xs text-gray-400';
    note.textContent = COPY.analyticsNote;
    bankGrid.appendChild(note);
  }

  function filterAndSortItems(resetPage = false) {
    const query = searchInput.value.trim().toLowerCase();
    const sort = sortSelect.value;
    let items = [...state.allItems];

    if (query) {
      items = items.filter((item) => {
        return [item.bank, item.age, item.reporting]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(query));
      });
    }

    const compare = {
      'price-asc': (a, b) => (a.price ?? 0) - (b.price ?? 0),
      'price-desc': (a, b) => (b.price ?? 0) - (a.price ?? 0),
      'limit-asc': (a, b) => (a.limit ?? 0) - (b.limit ?? 0),
      'limit-desc': (a, b) => (b.limit ?? 0) - (a.limit ?? 0),
      'age-asc': (a, b) => (a.age || '').localeCompare(b.age || ''),
      'age-desc': (a, b) => (b.age || '').localeCompare(a.age || ''),
    };

    if (compare[sort]) {
      items.sort(compare[sort]);
    }

    state.filteredItems = items;
    if (resetPage) {
      state.page = 1;
    }
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  }

  function renderTradelines() {
    const copy = COPY;
    tradelineContainer.innerHTML = '';

    if (!state.selectedRange) {
      resultsMeta.textContent = copy.metaSummary(0, null);
      tradelineContainer.innerHTML = `<div class="text-sm text-gray-500">${copy.emptyState}</div>`;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageIndicator.textContent = '';
      mobileBuy.classList.add('hidden');
      return;
    }

    filterAndSortItems(false);
    const { filteredItems } = state;
    resultsMeta.textContent = copy.metaSummary(filteredItems.length, state.selectedBank);

    if (!filteredItems.length) {
      tradelineContainer.innerHTML = `<div class="col-span-full text-center text-gray-500 text-lg py-10">${copy.emptyAfterFilter}</div>`;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageIndicator.textContent = '';
      mobileBuy.classList.add('hidden');
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / CLIENT_PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * CLIENT_PAGE_SIZE;
    const paginated = filteredItems.slice(start, start + CLIENT_PAGE_SIZE);

    paginated.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'bg-white shadow-md rounded-xl p-4 hover:shadow-lg transition transform hover:scale-[1.01] duration-200 flex flex-col gap-2';

      const bankTitle = document.createElement('h3');
      bankTitle.className = 'text-xl font-semibold';
      bankTitle.textContent = item.bank || 'Unknown Bank';
      card.appendChild(bankTitle);

      const meta = document.createElement('p');
      meta.className = 'text-sm text-gray-600';
      const limit = Number.isFinite(item.limit) ? formatCurrency(item.limit) : '';
      meta.textContent = `${item.age || 'Seasoning N/A'}${limit ? ` • ${limit} limit` : ''}`;
      card.appendChild(meta);

      const price = document.createElement('p');
      price.className = 'text-lg font-bold text-green-600';
      price.textContent = formatCurrency(item.price);
      card.appendChild(price);

      if (item.statement_date) {
        const stmt = document.createElement('p');
        stmt.className = 'text-xs text-gray-500';
        stmt.textContent = `Statement: ${item.statement_date}`;
        card.appendChild(stmt);
      }

      if (item.reporting) {
        const rep = document.createElement('p');
        rep.className = 'text-xs text-gray-500';
        rep.textContent = `Reports to: ${item.reporting}`;
        card.appendChild(rep);
      }

      const cta = document.createElement('a');
      cta.href = item.buy_link || '#';
      cta.className = 'inline-flex items-center justify-center gap-2 mt-3 bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 transition';
      cta.textContent = copy.mobileBuy;
      cta.target = '_blank';
      card.appendChild(cta);

      tradelineContainer.appendChild(card);
    });

    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pageIndicator.textContent = `${state.page}/${totalPages}`;
    mobileBuy.href = paginated[0]?.buy_link || '#';
    if (paginated[0]?.buy_link) {
      mobileBuy.classList.remove('hidden');
    } else {
      mobileBuy.classList.add('hidden');
    }
  }

  prevBtn.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    renderTradelines();
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(state.filteredItems.length / CLIENT_PAGE_SIZE));
    if (state.page >= totalPages) return;
    state.page += 1;
    renderTradelines();
  });

  searchInput.addEventListener('input', () => {
    filterAndSortItems(true);
    renderTradelines();
  });

  sortSelect.addEventListener('change', () => {
    filterAndSortItems(true);
    renderTradelines();
  });

  resetRangeBtn.addEventListener('click', () => {
    state.selectedRange = null;
    state.selectedRangeMeta = null;
    state.selectedBank = null;
    state.allItems = [];
    state.filteredItems = [];
    state.page = 1;
    renderBanks();
    renderTradelines();
  });
  applyCopy();
  loadRanges();
});

