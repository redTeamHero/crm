document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token') || localStorage.getItem('auth');
  if (!token) return;

  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const origin = window.location.origin;

  async function loadAffiliate() {
    try {
      const res = await fetch('/api/affiliate/me', { headers });
      const data = await res.json();
      if (data.ok && data.affiliate) {
        renderDashboard(data.affiliate, data.stats);
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

  document.getElementById('btnJoinAffiliate').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/affiliate/join', { method: 'POST', headers });
      const data = await res.json();
      if (data.ok && data.affiliate) {
        const meRes = await fetch('/api/affiliate/me', { headers });
        const meData = await meRes.json();
        renderDashboard(meData.affiliate, meData.stats);
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
