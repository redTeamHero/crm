document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!token) { window.location.href = '/'; return; }

  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function loadRates() {
    try {
      var res = await fetch('/api/affiliate/commission-rates', { headers: headers });
      var data = await res.json();
      if (data.ok && data.rates) {
        document.getElementById('rate_diy_basic').value = data.rates.diy_basic;
        document.getElementById('rate_diy_pro').value = data.rates.diy_pro;
        document.getElementById('rate_diy_tradeline').value = data.rates.diy_tradeline;
        document.getElementById('rate_crm_starter').value = data.rates.crm_starter;
        document.getElementById('rate_crm_business').value = data.rates.crm_business;
        document.getElementById('rate_crm_enterprise').value = data.rates.crm_enterprise;
      }
    } catch (e) { console.warn('Failed to load rates', e); }
  }

  document.getElementById('btnSaveRates').addEventListener('click', async function() {
    var btn = this;
    var statusEl = document.getElementById('ratesSaveStatus');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    statusEl.classList.add('hidden');
    try {
      var body = {
        diy_basic: document.getElementById('rate_diy_basic').value,
        diy_pro: document.getElementById('rate_diy_pro').value,
        diy_tradeline: document.getElementById('rate_diy_tradeline').value,
        crm_starter: document.getElementById('rate_crm_starter').value,
        crm_business: document.getElementById('rate_crm_business').value,
        crm_enterprise: document.getElementById('rate_crm_enterprise').value
      };
      var res = await fetch('/api/affiliate/commission-rates', { method: 'PUT', headers: headers, body: JSON.stringify(body) });
      var data = await res.json();
      if (data.ok) {
        statusEl.textContent = 'Saved!';
        statusEl.classList.remove('hidden');
        setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
      } else {
        statusEl.textContent = data.error || 'Error';
        statusEl.style.color = '#f87171';
        statusEl.classList.remove('hidden');
        setTimeout(function() { statusEl.classList.add('hidden'); statusEl.style.color = ''; }, 3000);
      }
    } catch (e) {
      statusEl.textContent = 'Error saving';
      statusEl.style.color = '#f87171';
      statusEl.classList.remove('hidden');
      setTimeout(function() { statusEl.classList.add('hidden'); statusEl.style.color = ''; }, 3000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Rates';
    }
  });

  async function loadAffiliates() {
    try {
      var res = await fetch('/api/admin/affiliates', { headers: headers });
      var data = await res.json();
      document.getElementById('affLoading').classList.add('hidden');
      if (!data.ok || !data.affiliates || data.affiliates.length === 0) {
        document.getElementById('affEmpty').classList.remove('hidden');
        return;
      }
      renderCards(data.affiliates);
    } catch (e) {
      document.getElementById('affLoading').classList.add('hidden');
      document.getElementById('affEmpty').classList.remove('hidden');
    }
  }

  function renderCards(affiliates) {
    document.getElementById('affList').classList.remove('hidden');
    var container = document.getElementById('affCards');
    container.innerHTML = affiliates.map(function(aff) {
      var displayName = esc(aff.name || aff.userId || aff.id);
      var displayEmail = aff.email ? esc(aff.email) : '';
      var typeLabel = esc((aff.userType || 'unknown').toUpperCase());
      var priceVal = (aff.customPrice !== '' && aff.customPrice != null) ? aff.customPrice : '';
      var commVal = (aff.customCommissionRate !== '' && aff.customCommissionRate != null) ? aff.customCommissionRate : '';

      return '<div class="aff-card" data-aff-id="' + esc(aff.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
          '<div>' +
            '<div class="font-semibold">' + displayName + '</div>' +
            (displayEmail ? '<div class="text-xs text-gray-400">' + displayEmail + '</div>' : '') +
            '<div class="text-xs text-gray-500">' + typeLabel + '</div>' +
          '</div>' +
          '<code class="text-xs px-2 py-1 rounded font-mono" style="background:rgba(255,255,255,0.05);">' + esc(aff.refCode) + '</code>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;">' +
          '<div class="text-center"><div class="text-xs text-gray-500">Clicks</div><div class="font-semibold">' + (aff.clicks || 0) + '</div></div>' +
          '<div class="text-center"><div class="text-xs text-gray-500">Signups</div><div class="font-semibold">' + (aff.conversions || 0) + '</div></div>' +
          '<div class="text-center"><div class="text-xs text-gray-500">Earned</div><div class="font-semibold text-green-400">$' + (aff.totalEarned || 0).toFixed(2) + '</div></div>' +
          '<div class="text-center"><div class="text-xs text-gray-500">Balance</div><div class="font-semibold">$' + (aff.availableBalance || 0).toFixed(2) + '</div></div>' +
        '</div>' +
        '<div class="aff-edit-row">' +
          '<div><label>Client Price</label><br/><input type="number" step="0.01" min="0" data-field="customPrice" value="' + esc(String(priceVal)) + '" placeholder="default" /></div>' +
          '<div><label>Commission</label><br/><input type="number" step="0.01" min="0" data-field="customCommissionRate" value="' + esc(String(commVal)) + '" placeholder="default" /></div>' +
          '<div style="margin-left:auto;align-self:flex-end;"><button class="btn-save-aff text-xs px-4 py-2 rounded" style="background:rgba(16,185,129,0.15);color:#34d399;cursor:pointer;">Save</button></div>' +
        '</div>' +
      '</div>';
    }).join('');

    container.querySelectorAll('.btn-save-aff').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var card = btn.closest('.aff-card');
        var affId = card.getAttribute('data-aff-id');
        var priceInput = card.querySelector('[data-field="customPrice"]');
        var commInput = card.querySelector('[data-field="customCommissionRate"]');

        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          var res = await fetch('/api/admin/affiliates/' + affId, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({
              customPrice: priceInput.value.trim(),
              customCommissionRate: commInput.value.trim()
            })
          });
          var data = await res.json();
          if (data.ok) {
            btn.textContent = 'Saved!';
            btn.style.background = 'rgba(16,185,129,0.3)';
            setTimeout(function() { btn.textContent = 'Save'; btn.style.background = 'rgba(16,185,129,0.15)'; }, 2000);
          } else {
            btn.textContent = data.error || 'Error';
            setTimeout(function() { btn.textContent = 'Save'; }, 2000);
          }
        } catch (e) {
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

  await loadRates();
  await loadAffiliates();
});
