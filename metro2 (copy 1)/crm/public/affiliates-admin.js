document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!token) { window.location.href = '/'; return; }

  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function loadAffiliates() {
    try {
      const res = await fetch('/api/admin/affiliates', { headers });
      const data = await res.json();
      document.getElementById('affLoading').classList.add('hidden');
      if (!data.ok || !data.affiliates || data.affiliates.length === 0) {
        document.getElementById('affEmpty').classList.remove('hidden');
        return;
      }
      renderTable(data.affiliates);
    } catch {
      document.getElementById('affLoading').classList.add('hidden');
      document.getElementById('affEmpty').classList.remove('hidden');
    }
  }

  function renderTable(affiliates) {
    document.getElementById('affTable').classList.remove('hidden');
    const tbody = document.getElementById('affTableBody');
    tbody.innerHTML = affiliates.map(function(aff) {
      var displayId = aff.userId || aff.id;
      var typeLabel = (aff.userType || 'unknown').toUpperCase();
      return '<tr class="border-b border-white/5" data-aff-id="' + esc(aff.id) + '">' +
        '<td class="p-3"><div class="font-medium">' + esc(displayId) + '</div><div class="text-xs text-gray-500">' + esc(typeLabel) + '</div></td>' +
        '<td class="p-3"><code class="text-xs bg-white/5 px-2 py-1 rounded font-mono">' + esc(aff.refCode) + '</code></td>' +
        '<td class="p-3 text-center">' + (aff.clicks || 0) + '</td>' +
        '<td class="p-3 text-center">' + (aff.conversions || 0) + '</td>' +
        '<td class="p-3 text-right text-green-400">$' + (aff.totalEarned || 0).toFixed(2) + '</td>' +
        '<td class="p-3 text-right">$' + (aff.availableBalance || 0).toFixed(2) + '</td>' +
        '<td class="p-3 text-center">' +
          '<input type="number" step="0.01" min="0" class="aff-price-input bg-black/20 border border-white/10 rounded px-2 py-1 text-sm w-20 text-center" ' +
          'value="' + (aff.customPrice !== '' && aff.customPrice != null ? aff.customPrice : '') + '" ' +
          'placeholder="9.99" data-field="customPrice" />' +
        '</td>' +
        '<td class="p-3 text-center">' +
          '<input type="number" step="0.01" min="0" class="aff-commission-input bg-black/20 border border-white/10 rounded px-2 py-1 text-sm w-20 text-center" ' +
          'value="' + (aff.customCommissionRate !== '' && aff.customCommissionRate != null ? aff.customCommissionRate : '') + '" ' +
          'placeholder="default" data-field="customCommissionRate" />' +
        '</td>' +
        '<td class="p-3 text-center">' +
          '<button class="btn-save-aff text-xs px-3 py-1 rounded" style="background:rgba(16,185,129,0.15);color:#34d399;">Save</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.btn-save-aff').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var row = btn.closest('tr');
        var affId = row.getAttribute('data-aff-id');
        var priceInput = row.querySelector('[data-field="customPrice"]');
        var commInput = row.querySelector('[data-field="customCommissionRate"]');
        var customPrice = priceInput.value.trim();
        var customCommissionRate = commInput.value.trim();

        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          var res = await fetch('/api/admin/affiliates/' + affId, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
              customPrice: customPrice,
              customCommissionRate: customCommissionRate
            })
          });
          var data = await res.json();
          if (data.ok) {
            btn.textContent = 'Saved!';
            btn.style.background = 'rgba(16,185,129,0.3)';
            setTimeout(function() {
              btn.textContent = 'Save';
              btn.style.background = 'rgba(16,185,129,0.15)';
            }, 2000);
          } else {
            btn.textContent = 'Error';
            setTimeout(function() { btn.textContent = 'Save'; }, 2000);
          }
        } catch {
          btn.textContent = 'Error';
          setTimeout(function() { btn.textContent = 'Save'; }, 2000);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  await loadAffiliates();
});
