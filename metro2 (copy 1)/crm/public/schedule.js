/* public/schedule.js */
document.addEventListener('DOMContentLoaded', () => {
  const calEl = document.getElementById('calendar');
  const titleEl = document.getElementById('calTitle');
  const subtitleEl = document.getElementById('calSubtitle');
  const summaryEl = document.getElementById('calendarSummary');
  const listEl = document.getElementById('appointmentList');
  const focusEl = document.getElementById('dayStrip');
  const focusTitle = document.getElementById('focusTitle');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const modal = document.getElementById('eventModal');
  const dateInput = document.getElementById('eventDate');
  const typeInput = document.getElementById('eventType');
  const textInput = document.getElementById('eventText');
  const saveBtn = document.getElementById('saveEvent');
  const deleteBtn = document.getElementById('deleteEvent');
  const cancelBtn = document.getElementById('cancelEvent');
  const newBtn = document.getElementById('newEvent');

  let current = new Date();
  let events = [];
  let editingId = null;
  let selectedDate = new Date().toISOString().split('T')[0];
  let calendarError = '';
  let calendarNotice = '';

  const dayMs = 24 * 60 * 60 * 1000;
  const todayMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    const target = new Date(dateStr);
    const today = todayMidnight();
    const diffDays = Math.round((target - today) / dayMs);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getDueMeta = (dateStr) => {
    if (!dateStr) return { label: '', cls: 'text-slate-500' };
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target - todayMidnight()) / dayMs);
    if (diff === 0) return { label: 'Today', cls: 'text-emerald-600' };
    if (diff === 1) return { label: 'In 1 day', cls: 'text-emerald-600' };
    if (diff > 1) return { label: `In ${diff} days`, cls: 'text-slate-500' };
    const days = Math.abs(diff);
    return { label: `${days} day${days > 1 ? 's' : ''} past due`, cls: 'text-rose-600' };
  };

  const titleCase = (value = '') => {
    if (!value) return '';
    return value
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const getTypeTheme = (type) => {
    const raw = (type || '').trim();
    const normalized = raw.toLowerCase();
    if (normalized.includes('consult') || normalized.includes('strategy')) {
      return {
        label: 'Consult',
        badge: 'bg-violet-100 text-violet-700 border border-violet-200',
        dot: '#7c3aed'
      };
    }
    if (normalized.includes('follow') || normalized.includes('touch') || normalized.includes('check')) {
      return {
        label: 'Follow-up',
        badge: 'bg-amber-100 text-amber-700 border border-amber-200',
        dot: '#d97706'
      };
    }
    if (normalized.includes('dispute') || normalized.includes('letter') || normalized.includes('metro')) {
      return {
        label: 'Dispute Work',
        badge: 'bg-rose-100 text-rose-700 border border-rose-200',
        dot: '#f43f5e'
      };
    }
    if (normalized.includes('bill') || normalized.includes('pay') || normalized.includes('invoice')) {
      return {
        label: 'Billing',
        badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        dot: '#10b981'
      };
    }
    return {
      label: raw ? titleCase(raw) : 'General',
      badge: 'bg-slate-100 text-slate-700 border border-slate-200',
      dot: '#64748b'
    };
  };

  const updateSelectedCell = (dateStr) => {
    document.querySelectorAll('.calendar-cell').forEach((cell) => {
      cell.classList.toggle('is-selected', cell.dataset.date === dateStr);
    });
  };

  const disableScheduling = (message) => {
    calendarError = message;
    calendarNotice = '';
    saveBtn.disabled = true;
    deleteBtn.disabled = true;
    if (newBtn) newBtn.disabled = true;
  };

  const enableScheduling = (notice = '') => {
    calendarError = '';
    calendarNotice = notice;
    saveBtn.disabled = false;
    deleteBtn.disabled = false;
    if (newBtn) newBtn.disabled = false;
  };

  // disable actions until events load
  disableScheduling('Loading calendar...');

  async function loadEvents() {
    try {
      const resp = await fetch('/api/calendar/events');
      const data = await resp.json();
      if (!resp.ok) {
        disableScheduling(data.error || 'Calendar sync unavailable. Connect Google Calendar in Settings to unlock scheduling.');
        events = [];
        return false;
      }
      events = (data.events || []).map((ev) => ({
        id: ev.id,
        date: (ev.start?.date || ev.start?.dateTime || '').split('T')[0],
        text: ev.summary || '',
        type: ev.description || ''
      }));
      const mode = data.mode || 'google';
      const notice = data.notice || (mode === 'local'
        ? 'Calendar is operating in local-only mode until you add your Google credentials.'
        : '');
      enableScheduling(notice);
      return true;
    } catch (e) {
      console.error('Failed to load events', e);
      events = [];
      disableScheduling('Calendar sync unavailable. Connect Google Calendar in Settings to unlock scheduling.');
      return false;
    }
  }

  async function addEvent(dateStr, type, text) {
    try {
      const resp = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: text,
          description: type,
          start: { date: dateStr },
          end: { date: dateStr }
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Failed to create event');
        return;
      }
      await loadEvents();
      render();
    } catch (e) {
      console.error('Failed to create event', e);
      alert('Failed to create event');
    }
  }

  async function updateEvent(id, dateStr, type, text) {
    try {
      const resp = await fetch(`/api/calendar/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: text,
          description: type,
          start: { date: dateStr },
          end: { date: dateStr }
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Failed to update event');
        return;
      }
      await loadEvents();
      render();
    } catch (e) {
      console.error('Failed to update event', e);
      alert('Failed to update event');
    }
  }

  async function deleteEventById(id) {
    try {
      const resp = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Failed to delete event');
        return;
      }
      await loadEvents();
      render();
    } catch (e) {
      console.error('Failed to delete event', e);
      alert('Failed to delete event');
    }
  }

  async function checkAvailability(dateStr) {
    try {
      const timeMin = `${dateStr}T00:00:00Z`;
      const timeMax = `${dateStr}T23:59:59Z`;
      const resp = await fetch('/api/calendar/freebusy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin, timeMax })
      });
      const data = await resp.json();
      const calId = Object.keys(data.fb?.calendars || {})[0];
      return calId ? data.fb.calendars[calId].busy : [];
    } catch (e) {
      console.error('Failed to check availability', e);
      return [];
    }
  }

  function renderList() {
    if (!listEl) return;
    const upcoming = events
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    listEl.innerHTML = '';
    if (calendarError) {
      const warn = document.createElement('div');
      warn.className = 'rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-700';
      warn.textContent = calendarError;
      listEl.appendChild(warn);
    } else if (calendarNotice) {
      const info = document.createElement('div');
      info.className = 'rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-700';
      info.textContent = calendarNotice;
      listEl.appendChild(info);
    }

    if (!upcoming.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state text-sm';
      empty.textContent = 'No touchpoints scheduled yet. Drop a consult or follow-up to keep momentum.';
      listEl.appendChild(empty);
      return;
    }

    upcoming.forEach((ev) => {
      const theme = getTypeTheme(ev.type);
      const { label, cls } = getDueMeta(ev.date);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'w-full text-left rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)]';

      const layout = document.createElement('div');
      layout.className = 'flex items-start justify-between gap-4';

      const details = document.createElement('div');
      details.className = 'space-y-1';

      const title = document.createElement('p');
      title.className = 'text-sm font-semibold text-slate-800';
      title.textContent = ev.text || 'Untitled event';

      const meta = document.createElement('div');
      meta.className = 'flex flex-wrap items-center gap-2 text-xs text-slate-500';

      const badge = document.createElement('span');
      badge.className = `inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${theme.badge}`;
      badge.textContent = theme.label;

      const date = document.createElement('span');
      date.textContent = formatDateLabel(ev.date);

      meta.append(badge, date);
      details.append(title, meta);

      const due = document.createElement('span');
      due.className = `text-xs font-semibold ${cls}`;
      due.textContent = label;

      layout.append(details, due);
      card.appendChild(layout);

      card.addEventListener('click', () => openModal(ev.date, ev));
      listEl.appendChild(card);
    });
  }

  function renderSummary() {
    if (!summaryEl) return;
    const now = todayMidnight();
    if (calendarError) {
      summaryEl.innerHTML = `
        <div class="summary-tile">
          <span class="text-xs font-semibold uppercase tracking-wide text-amber-600">Calendar Sync Needed</span>
          <strong class="text-slate-900">--</strong>
          <span class="text-xs text-slate-500">Connect Google Calendar in Settings to unlock live metrics.</span>
        </div>
      `;
      return;
    }
    let summaryContent = '';
    if (calendarNotice) {
      summaryContent += `
        <div class="summary-tile">
          <span class="text-xs font-semibold uppercase tracking-wide text-sky-600">Local Calendar Active</span>
          <strong class="text-slate-900">CRM</strong>
          <span class="text-xs text-slate-500">${calendarNotice}</span>
        </div>
      `;
    }
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthEvents = events.filter((ev) => ev.date.startsWith(monthKey));
    const upcoming14 = events.filter((ev) => {
      const target = new Date(ev.date);
      target.setHours(0, 0, 0, 0);
      const diff = (target - now) / dayMs;
      return diff >= 0 && diff <= 14;
    });
    const countsByType = events.reduce((acc, ev) => {
      const theme = getTypeTheme(ev.type);
      acc[theme.label] = (acc[theme.label] || 0) + 1;
      return acc;
    }, {});

    const metrics = [
      {
        label: 'This Month',
        value: monthEvents.length,
        helper: 'Bookings aligned to revenue sprint'
      },
      {
        label: 'Next 14 Days',
        value: upcoming14.length,
        helper: 'Protect cadence & follow-through'
      },
      {
        label: 'Consults',
        value: countsByType['Consult'] || 0,
        helper: 'Strategy calls on deck'
      },
      {
        label: 'Follow-ups',
        value: countsByType['Follow-up'] || 0,
        helper: 'Warm leads to nurture'
      }
    ];

    const metricTiles = metrics
      .map(
        (metric) => `
        <div class="summary-tile">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">${metric.label}</span>
          <strong class="text-slate-900">${metric.value}</strong>
          <span class="text-xs text-slate-500">${metric.helper}</span>
        </div>
      `
      )
      .join('');
    summaryContent += metricTiles;
    summaryEl.innerHTML = summaryContent;
  }

  function renderFocus(dateStr) {
    if (!focusEl) return;
    if (calendarError) {
      focusEl.innerHTML = '<div class="empty-state text-sm">Calendar sync is paused. Add your Google Calendar in Settings to see daily tasks.</div>';
      if (focusTitle) {
        focusTitle.textContent = '';
      }
      return;
    }
    const todays = events
      .filter((ev) => ev.date === dateStr)
      .sort((a, b) => a.text.localeCompare(b.text));

    const focusDate = dateStr ? new Date(dateStr) : new Date();
    if (focusTitle) {
      focusTitle.textContent = focusDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }

    if (!todays.length) {
      focusEl.innerHTML = '<div class="empty-state text-sm">No commitments for this day. Slot a consult or dispute update to stay top-of-mind.</div>';
      return;
    }

    focusEl.innerHTML = '';
    todays.forEach((ev) => {
      const theme = getTypeTheme(ev.type);
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <span class="timeline-bullet" style="background:${theme.dot};"></span>
        <div class="flex-1 space-y-1">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-800">${ev.text || 'Untitled event'}</p>
            <span class="text-xs text-slate-500">All day</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${theme.badge}">${theme.label}</span>
            <span>${formatDateLabel(ev.date)}</span>
          </div>
        </div>
        <button class="text-xs font-semibold text-[color:var(--accent)] hover:underline">Open</button>
      `;
      item.querySelector('button').addEventListener('click', () => openModal(ev.date, ev));
      focusEl.appendChild(item);
    });
  }

  function render() {
    if (!calEl || !titleEl) return;
    calEl.innerHTML = '';
    const year = current.getFullYear();
    const month = current.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const days = new Date(year, month + 1, 0).getDate();
    titleEl.textContent = first.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthEvents = events.filter((ev) => ev.date.startsWith(monthKey));
    if (subtitleEl) {
      const count = monthEvents.length;
      subtitleEl.textContent = `${count} event${count === 1 ? '' : 's'} scheduled this month`;
    }
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < startDay; i++) {
      const placeholder = document.createElement('div');
      placeholder.setAttribute('aria-hidden', 'true');
      calEl.appendChild(placeholder);
    }
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = dateStr;
      if (dateStr === todayStr) {
        cell.classList.add('is-today');
      }
      const header = document.createElement('div');
      header.className = 'flex items-start justify-between gap-2';
      const dayNum = document.createElement('span');
      dayNum.className = 'text-sm font-semibold text-slate-900';
      dayNum.textContent = d;
      header.appendChild(dayNum);
      const todays = events.filter((e) => e.date === dateStr);
      if (todays.length) {
        const badge = document.createElement('span');
        badge.className = 'text-[10px] font-semibold uppercase tracking-wide text-slate-500';
        badge.textContent = `${todays.length} ${todays.length === 1 ? 'touchpoint' : 'touchpoints'}`;
        header.appendChild(badge);
      }
      cell.appendChild(header);

      const list = document.createElement('div');
      list.className = 'flex flex-col gap-1';
      todays.slice(0, 3).forEach((ev) => {
        const theme = getTypeTheme(ev.type);
        const item = document.createElement('div');
        item.className = 'event-chip';
        const pill = document.createElement('span');
        pill.className = `event-pill ${theme.badge}`;
        pill.textContent = theme.label;
        const text = document.createElement('p');
        text.className = 'event-text overflow-hidden text-ellipsis';
        text.textContent = ev.text || 'Untitled event';
        item.appendChild(pill);
        item.appendChild(text);
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(dateStr, ev);
        });
        list.appendChild(item);
      });
      if (todays.length > 3) {
        const more = document.createElement('span');
        more.className = 'text-[10px] uppercase tracking-wide text-slate-400';
        more.textContent = `+${todays.length - 3} more`;
        list.appendChild(more);
      }
      cell.appendChild(list);
      cell.addEventListener('click', () => openModal(dateStr));
      calEl.appendChild(cell);
    }
    updateSelectedCell(selectedDate);
    renderList();
    renderSummary();
    renderFocus(selectedDate);
  }

  function openModal(dateStr, ev = null) {
    editingId = ev?.id || null;
    selectedDate = dateStr;
    updateSelectedCell(dateStr);
    renderFocus(dateStr);
    dateInput.value = dateStr;
    typeInput.value = ev?.type || '';
    textInput.value = ev?.text || '';
    deleteBtn.classList.toggle('hidden', !editingId);
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    editingId = null;
  }

  saveBtn.addEventListener('click', async () => {
    const dateStr = dateInput.value;
    const type = typeInput.value.trim();
    const text = textInput.value.trim();
    if (!dateStr || !text) return;
    if (editingId) {
      await updateEvent(editingId, dateStr, type, text);
    } else {
      await addEvent(dateStr, type, text);
    }
    closeModal();
    render();
  });

  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Delete this event?')) return;
    await deleteEventById(editingId);
    closeModal();
  });

  cancelBtn.addEventListener('click', closeModal);

  if (newBtn) {
    newBtn.addEventListener('click', () => {
      if (newBtn.disabled) return;
      const today = new Date().toISOString().split('T')[0];
      openModal(today);
    });
  }

  prevBtn.addEventListener('click', () => {
    current.setMonth(current.getMonth() - 1);
    render();
  });
  nextBtn.addEventListener('click', () => {
    current.setMonth(current.getMonth() + 1);
    render();
  });

  (async function init() {
    await loadEvents();
    render();
  })();
});

