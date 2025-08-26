/* public/schedule.js */
document.addEventListener('DOMContentLoaded', () => {
  const calEl = document.getElementById('calendar');
  const titleEl = document.getElementById('calTitle');
  const listEl = document.getElementById('appointmentList');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const events = JSON.parse(localStorage.getItem('appointments') || '[]');
  const save = () => localStorage.setItem('appointments', JSON.stringify(events));
  let current = new Date();

  function render() {
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
      cell.addEventListener('click', () => {
        const text = prompt(`Appointment details for ${dateStr}:`);
        if (text) {
          events.push({ date: dateStr, text });
          save();
          render();
        }
      });
      calEl.appendChild(cell);
    }
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    const upcoming = events.slice().sort((a, b) => a.date.localeCompare(b.date));
    listEl.innerHTML = '<h2 class="text-xl font-bold mb-2">Upcoming</h2>' +
      upcoming.map(e => `<div class="mb-1">${e.date}: ${e.text}</div>`).join('');
  }

  prevBtn.addEventListener('click', () => { current.setMonth(current.getMonth() - 1); render(); });
  nextBtn.addEventListener('click', () => { current.setMonth(current.getMonth() + 1); render(); });

  render();
});
