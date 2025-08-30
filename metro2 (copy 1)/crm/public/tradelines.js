/* public/tradelines.js */
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('tradeline-container');
  const searchInput = document.getElementById('search');
  const sortSelect = document.getElementById('sort');
  const mobileBuy = document.getElementById('mobile-buy');
  const bankList = document.getElementById('bank-list');

  let tradelines = [];
  try {
    const resp = await fetch('/api/tradelines');
    const data = await resp.json();
    tradelines = data.tradelines || [];
  } catch (e) {
    console.error('Failed to load tradelines', e);
  }

  let currentPage = 1;
  const perPage = 10;
  let filteredData = tradelines;

  function renderBankList(data) {
    const banks = [...new Set(data.map(t => t.bank))].sort();
    bankList.textContent = banks.length ? `Available Banks: ${banks.join(', ')}` : '';
  }

  function renderTradelines(data) {
    container.innerHTML = '';
    const paginated = data.slice((currentPage - 1) * perPage, currentPage * perPage);

    if (paginated.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center text-gray-500 text-lg py-10">🔍 No tradelines found. Try a different search or filter.</div>`;
      mobileBuy.classList.add('hidden');
      return;
    }

    paginated.forEach(t => {
      const el = document.createElement('div');
      el.className = 'bg-white shadow-md rounded-xl p-4 hover:shadow-lg transition transform hover:scale-[1.01] duration-200';
      el.innerHTML = `
        <h2 class="text-xl font-semibold">${t.bank}</h2>
        <p class="text-sm text-gray-600 mb-2">${t.age} | $${t.limit} limit</p>
        <p class="text-lg font-bold text-green-600">$${t.price}</p>
        <p class="text-xs text-gray-400">Statement: ${t.statement_date}</p>
        <p class="text-xs text-gray-400">Reports to: ${t.reporting}</p>
        <a href="${t.buy_link}" class="inline-block mt-3 bg-blue-500 text-white text-sm px-4 py-2 rounded hover:bg-blue-600 transition">Buy Now</a>
      `;
      container.appendChild(el);
    });

    mobileBuy.href = paginated[0].buy_link || '#';
    mobileBuy.classList.remove('hidden');
  }

  function filterAndSort() {
    filteredData = tradelines.filter(t => t.bank.toLowerCase().includes(searchInput.value.toLowerCase()));
    const sortBy = sortSelect.value;

    if (sortBy === 'price-asc') filteredData.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') filteredData.sort((a, b) => b.price - a.price);
    if (sortBy === 'limit-asc') filteredData.sort((a, b) => a.limit - b.limit);
    if (sortBy === 'limit-desc') filteredData.sort((a, b) => b.limit - a.limit);
    if (sortBy === 'age-asc') filteredData.sort((a, b) => (a.age || '').localeCompare(b.age || ''));
    if (sortBy === 'age-desc') filteredData.sort((a, b) => (b.age || '').localeCompare(a.age || ''));

    renderBankList(filteredData);
    renderTradelines(filteredData);
  }

  document.getElementById('prev').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTradelines(filteredData);
    }
  });

  document.getElementById('next').addEventListener('click', () => {
    if ((currentPage * perPage) < filteredData.length) {
      currentPage++;
      renderTradelines(filteredData);
    }
  });

  searchInput.addEventListener('input', () => { currentPage = 1; filterAndSort(); });
  sortSelect.addEventListener('change', () => { currentPage = 1; filterAndSort(); });

  filterAndSort();
});

