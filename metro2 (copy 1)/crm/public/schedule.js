/* public/schedule.js */
document.addEventListener('DOMContentLoaded', () => {
  const calEl = document.getElementById('calendar');
  const titleEl = document.getElementById('calTitle');
  const listEl = document.getElementById('appointmentList');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');

  let current = new Date();
  let events = [];

  async function loadEvents() {
    try {
      const resp = await fetch('/api/calendar/events');
      const data = await resp.json();
      events = (data.events || []).map(ev => ({
        id: ev.id,
        date: (ev.start?.date || ev.start?.dateTime || '').split('T')[0],
        text: ev.summary || '',
        type: ev.description || ''
      }));
    } catch (e) {
      console.error('Failed to load events', e);
      events = [];
    }
  }

  async function addEvent(dateStr, type, text) {
    try {
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: text,
          description: type,
          start: { date: dateStr },
          end: { date: dateStr }
        })
      });
      await loadEvents();
      render();
    } catch (e) {
      console.error('Failed to create event', e);
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
    const upcoming = events.slice().sort((a, b) => a.date.localeCompare(b.date));
    listEl.innerHTML = '<h2 class="text-xl font-bold mb-2">Upcoming</h2>' +
      upcoming.map(e => `<div class="mb-1">${e.date}: [${e.type||'event'}] ${e.text}</div>`).join('');
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

    for (let i = 0; i < startDay; i++) {
      calEl.appendChild(document.createElement('div'));
    }
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'border p-1 h-24 text-sm cursor-pointer';
      cell.innerHTML = `<div class="font-medium">${d}</div>`;
      const todays = events.filter(e => e.date === dateStr);
      const list = document.createElement('div');
      list.className = 'text-xs overflow-y-auto max-h-16';
      list.innerHTML = todays.map(e => `<div>- [${e.type||'event'}] ${e.text}</div>`).join('');
      cell.appendChild(list);
      cell.addEventListener('click', async () => {
        const busy = await checkAvailability(dateStr);
        const busyInfo = busy.length ? `\nCurrently busy:\n${busy.map(b => `${b.start.slice(11,16)}-${b.end.slice(11,16)}`).join('\n')}` : '';
        const type = prompt(`Type for ${dateStr} (booking/meeting/phone/availability):${busyInfo}`);
        if (!type) return;
        const text = prompt(`Details for ${type} on ${dateStr}:`);
        if (text) await addEvent(dateStr, type, text);
      });
      calEl.appendChild(cell);
    }
    renderList();
  }

  prevBtn.addEventListener('click', () => { current.setMonth(current.getMonth() - 1); render(); });
  nextBtn.addEventListener('click', () => { current.setMonth(current.getMonth() + 1); render(); });

  (async function init() {
    await loadEvents();
    render();
  })();
});

