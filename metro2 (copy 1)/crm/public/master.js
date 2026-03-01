(function () {
  'use strict';

  var token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  var headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString();
  }

  function currency(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function animateCounter(el, value) {
    if (!el) return;
    el.classList.add('counter-animate');
  }

  function loadStats() {
    fetch('/api/master/stats', { headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;

        var total = (data.totalCrmUsers || 0) + (data.totalDiyUsers || 0);
        var el;

        el = $('heroTotalUsers');
        if (el) { el.textContent = fmt(total); animateCounter(el); }

        el = $('heroActiveTenants');
        if (el) { el.textContent = fmt(data.activeTenants); animateCounter(el); }

        el = $('statCrmUsers');
        if (el) { el.textContent = fmt(data.totalCrmUsers); animateCounter(el); }

        el = $('statDiyUsers');
        if (el) { el.textContent = fmt(data.totalDiyUsers); animateCounter(el); }

        el = $('statConsumers');
        if (el) { el.textContent = fmt(data.totalConsumers); animateCounter(el); }

        var signups = (data.crmSignups30d || 0) + (data.diySignups30d || 0);
        el = $('statNewSignups');
        if (el) { el.textContent = fmt(signups); animateCounter(el); }

        var activeCount = (data.consumersByStatus && data.consumersByStatus.active) || 0;
        el = $('statActiveUsers');
        if (el) { el.textContent = fmt(activeCount); animateCounter(el); }

        var inactiveCount = 0;
        if (data.consumersByStatus) {
          for (var key in data.consumersByStatus) {
            if (key !== 'active') inactiveCount += data.consumersByStatus[key];
          }
        }
        el = $('statInactiveUsers');
        if (el) { el.textContent = fmt(inactiveCount); animateCounter(el); }
      })
      .catch(function (err) {
        console.error('Failed to load stats:', err);
      });
  }

  function loadRevenue() {
    fetch('/api/master/revenue', { headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;

        var el;

        el = $('heroMrr');
        if (el) { el.textContent = currency(data.totalMrr); animateCounter(el); }

        el = $('revMrr');
        if (el) { el.textContent = currency(data.totalMrr); animateCounter(el); }

        el = $('revTotal');
        if (el) { el.textContent = currency(data.totalCollected); animateCounter(el); }

        el = $('revCrm');
        if (el) { el.textContent = currency(data.crmMrr); animateCounter(el); }

        el = $('revDiy');
        if (el) { el.textContent = currency(data.diyMrr); animateCounter(el); }

        var subCount = (data.crmSubscriptionCount || 0) + (data.diySubscriptionCount || 0);
        el = $('revSubCount');
        if (el) { el.textContent = fmt(subCount); animateCounter(el); }

        el = $('revProfitLoss');
        var pl = data.profitLoss || 0;
        if (el) {
          el.textContent = currency(Math.abs(pl));
          if (pl >= 0) {
            el.classList.remove('text-red-400');
            el.classList.add('text-green-400');
          } else {
            el.classList.remove('text-green-400');
            el.classList.add('text-red-400');
          }
          animateCounter(el);
        }

        var plLabel = $('revProfitLossLabel');
        if (plLabel) {
          plLabel.textContent = pl >= 0 ? 'Net profit — collected exceeds outstanding' : 'Net loss — outstanding exceeds collected';
        }
      })
      .catch(function (err) {
        console.error('Failed to load revenue:', err);
      });
  }

  function renderNews(announcements) {
    var container = $('newsList');
    if (!container) return;

    if (!announcements || announcements.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-4">No announcements yet. Create one above.</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < announcements.length; i++) {
      var a = announcements[i];
      var date = new Date(a.createdAt);
      var dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      var timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      var urgentBadge = a.priority === 'urgent'
        ? '<span class="ml-2 rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Urgent</span>'
        : '';

      html += '<div class="news-item rounded-xl border border-[#1a1a1a] p-4">';
      html += '<div class="flex items-start justify-between gap-3">';
      html += '<div class="flex-1 min-w-0">';
      html += '<div class="flex items-center gap-2 flex-wrap">';
      html += '<h5 class="text-sm font-semibold text-white">' + escapeHtml(a.title) + '</h5>';
      html += urgentBadge;
      html += '</div>';
      html += '<p class="mt-1 text-sm text-gray-400 whitespace-pre-wrap">' + escapeHtml(a.body) + '</p>';
      html += '<p class="mt-2 text-[11px] text-gray-600">By ' + escapeHtml(a.createdBy || 'admin') + ' on ' + dateStr + ' at ' + timeStr + '</p>';
      html += '</div>';
      html += '<button class="news-delete flex-shrink-0 rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-500 hover:text-red-400 hover:border-red-400/50 transition" data-id="' + a.id + '">Delete</button>';
      html += '</div>';
      html += '</div>';
    }
    container.innerHTML = html;

    var deleteBtns = container.querySelectorAll('.news-delete');
    for (var j = 0; j < deleteBtns.length; j++) {
      deleteBtns[j].addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        deleteNews(id);
      });
    }
  }

  function loadNews() {
    fetch('/api/master/news', { headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) renderNews(data.announcements);
      })
      .catch(function (err) {
        console.error('Failed to load news:', err);
      });
  }

  function deleteNews(id) {
    if (!confirm('Delete this announcement?')) return;
    fetch('/api/master/news/' + id, { method: 'DELETE', headers: headers })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) loadNews();
      })
      .catch(function (err) {
        console.error('Failed to delete news:', err);
      });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var form = $('newsForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('newsTitle').value.trim();
      var body = $('newsBody').value.trim();
      var priority = $('newsPriority').value;
      if (!title || !body) return;

      fetch('/api/master/news', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ title: title, body: body, priority: priority })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            $('newsTitle').value = '';
            $('newsBody').value = '';
            $('newsPriority').value = 'normal';
            loadNews();
          }
        })
        .catch(function (err) {
          console.error('Failed to create news:', err);
        });
    });
  }

  loadStats();
  loadRevenue();
  loadNews();
})();
