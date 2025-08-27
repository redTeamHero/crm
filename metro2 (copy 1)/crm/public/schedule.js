/* public/schedule.js */
document.addEventListener('DOMContentLoaded', () => {
  const calEl = document.getElementById('calendar');
  const titleEl = document.getElementById('calTitle');
  const listEl = document.getElementById('appointmentList');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');
  const googleBtn = document.getElementById('googleBtn');
  const events = JSON.parse(localStorage.getItem('appointments') || '[]');
  const save = () => localStorage.setItem('appointments', JSON.stringify(events));
  let current = new Date();

  const CLIENT_ID = window.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
  const API_KEY = window.GOOGLE_API_KEY || 'YOUR_GOOGLE_API_KEY';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
  let gReady = false;

  function initGoogle() {
    if (!googleBtn || !window.gapi) return setTimeout(initGoogle, 100);
    gapi.load('client:auth2', async () => {
      await gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        scope: SCOPES,
      });
      gReady = true;
      googleBtn.addEventListener('click', handleAuthClick);
      const auth = gapi.auth2.getAuthInstance();
      auth.isSignedIn.listen(updateSigninStatus);
      updateSigninStatus(auth.isSignedIn.get());
    });
  }
  initGoogle();

  function handleAuthClick() {
    const auth = gapi.auth2.getAuthInstance();
    if (auth.isSignedIn.get()) auth.signOut();
    else auth.signIn();
  }

  function updateSigninStatus(isSignedIn) {
    if (!googleBtn) return;
    googleBtn.textContent = isSignedIn ? 'Sign out Google' : 'Connect Google';
    if (isSignedIn) loadGoogleEvents();
  }

  async function loadGoogleEvents() {
    if (!gReady) return;
    const timeMin = new Date(current.getFullYear(), current.getMonth(), 1).toISOString();
    const timeMax = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const resp = await gapi.client.calendar.events.list({
      calendarId: 'primary', timeMin, timeMax,
      showDeleted: false, singleEvents: true, orderBy: 'startTime'
    });
    resp.result.items.forEach(item => {
      const start = item.start.date || item.start.dateTime;
      const dateStr = start.split('T')[0];
      if (!events.some(e => e.date === dateStr && e.text === item.summary)) {
        events.push({ date: dateStr, text: item.summary });
      }
    });
    save();
    render();
  }

  async function addGoogleEvent(dateStr, text) {
    if (!gReady) return;
    const auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) return;
    await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: text,
        start: { date: dateStr },
        end: { date: dateStr }
      }
    });
  }

  function changeMonth(delta) {
    current.setMonth(current.getMonth() + delta);
    render();
    if (gReady && gapi.auth2.getAuthInstance().isSignedIn.get()) loadGoogleEvents();
  }

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
      cell.addEventListener('click', async () => {
        const text = prompt(`Appointment details for ${dateStr}:`);
        if (text) {
          events.push({ date: dateStr, text });
          save();
          await addGoogleEvent(dateStr, text);
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

  prevBtn.addEventListener('click', () => changeMonth(-1));
  nextBtn.addEventListener('click', () => changeMonth(1));

  render();
});
