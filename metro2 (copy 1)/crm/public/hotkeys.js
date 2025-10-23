/* public/hotkeys.js */
function isTyping(el){
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const defaultHotkeys = {
  help: 'h',
  newConsumer: 'n',
  newClient: 'n',
  newLead: 'l',
  upload: 'u',
  editConsumer: 'e',
  generate: 'g',
  remove: 'r',
  modeBreach: 'd',
  modeAssault: 's',
  modeIdentity: 'i'
};

const HOTKEY_STORAGE_KEY = 'hotkeys';

function normalizeHotkeys(raw = {}) {
  const normalized = {};
  for (const key in raw) {
    const value = (raw[key] || '').toString().trim().toLowerCase().slice(0, 1);
    if (value) normalized[key] = value;
  }
  return normalized;
}

function hotkeySignature(map = {}) {
  return Object.keys(map)
    .sort()
    .map((key) => `${key}:${map[key]}`)
    .join('|');
}

function getStoredHotkeyOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(HOTKEY_STORAGE_KEY) || '{}');
    return normalizeHotkeys(raw || {});
  } catch {
    return {};
  }
}

function setStoredHotkeyOverrides(overrides = {}) {
  const normalized = normalizeHotkeys(overrides || {});
  try {
    localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

function getHotkeys(){
  const stored = getStoredHotkeyOverrides();
  return { ...defaultHotkeys, ...stored };
}

function refreshHotkeys() {
  hotkeys = getHotkeys();
  return hotkeys;
}

let hotkeys = getHotkeys();

async function syncHotkeysFromServer() {
  if (typeof fetch !== 'function') return;
  try {
    const resp = await fetch('/api/settings/hotkeys', { credentials: 'same-origin' });
    if (!resp.ok) return;
    const data = await resp.json().catch(() => null);
    if (!data || data.ok === false) return;
    const overrides = normalizeHotkeys(data.hotkeys || {});
    const current = getStoredHotkeyOverrides();
    if (hotkeySignature(current) !== hotkeySignature(overrides)) {
      setStoredHotkeyOverrides(overrides);
      refreshHotkeys();
    }
  } catch (error) {
    console.warn('[hotkeys] failed to sync from API', error);
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === HOTKEY_STORAGE_KEY) refreshHotkeys();
});

function runHotkeyAction(name){
  try {
    const fn = window.__crm_hotkeyActions?.[name];
    if (typeof fn === 'function') {
      return fn() !== false;
    }
  } catch (error) {
    console.error('[hotkeys] action failed', name, error);
  }
  return false;
}

window.__crm_hotkeys = {
  defaults: { ...defaultHotkeys },
  get: () => ({ ...hotkeys }),
  normalize: normalizeHotkeys,
  refresh: refreshHotkeys,
  store: (overrides = {}) => {
    const normalized = setStoredHotkeyOverrides(overrides);
    hotkeys = { ...defaultHotkeys, ...normalized };
    return { ...hotkeys };
  }
};

syncHotkeysFromServer();

document.addEventListener('keydown', (e) => {
  if (isTyping(document.activeElement)) return;
  const k = e.key.toLowerCase();
  const click = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  };

  const newClientKey = hotkeys.newClient || hotkeys.newConsumer;

  if (k === hotkeys.help) { e.preventDefault(); window.openHelp?.(); }
  if (newClientKey && k === newClientKey) {
    e.preventDefault();
    if (runHotkeyAction('newClient') || runHotkeyAction('newConsumer')) return;
    if (click('btnNewConsumer')) return;
    click('btnCreateClient');
    return;
  }
  if (hotkeys.newLead && k === hotkeys.newLead) {
    e.preventDefault();
    if (runHotkeyAction('newLead')) return;
    const leadForm = document.getElementById('leadForm');
    if (leadForm) {
      leadForm.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      const nameInput = leadForm.querySelector('#leadName, [name="name"]');
      if (nameInput) {
        nameInput.focus();
        if (typeof nameInput.select === 'function') {
          setTimeout(() => nameInput.select(), 0);
        }
      }
    }
    return;
  }
  if (k === hotkeys.upload) { e.preventDefault(); click('btnUpload'); }
  if (k === hotkeys.editConsumer) { e.preventDefault(); click('btnEditConsumer'); }
  if (k === hotkeys.generate) { e.preventDefault(); click('btnGenerate'); }
  if (k === hotkeys.remove) { e.preventDefault(); document.querySelector('.tl-remove')?.click(); }
  if (k === hotkeys.modeBreach) window.__crm_helpers?.setMode?.('breach');
  if (k === hotkeys.modeAssault) window.__crm_helpers?.setMode?.('assault');
  if (k === hotkeys.modeIdentity) window.__crm_helpers?.setMode?.('identity');
});
