document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!token) return;

  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const origin = window.location.origin;
  let currentAvailableBalance = 0;

  fetch('/api/affiliate/commission-rates')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok || !d.rates) return;
      var r = d.rates;
      var el;
      el = document.getElementById('affRateDiyBasic'); if (el) el.textContent = '$' + r.diy_basic;
      el = document.getElementById('affRateDiyPro'); if (el) el.textContent = '$' + r.diy_pro;
      el = document.getElementById('affRateDiyTradeline'); if (el) el.textContent = (r.diy_tradeline < 1 ? Math.round(r.diy_tradeline * 100) : r.diy_tradeline) + '% commission';
      el = document.getElementById('affRateCrmStarter'); if (el) el.textContent = '$' + r.crm_starter;
      el = document.getElementById('affRateCrmBusiness'); if (el) el.textContent = '$' + r.crm_business;
      el = document.getElementById('affRateCrmEnterprise'); if (el) el.textContent = '$' + r.crm_enterprise;
    }).catch(function() {});

  async function loadAffiliate() {
    try {
      const res = await fetch('/api/affiliate/me', { headers });
      const data = await res.json();
      if (data.ok && data.affiliate) {
        renderDashboard(data.affiliate, data.stats);
        loadPayoutHistory();
      }
    } catch {}
  }

  function renderDashboard(aff, stats) {
    document.getElementById('affiliateNotJoined').classList.add('hidden');
    document.getElementById('affiliateDashboard').classList.remove('hidden');

    const diyLink = origin + '/api/affiliate/track/' + aff.refCode;
    const crmLink = origin + '/api/affiliate/track/' + aff.refCode + '?dest=crm';
    document.getElementById('affLinkDiy').value = diyLink;
    document.getElementById('affLinkCrm').value = crmLink;

    document.getElementById('statClicks').textContent = stats.clicks || 0;
    document.getElementById('statConversions').textContent = stats.conversions || 0;
    document.getElementById('statEarned').textContent = '$' + (stats.totalEarned || 0).toFixed(2);
    document.getElementById('statRate').textContent = (stats.conversionRate || '0.0') + '%';

    const totalEarned = stats.totalEarned || 0;
    const totalPaid = stats.totalPaid || 0;
    const pendingPayouts = stats.pendingPayoutTotal || 0;
    const availableBalance = stats.availableBalance != null ? stats.availableBalance : (totalEarned - totalPaid - pendingPayouts);
    currentAvailableBalance = availableBalance;

    document.getElementById('earningsTotalEarned').textContent = '$' + totalEarned.toFixed(2);
    document.getElementById('earningsPaidOut').textContent = '$' + totalPaid.toFixed(2);
    document.getElementById('earningsPending').textContent = '$' + pendingPayouts.toFixed(2);
    document.getElementById('earningsAvailable').textContent = '$' + availableBalance.toFixed(2);

    const tbody = document.getElementById('referralTableBody');
    if (aff.referrals && aff.referrals.length > 0) {
      tbody.innerHTML = aff.referrals.slice().reverse().map(r => {
        const date = new Date(r.date).toLocaleDateString();
        const statusColor = r.status === 'paid' ? 'text-green-400' : 'text-yellow-400';
        return '<tr class="border-b border-white/5">' +
          '<td class="py-2">' + date + '</td>' +
          '<td class="py-2 uppercase text-xs font-semibold">' + (r.type || 'diy') + '</td>' +
          '<td class="py-2">' + (r.plan || '-') + '</td>' +
          '<td class="py-2 text-green-400">$' + (r.earned || 0).toFixed(2) + '</td>' +
          '<td class="py-2 ' + statusColor + '">' + (r.status || 'pending') + '</td>' +
          '</tr>';
      }).join('');
    }
  }

  async function loadPayoutHistory() {
    try {
      const res = await fetch('/api/affiliate/payouts', { headers });
      const data = await res.json();
      const tbody = document.getElementById('payoutTableBody');
      if (data.ok && data.payouts && data.payouts.length > 0) {
        tbody.innerHTML = data.payouts.slice().reverse().map(p => {
          const date = new Date(p.requestedAt).toLocaleDateString();
          const statusColors = {
            pending: 'bg-yellow-400/15 text-yellow-400',
            approved: 'bg-blue-400/15 text-blue-400',
            paid: 'bg-green-400/15 text-green-400',
            rejected: 'bg-red-400/15 text-red-400',
            cancelled: 'bg-gray-400/15 text-gray-400'
          };
          const badgeClass = statusColors[p.status] || 'bg-gray-400/15 text-gray-400';
          const cancelBtn = p.status === 'pending'
            ? '<button class="btn-cancel-payout text-xs px-2 py-1 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25" data-id="' + p.id + '">Cancel</button>'
            : '';
          return '<tr class="border-b border-white/5">' +
            '<td class="py-2">' + date + '</td>' +
            '<td class="py-2 text-green-400">$' + (p.amount || 0).toFixed(2) + '</td>' +
            '<td class="py-2 capitalize">' + (p.method || '-') + '</td>' +
            '<td class="py-2"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + badgeClass + '">' + p.status + '</span></td>' +
            '<td class="py-2">' + cancelBtn + '</td>' +
            '</tr>';
        }).join('');

        tbody.querySelectorAll('.btn-cancel-payout').forEach(btn => {
          btn.addEventListener('click', async () => {
            const payoutId = btn.getAttribute('data-id');
            await cancelPayout(payoutId);
          });
        });
      } else {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-gray-500">No payout requests yet.</td></tr>';
      }
    } catch {}
  }

  async function cancelPayout(payoutId) {
    try {
      const res = await fetch('/api/affiliate/payout/' + payoutId + '/cancel', { method: 'POST', headers });
      const data = await res.json();
      if (data.ok) {
        await loadAffiliate();
      } else {
        alert(data.error || 'Failed to cancel payout');
      }
    } catch {
      alert('Failed to cancel payout');
    }
  }

  const payoutModal = document.getElementById('payoutModal');
  const payoutMethodSelect = document.getElementById('payoutMethod');
  const payoutEmailLabel = document.getElementById('payoutEmailLabel');
  const payoutEmailInput = document.getElementById('payoutEmail');
  const payoutEmailGroup = document.getElementById('payoutEmailGroup');
  const payoutError = document.getElementById('payoutError');

  function openPayoutModal() {
    document.getElementById('payoutModalBalance').textContent = '$' + currentAvailableBalance.toFixed(2);
    payoutMethodSelect.value = 'paypal';
    payoutEmailInput.value = '';
    payoutError.classList.add('hidden');
    updatePayoutMethodLabel();
    payoutModal.style.display = 'flex';
    payoutModal.classList.remove('hidden');
  }

  function closePayoutModal() {
    payoutModal.style.display = 'none';
    payoutModal.classList.add('hidden');
  }

  function updatePayoutMethodLabel() {
    const method = payoutMethodSelect.value;
    if (method === 'paypal') {
      payoutEmailLabel.textContent = 'PayPal Email';
      payoutEmailInput.placeholder = 'you@example.com';
      payoutEmailGroup.classList.remove('hidden');
    } else if (method === 'venmo') {
      payoutEmailLabel.textContent = 'Venmo Username or Phone';
      payoutEmailInput.placeholder = '@username or phone number';
      payoutEmailGroup.classList.remove('hidden');
    } else if (method === 'check') {
      payoutEmailLabel.textContent = 'Mailing Address';
      payoutEmailInput.placeholder = '123 Main St, City, State ZIP';
      payoutEmailGroup.classList.remove('hidden');
    }
  }

  document.getElementById('btnRequestPayout').addEventListener('click', openPayoutModal);
  document.getElementById('payoutModalClose').addEventListener('click', closePayoutModal);
  payoutModal.addEventListener('click', (e) => { if (e.target === payoutModal) closePayoutModal(); });
  payoutMethodSelect.addEventListener('change', updatePayoutMethodLabel);

  document.getElementById('payoutSubmit').addEventListener('click', async () => {
    payoutError.classList.add('hidden');
    const method = payoutMethodSelect.value;
    const payoutEmail = payoutEmailInput.value.trim();

    if (!payoutEmail) {
      payoutError.textContent = 'Please enter your payout details.';
      payoutError.classList.remove('hidden');
      return;
    }

    if (currentAvailableBalance <= 0) {
      payoutError.textContent = 'No available balance to request a payout.';
      payoutError.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/affiliate/payout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ method, payoutEmail })
      });
      const data = await res.json();
      if (data.ok) {
        closePayoutModal();
        await loadAffiliate();
      } else {
        payoutError.textContent = data.error || 'Failed to submit payout request.';
        payoutError.classList.remove('hidden');
      }
    } catch {
      payoutError.textContent = 'Failed to submit payout request.';
      payoutError.classList.remove('hidden');
    }
  });

  document.getElementById('btnJoinAffiliate').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/affiliate/join', { method: 'POST', headers });
      const data = await res.json();
      if (data.ok && data.affiliate) {
        const meRes = await fetch('/api/affiliate/me', { headers });
        const meData = await meRes.json();
        renderDashboard(meData.affiliate, meData.stats);
        loadPayoutHistory();
      }
    } catch (err) {
      alert('Failed to join affiliate program');
    }
  });

  document.getElementById('affCopyDiy').addEventListener('click', () => {
    const input = document.getElementById('affLinkDiy');
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('affCopyDiy');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy DIY'; }, 2000);
    });
  });

  document.getElementById('affCopyCrm').addEventListener('click', () => {
    const input = document.getElementById('affLinkCrm');
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('affCopyCrm');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy CRM'; }, 2000);
    });
  });

  await loadAffiliate();
});
