/* public/schedule.js */
document.addEventListener('DOMContentLoaded', () => {
  const calEl = document.getElementById('calendar');
  const titleEl = document.getElementById('calTitle');
  const listEl = document.getElementById('appointmentList');
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

  async function updateEvent(id, dateStr, type, text) {
    try {
      await fetch(`/api/calendar/events/${id}`, {
        method: 'PUT',
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
      console.error('Failed to update event', e);
    }
  }

  async function deleteEventById(id) {
    try {
      await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
      await loadEvents();
      render();
    } catch (e) {
      console.error('Failed to delete event', e);
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
    listEl.innerHTML = '<h2 class="text-xl font-bold mb-2">Upcoming</h2>';
    const upcoming = events.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const ev of upcoming) {
      const div = document.createElement('div');
      div.className = 'mb-1 cursor-pointer';
      div.textContent = `${ev.date}: [${ev.type || 'event'}] ${ev.text}`;
      div.addEventListener('click', () => openModal(ev.date, ev));
      listEl.appendChild(div);
    }
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
      for (const ev of todays) {
        const item = document.createElement('div');
        item.className = 'cursor-pointer';
        item.textContent = `- [${ev.type || 'event'}] ${ev.text}`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(dateStr, ev);
        });
        list.appendChild(item);
      }
      cell.appendChild(list);
      cell.addEventListener('click', () => openModal(dateStr));
      calEl.appendChild(cell);
    }
    renderList();
  }

  function openModal(dateStr, ev = null) {
    editingId = ev?.id || null;
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

  newBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    openModal(today);
  });

  prevBtn.addEventListener('click', () => { current.setMonth(current.getMonth() - 1); render(); });
  nextBtn.addEventListener('click', () => { current.setMonth(current.getMonth() + 1); render(); });

  (async function init() {
    await loadEvents();
    render();
  })();
});

