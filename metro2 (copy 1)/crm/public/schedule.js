import { setupPageTour } from './tour-guide.js';

setupPageTour('schedule', {
  steps: [
    {
      id: 'schedule-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Jump between fulfillment, marketing, and billing.</p>
             <p class="mt-1 text-xs text-slate-600">Keep the schedule aligned with KPIs across the rest of the platform.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'schedule-hero',
      title: 'Set the tone',
      text: `<p class="font-semibold">Use the hero to frame pipeline ops.</p>
             <p class="mt-1 text-xs text-slate-600">Remind the team this calendar backs premium consults.</p>`,
      attachTo: { element: '#scheduleHero', on: 'top' }
    },
    {
      id: 'schedule-summary',
      title: 'Daily summary',
      text: `<p class="font-semibold">Track slots, consults, and commitments here.</p>
             <p class="mt-1 text-xs text-slate-600">Update the summary before morning stand-up.</p>`,
      attachTo: { element: '#calendarSummary', on: 'left' }
    },
    {
      id: 'schedule-calendar',
      title: 'Calendar grid',
      text: `<p class="font-semibold">Drag and click to manage every touchpoint.</p>
             <p class="mt-1 text-xs text-slate-600">Keep consults, dispute work, and billing nudges on one timeline.</p>`,
      attachTo: { element: '#scheduleCalendar', on: 'top' }
    },
    {
      id: 'schedule-new-event',
      title: 'Book new events',
      text: `<p class="font-semibold">Use quick slots to reserve premium time.</p>
             <p class="mt-1 text-xs text-slate-600">Capture consult type, details, and reminders without leaving the CRM.</p>`,
      attachTo: { element: '#newEvent', on: 'left' }
    }
  ]
});

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
  const startTimeInput = document.getElementById('eventStartTime');
  const endTimeInput = document.getElementById('eventEndTime');
  const slotContainer = document.getElementById('slotSuggestions');
  const slotAvailability = document.getElementById('slotAvailability');
  const customSlotLabelInput = document.getElementById('customSlotLabel');
  const saveCustomSlotBtn = document.getElementById('saveCustomSlot');
  const customSlotNotice = document.getElementById('customSlotNotice');
  const slotPresetToggle = document.getElementById('toggleSlotPresetEditor');
  const slotPresetEditor = document.getElementById('slotPresetEditor');
  const slotPresetList = document.getElementById('slotPresetList');
  const slotPresetSaveBtn = document.getElementById('saveSlotPresets');
  const slotPresetAddBtn = document.getElementById('addSlotPreset');
  const slotPresetResetBtn = document.getElementById('resetSlotPresets');
  const slotPresetNotice = document.getElementById('slotPresetNotice');
  const typeInput = document.getElementById('eventType');
  const textInput = document.getElementById('eventText');
  const saveBtn = document.getElementById('saveEvent');
  const deleteBtn = document.getElementById('deleteEvent');
  const cancelBtn = document.getElementById('cancelEvent');
  const newBtn = document.getElementById('newEvent');
  const modalModeLabel = document.getElementById('eventModalMode');
  const modalActiveDate = document.getElementById('eventModalActiveDate');
  const modalTypeBadge = document.getElementById('eventModalTypeBadge');
  const modalModeDefault = modalModeLabel ? modalModeLabel.textContent : '';
  const modalActiveDateDefault = modalActiveDate ? modalActiveDate.textContent : '';

  const updateModalTypeBadge = (value) => {
    if (!modalTypeBadge) return;
    const trimmed = (value || '').trim();
    if (trimmed) {
      modalTypeBadge.textContent = trimmed;
      modalTypeBadge.classList.remove('hidden');
    } else {
      modalTypeBadge.classList.add('hidden');
    }
  };

  if (typeInput) {
    typeInput.addEventListener('input', (event) => updateModalTypeBadge(event.target.value));
  }

  let current = new Date();
  let events = [];
  let editingId = null;
  let selectedDate = new Date().toISOString().split('T')[0];
  let calendarError = '';
  let calendarNotice = '';
  let slotButtonRefs = [];
  let customSlots = [];
  let slotPresets = [];
  let slotPresetDrafts = [];
  let customSlotNoticeTimeout = null;
  let slotPresetNoticeTimeout = null;

  const customSlotStorageKey = 'schedule.customSlots';
  const slotPresetStorageKey = 'schedule.slotPresets';
  const localStorageAvailable = (() => {
    try {
      const probe = '__schedule_custom_slot__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();
  let defaultCustomSlotNotice = customSlotNotice ? customSlotNotice.textContent || '' : '';
  let defaultSlotPresetNotice = slotPresetNotice ? slotPresetNotice.textContent || '' : '';

  if (!localStorageAvailable && customSlotNotice) {
    const fallback = 'Custom slots stay active for this session only. / Los horarios personalizados solo viven en esta sesión.';
    customSlotNotice.textContent = fallback;
    defaultCustomSlotNotice = fallback;
  }

  if (!localStorageAvailable && slotPresetNotice) {
    const fallback = 'Quick slots reset after this session. Type keywords still control colors. / Los horarios rápidos se reinician después de esta sesión. Las palabras clave del tipo siguen controlando los colores.';
    slotPresetNotice.textContent = fallback;
    defaultSlotPresetNotice = fallback;
  }

  const setCustomSlotNotice = (message, revert = true) => {
    if (!customSlotNotice) return;
    if (customSlotNoticeTimeout) {
      clearTimeout(customSlotNoticeTimeout);
      customSlotNoticeTimeout = null;
    }
    customSlotNotice.textContent = message;
    if (revert) {
      customSlotNoticeTimeout = window.setTimeout(() => {
        customSlotNotice.textContent = defaultCustomSlotNotice;
        customSlotNoticeTimeout = null;
      }, 4000);
    }
  };

  const setSlotPresetNotice = (message, revert = true) => {
    if (!slotPresetNotice) return;
    if (slotPresetNoticeTimeout) {
      clearTimeout(slotPresetNoticeTimeout);
      slotPresetNoticeTimeout = null;
    }
    slotPresetNotice.textContent = message;
    if (revert) {
      slotPresetNoticeTimeout = window.setTimeout(() => {
        slotPresetNotice.textContent = defaultSlotPresetNotice;
        slotPresetNoticeTimeout = null;
      }, 4000);
    }
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const defaultDurationMinutes = 45;

  const defaultSlotPresets = [
    { id: 'preset-0', start: '09:00', duration: 60, title: 'Strategy Consult', type: 'Consult' },
    { id: 'preset-1', start: '11:30', duration: 30, title: 'Follow-up Touchpoint', type: 'Follow-up' },
    { id: 'preset-2', start: '14:00', duration: 45, title: 'Dispute Update', type: 'Dispute Work' },
    { id: 'preset-3', start: '16:30', duration: 30, title: 'Billing Review', type: 'Billing' }
  ];

  const cloneDefaultSlotPresets = () =>
    defaultSlotPresets.map((slot, index) => ({
      id: slot.id || `preset-${index}`,
      start: slot.start,
      duration: Number.isFinite(slot.duration) && slot.duration > 0 ? slot.duration : defaultDurationMinutes,
      title: slot.title || '',
      type: slot.type || ''
    }));

  const loadStoredCustomSlots = () => {
    if (!localStorageAvailable) {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(customSlotStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((slot) => {
          if (!slot || typeof slot !== 'object') return null;
          const start = typeof slot.start === 'string' ? slot.start : '';
          if (!/^\d{2}:\d{2}$/.test(start)) return null;
          const duration = Number.parseInt(slot.duration, 10);
          const title = typeof slot.title === 'string' ? slot.title : '';
          const type = typeof slot.type === 'string' ? slot.type : '';
          const id = typeof slot.id === 'string' && slot.id
            ? slot.id
            : `custom-${start}-${Math.max(15, Number.isFinite(duration) ? duration : defaultDurationMinutes)}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
          return {
            id,
            start,
            duration: Number.isFinite(duration) && duration > 0 ? duration : defaultDurationMinutes,
            title,
            type
          };
        })
        .filter(Boolean);
    } catch (e) {
      console.warn('Failed to parse custom slots', e);
      return [];
    }
  };

  const loadStoredSlotPresets = () => {
    if (!localStorageAvailable) {
      return cloneDefaultSlotPresets();
    }
    try {
      const raw = window.localStorage.getItem(slotPresetStorageKey);
      if (!raw) return cloneDefaultSlotPresets();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return cloneDefaultSlotPresets();
      const normalized = parsed
        .map((slot) => {
          if (!slot || typeof slot !== 'object') return null;
          const start = typeof slot.start === 'string' ? slot.start : '';
          if (!/^\d{2}:\d{2}$/.test(start)) return null;
          const duration = Number.parseInt(slot.duration, 10);
          const title = typeof slot.title === 'string' ? slot.title : '';
          const type = typeof slot.type === 'string' ? slot.type : '';
          const id = typeof slot.id === 'string' && slot.id
            ? slot.id
            : `preset-${start}-${Math.max(15, Number.isFinite(duration) ? duration : defaultDurationMinutes)}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
          return {
            id,
            start,
            duration: Number.isFinite(duration) && duration > 0 ? duration : defaultDurationMinutes,
            title,
            type
          };
        })
        .filter(Boolean);
      if (!normalized.length) {
        return cloneDefaultSlotPresets();
      }
      return normalized;
    } catch (e) {
      console.warn('Failed to parse slot presets', e);
      return cloneDefaultSlotPresets();
    }
  };

  const persistCustomSlotsState = () => {
    if (!localStorageAvailable) return;
    try {
      const payload = customSlots.map(({ id, start, duration, title, type }) => ({ id, start, duration, title, type }));
      window.localStorage.setItem(customSlotStorageKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to persist custom slots', e);
      setCustomSlotNotice('We could not save this slot to storage. / No pudimos guardar este horario.', false);
    }
  };

  const persistSlotPresetsState = () => {
    if (!localStorageAvailable) return;
    try {
      const payload = slotPresets.map(({ id, start, duration, title, type }) => ({ id, start, duration, title, type }));
      window.localStorage.setItem(slotPresetStorageKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to persist slot presets', e);
      setSlotPresetNotice('We could not save these quick slots to storage. / No pudimos guardar estos horarios rápidos.', false);
    }
  };

  const removeCustomSlotById = (slotId) => {
    const next = customSlots.filter((slot) => slot.id !== slotId);
    if (next.length === customSlots.length) {
      return false;
    }
    customSlots = next;
    persistCustomSlotsState();
    return true;
  };

  const resetSlotPresetsToDefault = () => {
    slotPresets = cloneDefaultSlotPresets();
    if (!localStorageAvailable) return;
    try {
      window.localStorage.removeItem(slotPresetStorageKey);
    } catch (e) {
      console.warn('Failed to reset slot presets', e);
    }
  };

  slotPresets = loadStoredSlotPresets();
  slotPresetDrafts = slotPresets.map((slot) => ({ ...slot }));
  customSlots = loadStoredCustomSlots();

  const ensureSlotPresetDrafts = () => {
    slotPresetDrafts = slotPresets.map((slot) => ({ ...slot }));
  };

  const updateSlotPresetDraft = (index, field, value) => {
    if (!slotPresetDrafts[index]) return;
    const next = { ...slotPresetDrafts[index] };
    if (field === 'duration') {
      const parsed = Number.parseInt(value, 10);
      next[field] = Number.isFinite(parsed) ? parsed : value;
    } else {
      next[field] = value;
    }
    slotPresetDrafts[index] = next;
  };

  const renderSlotPresetEditor = () => {
    if (!slotPresetList) return;
    slotPresetList.innerHTML = '';
    if (!slotPresetDrafts.length) {
      const empty = document.createElement('p');
      empty.className = 'rounded-2xl border border-dashed border-violet-200 bg-white/70 p-3 text-xs text-slate-500';
      empty.textContent = 'No quick slots yet. Add one to keep curated options ready. / Aún no hay horarios rápidos. Agrega uno para tener opciones curadas listas.';
      slotPresetList.appendChild(empty);
      return;
    }
    slotPresetDrafts.forEach((slot, index) => {
      const row = document.createElement('div');
      row.className = 'flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3';

      const makeField = (labelText, input) => {
        const wrapper = document.createElement('label');
        wrapper.className = 'flex flex-col text-xs font-semibold text-slate-500';
        const label = document.createElement('span');
        label.className = 'mb-1';
        label.textContent = labelText;
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        return wrapper;
      };

      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.step = '300';
      startInput.value = typeof slot.start === 'string' ? slot.start : '';
      startInput.className = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
      startInput.addEventListener('change', (event) => updateSlotPresetDraft(index, 'start', event.target.value));
      startInput.addEventListener('input', (event) => updateSlotPresetDraft(index, 'start', event.target.value));

      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.min = '5';
      durationInput.step = '5';
      const durationValue = Number.isFinite(slot.duration)
        ? slot.duration
        : (() => {
            const parsed = Number.parseInt(slot.duration, 10);
            return Number.isFinite(parsed) ? parsed : defaultDurationMinutes;
          })();
      durationInput.value = durationValue;
      durationInput.className = 'w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
      durationInput.addEventListener('input', (event) => updateSlotPresetDraft(index, 'duration', event.target.value));

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = typeof slot.title === 'string' ? slot.title : '';
      titleInput.placeholder = 'Strategy Consult';
      titleInput.className = 'flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
      titleInput.style.minWidth = '140px';
      titleInput.addEventListener('input', (event) => updateSlotPresetDraft(index, 'title', event.target.value));

      const typeInputEl = document.createElement('input');
      typeInputEl.type = 'text';
      typeInputEl.value = typeof slot.type === 'string' ? slot.type : '';
      typeInputEl.placeholder = 'Consult / Follow-up';
      typeInputEl.className = 'flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
      typeInputEl.style.minWidth = '140px';
      typeInputEl.addEventListener('input', (event) => updateSlotPresetDraft(index, 'type', event.target.value));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-destructive px-3 py-2 text-xs font-semibold';
      removeBtn.textContent = 'Remove / Quitar';
      removeBtn.addEventListener('click', () => {
        slotPresetDrafts.splice(index, 1);
        renderSlotPresetEditor();
      });

      row.append(
        makeField('Start / Inicio', startInput),
        makeField('Duration (min) / Duración (min)', durationInput),
        makeField('Label / Etiqueta', titleInput),
        makeField('Type / Tipo', typeInputEl),
        removeBtn
      );

      slotPresetList.appendChild(row);
    });
  };

  const updateSlotPresetToggleLabel = (expanded) => {
    if (!slotPresetToggle) return;
    slotPresetToggle.textContent = expanded
      ? 'Close quick slot editor / Cerrar editor'
      : 'Customize quick slots / Personaliza horarios rápidos';
    slotPresetToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const normalizeSlotPresetDrafts = () => {
    const normalized = [];
    for (let i = 0; i < slotPresetDrafts.length; i += 1) {
      const draft = slotPresetDrafts[i] || {};
      const start = typeof draft.start === 'string' ? draft.start.trim() : '';
      if (!/^\d{2}:\d{2}$/.test(start)) {
        return {
          error: 'Enter a valid start time for every quick slot. / Ingresa una hora de inicio válida para cada horario rápido.'
        };
      }
      let duration = Number.parseInt(draft.duration, 10);
      if (!Number.isFinite(duration) || duration <= 0) {
        return {
          error: 'Duration must be at least 5 minutes. / La duración debe ser de al menos 5 minutos.'
        };
      }
      duration = Math.max(5, Math.min(duration, 8 * 60));
      const title = typeof draft.title === 'string' ? draft.title.trim() : '';
      const type = typeof draft.type === 'string' ? draft.type.trim() : '';
      const id = typeof draft.id === 'string' && draft.id
        ? draft.id
        : `preset-${start}-${duration}-${Math.random().toString(36).slice(2, 7)}`;
      normalized.push({ id, start, duration, title, type });
    }
    if (!normalized.length) {
      return {
        error: 'Add at least one quick slot before saving. / Agrega al menos un horario rápido antes de guardar.'
      };
    }
    return { slots: normalized };
  };
  const todayMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const pad = (value) => String(value ?? '').padStart(2, '0');

  const toDatePart = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const toDateFromParts = (dateStr, timeStr = '00:00') => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const [hours, minutes] = (timeStr || '00:00').split(':').map((part) => Number.parseInt(part, 10));
    const result = new Date();
    result.setFullYear(year, month - 1, day);
    result.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    result.setMilliseconds(0);
    if (Number.isNaN(result.getTime())) return null;
    return result;
  };

  const parseEdge = (edge) => {
    if (!edge || typeof edge !== 'object') {
      return { date: '', time: '', iso: '', ts: null };
    }
    if (edge.dateTime) {
      const dt = new Date(edge.dateTime);
      if (Number.isNaN(dt.getTime())) {
        return { date: '', time: '', iso: edge.dateTime, ts: null };
      }
      return {
        date: toDatePart(dt),
        time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
        iso: edge.dateTime,
        ts: dt.getTime()
      };
    }
    if (edge.date) {
      const dt = toDateFromParts(edge.date, '00:00');
      return {
        date: edge.date,
        time: '',
        iso: `${edge.date}T00:00:00Z`,
        ts: dt ? dt.getTime() : null
      };
    }
    return { date: '', time: '', iso: '', ts: null };
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

  const formatTimeLabel = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeStr;
    const dt = new Date();
    dt.setHours(hours, minutes, 0, 0);
    return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateTimeLabel = (dateStr, timeStr) => {
    const dt = toDateFromParts(dateStr, timeStr || '00:00');
    if (!dt) return '';
    return dt.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatEventTimeRange = (ev) => {
    if (!ev) return '';
    if (ev.startTime) {
      const startLabel = formatTimeLabel(ev.startTime);
      if (ev.endTime) {
        if (ev.endDate && ev.endDate !== ev.date) {
          return `${startLabel} – ${formatDateTimeLabel(ev.endDate, ev.endTime)}`;
        }
        return `${startLabel} – ${formatTimeLabel(ev.endTime)}`;
      }
      return startLabel;
    }
    if (ev.endTime) {
      if (ev.endDate && ev.endDate !== ev.date) {
        return `Ends ${formatDateTimeLabel(ev.endDate, ev.endTime)}`;
      }
      return `Ends ${formatTimeLabel(ev.endTime)}`;
    }
    return 'All day';
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

  const compareEvents = (a, b) => {
    const aTs = Number.isFinite(a?.startTs) ? a.startTs : Number.MAX_SAFE_INTEGER;
    const bTs = Number.isFinite(b?.startTs) ? b.startTs : Number.MAX_SAFE_INTEGER;
    if (aTs !== bTs) return aTs - bTs;
    return (a?.text || '').localeCompare(b?.text || '');
  };

  const computeEndDate = (dateStr, startTime, endTime) => {
    const start = toDateFromParts(dateStr, startTime);
    if (!start) return null;
    if (!endTime) {
      return new Date(start.getTime() + defaultDurationMinutes * 60 * 1000);
    }
    const explicitEnd = toDateFromParts(dateStr, endTime);
    if (!explicitEnd) {
      return new Date(start.getTime() + defaultDurationMinutes * 60 * 1000);
    }
    if (explicitEnd <= start) {
      return new Date(explicitEnd.getTime() + 24 * 60 * 60 * 1000);
    }
    return explicitEnd;
  };

  const buildEventPayload = (dateStr, type, text, startTime, endTime) => {
    const timezone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch (e) {
        return 'UTC';
      }
    })();
    const base = {
      summary: text,
      description: type,
      start: { date: dateStr },
      end: { date: dateStr }
    };
    if (startTime) {
      const startDate = toDateFromParts(dateStr, startTime);
      if (startDate) {
        const endDate = computeEndDate(dateStr, startTime, endTime) || new Date(startDate.getTime() + defaultDurationMinutes * 60 * 1000);
        return {
          summary: text,
          description: type,
          start: { dateTime: startDate.toISOString(), timeZone: timezone },
          end: { dateTime: endDate.toISOString(), timeZone: timezone }
        };
      }
    }
    if (endTime) {
      const endDate = toDateFromParts(dateStr, endTime);
      if (endDate) {
        const startDate = new Date(endDate.getTime() - defaultDurationMinutes * 60 * 1000);
        return {
          summary: text,
          description: type,
          start: { dateTime: startDate.toISOString(), timeZone: timezone },
          end: { dateTime: endDate.toISOString(), timeZone: timezone }
        };
      }
    }
    return base;
  };

  const slotConflicts = (busySlots, dateStr, slot) => {
    const start = toDateFromParts(dateStr, slot.start);
    if (!start) return false;
    const minutes = Number.isFinite(slot.duration) ? slot.duration : defaultDurationMinutes;
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    return busySlots.some((busy) => start < busy.end && end > busy.start);
  };

  const applySlot = (slot) => {
    if (!startTimeInput) return;
    startTimeInput.value = slot.start;
    const dateStr = dateInput?.value || selectedDate;
    if (endTimeInput) {
      const startDate = toDateFromParts(dateStr, slot.start);
      if (startDate) {
        const minutes = Number.isFinite(slot.duration) ? slot.duration : defaultDurationMinutes;
        const endDate = new Date(startDate.getTime() + minutes * 60 * 1000);
        endTimeInput.value = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
      }
    }
    if (typeInput && slot.type && !typeInput.value) {
      typeInput.value = slot.type;
    }
    ensureEndTimeOrder();
    highlightSelectedSlot();
  };

  const highlightSelectedSlot = () => {
    if (!startTimeInput || !slotButtonRefs.length) return;
    const value = startTimeInput.value;
    slotButtonRefs.forEach(({ slot, button, busy }) => {
      button.classList.toggle('selected', !busy && slot.start === value);
    });
  };

  const ensureEndTimeOrder = () => {
    if (!startTimeInput || !endTimeInput) return;
    const dateStr = dateInput?.value || selectedDate;
    const startTime = startTimeInput.value;
    if (!dateStr || !startTime) return;
    const endDate = computeEndDate(dateStr, startTime, endTimeInput.value);
    if (!endDate) return;
    endTimeInput.value = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  };

  async function refreshSlotSuggestions(dateStr, { autopick = false } = {}) {
    if (!slotContainer || !slotAvailability) return;
    slotContainer.innerHTML = '';
    slotAvailability.textContent = '';
    slotButtonRefs = [];
    if (!dateStr) return;

    if (calendarError) {
      slotAvailability.textContent = calendarError;
      return;
    }

    let busySlots = [];
    try {
      const busy = await checkAvailability(dateStr);
      busySlots = Array.isArray(busy)
        ? busy
            .map((slot) => {
              const start = new Date(slot.start);
              const end = new Date(slot.end || slot.start);
              if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
              return { start, end };
            })
            .filter(Boolean)
        : [];
    } catch (e) {
      console.error('Failed to load availability', e);
      busySlots = [];
      slotAvailability.textContent = [calendarNotice, 'Availability check failed. You can still choose a time manually.']
        .filter(Boolean)
        .join(' ');
    }

    if (!slotAvailability.textContent) {
      const messageParts = [];
      if (calendarNotice) {
        messageParts.push(calendarNotice);
      }
      if (!busySlots.length) {
        const curatedCount = slotPresets.length;
        const curatedMessage =
          curatedCount > 0
            ? `All ${curatedCount} curated slot${curatedCount > 1 ? 's' : ''} are open — fine-tune them under "Curated Quick Slots." / Los ${curatedCount} horario${curatedCount > 1 ? 's' : ''} curado${curatedCount > 1 ? 's' : ''} están libres — ajústalos en "Curated Quick Slots".`
            : 'All curated slots are open — or dial in your own time below. / Todos los horarios curados están libres — o marca tu propia hora abajo.';
        messageParts.push(curatedMessage);
      } else {
        messageParts.push(`${busySlots.length} booking block${busySlots.length > 1 ? 's' : ''} already on the calendar.`);
      }
      if (customSlots.length) {
        const count = customSlots.length;
        messageParts.push(`${count} saved custom slot${count > 1 ? 's' : ''} ready to book / ${count} horario${count > 1 ? 's' : ''} personalizado${count > 1 ? 's' : ''} listo${count > 1 ? 's' : ''}.`);
      }
      slotAvailability.textContent = messageParts.join(' ');
    }

    const combinedSlots = [
      ...slotPresets.map((slot, index) => ({ ...slot, id: slot.id || `preset-${index}`, custom: false })),
      ...customSlots.map((slot) => ({ ...slot, custom: true }))
    ];

    combinedSlots.forEach((slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      const isBusy = slotConflicts(busySlots, dateStr, slot);
      button.className = `slot-button${isBusy ? ' busy' : ''}`;
      const metaPieces = [];
      if (slot.title) metaPieces.push(slot.title);
      else if (slot.type) metaPieces.push(slot.type);
      else metaPieces.push(`${slot.duration} min`);
      if (slot.custom && !slot.title) {
        metaPieces.push('Custom');
      }
      const metaLabel = metaPieces.join(' • ');
      const statusClass = isBusy ? 'slot-status-busy' : 'slot-status-open';
      const statusLabel = isBusy ? 'Booked / Reservado' : slot.custom ? 'Custom / Personalizado' : 'Open / Disponible';
      button.innerHTML = `
        <span class="slot-time">${formatTimeLabel(slot.start)}</span>
        <span class="slot-meta">${metaLabel}</span>
        <span class="slot-status ${statusClass}">${statusLabel}</span>
      `;
      if (!isBusy) {
        button.addEventListener('click', () => {
          applySlot(slot);
        });
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'slot-chip-wrapper';
      wrapper.appendChild(button);
      if (slot.custom) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'slot-remove-button';
        removeBtn.setAttribute('aria-label', 'Remove custom slot');
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (removeCustomSlotById(slot.id)) {
            refreshSlotSuggestions(dateStr);
            highlightSelectedSlot();
            setCustomSlotNotice('Custom slot removed. / Horario personalizado eliminado.');
          }
        });
        wrapper.appendChild(removeBtn);
      }
      slotContainer.appendChild(wrapper);
      slotButtonRefs.push({ slot, button, busy: isBusy });
    });

    if (autopick && startTimeInput && !startTimeInput.value) {
      const available = slotButtonRefs.find((entry) => !entry.busy);
      if (available) {
        applySlot(available.slot);
      }
    }
    highlightSelectedSlot();
  }

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
      events = (data.events || []).map((ev) => {
        const startEdge = parseEdge(ev.start);
        const endEdge = parseEdge(ev.end);
        const startDate = startEdge.date ? toDateFromParts(startEdge.date, startEdge.time || '00:00') : null;
        const endDate = endEdge.date ? toDateFromParts(endEdge.date, endEdge.time || '00:00') : null;
        return {
          id: ev.id,
          date: startEdge.date,
          endDate: endEdge.date,
          startTime: startEdge.time,
          endTime: endEdge.time,
          startIso: startEdge.iso,
          endIso: endEdge.iso,
          startTs: startDate ? startDate.getTime() : null,
          endTs: endDate ? endDate.getTime() : null,
          text: ev.summary || '',
          type: ev.description || ''
        };
      });
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

  async function addEvent(eventPayload) {
    try {
      const resp = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
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

  async function updateEvent(id, eventPayload) {
    try {
      const resp = await fetch(`/api/calendar/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
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
      let timeMin = `${dateStr}T00:00:00Z`;
      let timeMax = `${dateStr}T23:59:59Z`;
      const startOfDay = toDateFromParts(dateStr, '00:00');
      if (startOfDay) {
        const endOfDay = new Date(startOfDay.getTime() + dayMs);
        timeMin = startOfDay.toISOString();
        timeMax = endOfDay.toISOString();
      }
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
      .sort(compareEvents);

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

      const time = document.createElement('span');
      const rangeLabel = formatEventTimeRange(ev);
      if (rangeLabel) {
        time.textContent = rangeLabel;
      }

      meta.append(badge, date);
      if (rangeLabel) {
        meta.append(time);
      }
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
    const monthEvents = events.filter((ev) => (ev.date || '').startsWith(monthKey));
    const upcoming14 = events.filter((ev) => {
      if (!ev.date) return false;
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
      .sort(compareEvents);

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
      const whenLabel = formatEventTimeRange(ev);
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <span class="timeline-bullet" style="background:${theme.dot};"></span>
        <div class="flex-1 space-y-1">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-800">${ev.text || 'Untitled event'}</p>
            <span class="text-xs text-slate-500">${whenLabel || 'All day'}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${theme.badge}">${theme.label}</span>
            <span>${formatDateLabel(ev.date)}</span>
          </div>
        </div>
        <button class="text-xs font-semibold text-[color:var(--accent)] hover:underline">Edit slot</button>
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
    const monthEvents = events.filter((ev) => (ev.date || '').startsWith(monthKey));
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
      const todays = events.filter((e) => e.date === dateStr).sort(compareEvents);
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
        const content = document.createElement('div');
        content.className = 'flex flex-col overflow-hidden';
        const title = document.createElement('p');
        title.className = 'event-text overflow-hidden text-ellipsis';
        title.textContent = ev.text || 'Untitled event';
        content.appendChild(title);
        const rangeLabel = formatEventTimeRange(ev);
        if (rangeLabel) {
          const timeRow = document.createElement('span');
          timeRow.className = 'text-[10px] uppercase tracking-wide text-slate-400';
          timeRow.textContent = rangeLabel;
          content.appendChild(timeRow);
        }
        item.appendChild(pill);
        item.appendChild(content);
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
    updateModalTypeBadge(typeInput.value);
    textInput.value = ev?.text || '';
    if (startTimeInput) {
      startTimeInput.value = ev?.startTime || '';
    }
    if (endTimeInput) {
      endTimeInput.value = ev?.endTime || '';
    }
    deleteBtn.classList.toggle('hidden', !editingId);
    if (modalModeLabel) {
      modalModeLabel.textContent = editingId
        ? 'Update touchpoint / Actualiza el compromiso'
        : 'Book premium touchpoint / Agenda un contacto premium';
    }
    if (modalActiveDate) {
      modalActiveDate.textContent = formatDateLabel(dateStr);
    }
    modal.classList.remove('hidden');
    ensureEndTimeOrder();
    refreshSlotSuggestions(dateStr, { autopick: !editingId && !(ev?.startTime) });
    highlightSelectedSlot();
  }

  function closeModal() {
    modal.classList.add('hidden');
    editingId = null;
    if (modalModeLabel) {
      modalModeLabel.textContent = modalModeDefault;
    }
    if (modalActiveDate) {
      modalActiveDate.textContent = modalActiveDateDefault;
    }
    updateModalTypeBadge('');
    if (startTimeInput) startTimeInput.value = '';
    if (endTimeInput) endTimeInput.value = '';
    if (slotContainer) slotContainer.innerHTML = '';
    if (slotAvailability) slotAvailability.textContent = '';
    slotButtonRefs = [];
    if (slotPresetEditor) {
      slotPresetEditor.classList.add('hidden');
    }
    if (slotPresetToggle) {
      updateSlotPresetToggleLabel(false);
    }
    if (slotPresetNotice) {
      if (slotPresetNoticeTimeout) {
        clearTimeout(slotPresetNoticeTimeout);
        slotPresetNoticeTimeout = null;
      }
      slotPresetNotice.textContent = defaultSlotPresetNotice;
    }
  }

  saveBtn.addEventListener('click', async () => {
    const dateStr = dateInput.value;
    const type = typeInput.value.trim();
    const text = textInput.value.trim();
    const startTime = startTimeInput ? startTimeInput.value : '';
    const endTime = endTimeInput ? endTimeInput.value : '';
    if (!dateStr || !text) return;
    ensureEndTimeOrder();
    const payload = buildEventPayload(dateStr, type, text, startTime, endTime);
    if (editingId) {
      await updateEvent(editingId, payload);
    } else {
      await addEvent(payload);
    }
    closeModal();
  });

  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Delete this event?')) return;
    await deleteEventById(editingId);
    closeModal();
  });

  cancelBtn.addEventListener('click', closeModal);

  if (slotPresetToggle && slotPresetEditor) {
    updateSlotPresetToggleLabel(false);
    slotPresetToggle.addEventListener('click', () => {
      const isHidden = slotPresetEditor.classList.toggle('hidden');
      const expanded = !isHidden;
      updateSlotPresetToggleLabel(expanded);
      if (expanded) {
        ensureSlotPresetDrafts();
        renderSlotPresetEditor();
        if (slotPresetNotice) {
          slotPresetNotice.textContent = defaultSlotPresetNotice;
        }
      }
    });
  }

  if (slotPresetAddBtn) {
    slotPresetAddBtn.addEventListener('click', () => {
      const last = slotPresetDrafts[slotPresetDrafts.length - 1];
      const nextStart = (() => {
        if (!last || typeof last.start !== 'string' || !/^\d{2}:\d{2}$/.test(last.start)) {
          return '09:00';
        }
        const [hoursStr, minutesStr] = last.start.split(':');
        const hours = Number.parseInt(hoursStr, 10);
        const minutes = Number.parseInt(minutesStr, 10);
        const duration = Number.isFinite(last?.duration)
          ? last.duration
          : (() => {
              const parsed = Number.parseInt(last?.duration, 10);
              return Number.isFinite(parsed) ? parsed : defaultDurationMinutes;
            })();
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
          return last.start;
        }
        const candidate = new Date();
        candidate.setHours(hours, minutes + duration, 0, 0);
        return `${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`;
      })();
      slotPresetDrafts.push({
        id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        start: nextStart,
        duration: defaultDurationMinutes,
        title: '',
        type: ''
      });
      renderSlotPresetEditor();
    });
  }

  if (slotPresetResetBtn) {
    slotPresetResetBtn.addEventListener('click', () => {
      resetSlotPresetsToDefault();
      ensureSlotPresetDrafts();
      renderSlotPresetEditor();
      refreshSlotSuggestions(dateInput?.value || selectedDate, { autopick: false });
      highlightSelectedSlot();
      setSlotPresetNotice('Quick slots reset to defaults. / Horarios rápidos restablecidos.');
    });
  }

  if (slotPresetSaveBtn) {
    slotPresetSaveBtn.addEventListener('click', () => {
      const { slots, error } = normalizeSlotPresetDrafts();
      if (error) {
        setSlotPresetNotice(error, false);
        return;
      }
      slotPresets = slots;
      ensureSlotPresetDrafts();
      renderSlotPresetEditor();
      persistSlotPresetsState();
      refreshSlotSuggestions(dateInput?.value || selectedDate, { autopick: false });
      highlightSelectedSlot();
      setSlotPresetNotice('Quick slots updated. / Horarios rápidos actualizados.');
    });
  }

  if (saveCustomSlotBtn) {
    saveCustomSlotBtn.addEventListener('click', async () => {
      if (!startTimeInput || !startTimeInput.value) {
        setCustomSlotNotice('Pick a start time before saving. / Selecciona una hora de inicio antes de guardar.');
        return;
      }
      const dateStr = dateInput?.value || selectedDate;
      const start = startTimeInput.value;
      const startDate = toDateFromParts(dateStr, start);
      if (!startDate) {
        setCustomSlotNotice('Choose a valid date and time first. / Elige una fecha y hora válidas primero.');
        return;
      }
      let minutes = defaultDurationMinutes;
      if (endTimeInput && endTimeInput.value) {
        const endDate = computeEndDate(dateStr, start, endTimeInput.value);
        if (endDate) {
          minutes = Math.max(5, Math.round((endDate.getTime() - startDate.getTime()) / (60 * 1000)));
        }
      }
      const label = customSlotLabelInput?.value.trim() || '';
      const type = typeInput?.value.trim() || '';
      const existingIndex = customSlots.findIndex((slot) => slot.start === start && slot.duration === minutes);
      const slotRecord = {
        id:
          existingIndex >= 0
            ? customSlots[existingIndex].id
            : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        start,
        duration: minutes,
        title: label,
        type
      };
      if (existingIndex >= 0) {
        customSlots[existingIndex] = slotRecord;
      } else {
        customSlots.push(slotRecord);
      }
      persistCustomSlotsState();
      if (customSlotLabelInput) {
        customSlotLabelInput.value = '';
      }
      await refreshSlotSuggestions(dateStr);
      applySlot(slotRecord);
      highlightSelectedSlot();
      setCustomSlotNotice('Custom slot saved. / Horario personalizado guardado.');
    });
  }

  if (dateInput) {
    dateInput.addEventListener('change', () => {
      if (!dateInput.value) return;
      selectedDate = dateInput.value;
      updateSelectedCell(selectedDate);
      renderFocus(selectedDate);
      refreshSlotSuggestions(selectedDate, { autopick: !editingId });
      if (modalActiveDate) {
        modalActiveDate.textContent = formatDateLabel(selectedDate);
      }
    });
  }

  if (startTimeInput) {
    const handleStartChange = () => {
      ensureEndTimeOrder();
      highlightSelectedSlot();
    };
    startTimeInput.addEventListener('input', handleStartChange);
    startTimeInput.addEventListener('change', handleStartChange);
  }

  if (endTimeInput) {
    endTimeInput.addEventListener('change', () => {
      ensureEndTimeOrder();
    });
  }

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

