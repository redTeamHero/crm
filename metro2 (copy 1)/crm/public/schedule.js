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
        text: ev.summary || ''
      }));
    } catch (e) {
      console.error('Failed to load events', e);
      events = [];
    }
  }

  async function addEvent(dateStr, text) {
    try {
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: text,
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

  function renderList() {
    if (!listEl) return;
    const upcoming = events.slice().sort((a, b) => a.date.localeCompare(b.date));
    listEl.innerHTML = '<h2 class="text-xl font-bold mb-2">Upcoming</h2>' +
      upcoming.map(e => `<div class="mb-1">${e.date}: ${e.text}</div>`).join('');
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
      list.innerHTML = todays.map(e => `<div>- ${e.text}</div>`).join('');
      cell.appendChild(list);
      cell.addEventListener('click', async () => {
        const text = prompt(`Appointment details for ${dateStr}:`);
        if (text) await addEvent(dateStr, text);
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

