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

      const bank = document.createElement('h2');
      bank.className = 'text-xl font-semibold';
      bank.textContent = t.bank;
      el.appendChild(bank);

      const meta = document.createElement('p');
      meta.className = 'text-sm text-gray-600 mb-2';
      meta.textContent = `${t.age} | ${formatCurrency(t.limit)} limit`;
      el.appendChild(meta);

      const price = document.createElement('p');
      price.className = 'text-lg font-bold text-green-600';
      price.textContent = formatCurrency(t.price);
      el.appendChild(price);

      const stmt = document.createElement('p');
      stmt.className = 'text-xs text-gray-400';
      stmt.textContent = `Statement: ${t.statement_date}`;
      el.appendChild(stmt);

      const rep = document.createElement('p');
      rep.className = 'text-xs text-gray-400';
      rep.textContent = `Reports to: ${t.reporting}`;
      el.appendChild(rep);

      const link = document.createElement('a');
      link.href = t.buy_link;
      link.className = 'inline-block mt-3 bg-blue-500 text-white text-sm px-4 py-2 rounded hover:bg-blue-600 transition';
      link.textContent = 'Buy Now';
      el.appendChild(link);

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

