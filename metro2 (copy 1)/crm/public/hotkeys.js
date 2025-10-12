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

function normalizeHotkeys(raw = {}) {
  const normalized = {};
  for (const key in raw) {
    const value = (raw[key] || '').toString().trim().toLowerCase().slice(0, 1);
    if (value) normalized[key] = value;
  }
  return normalized;
}

function getHotkeys(){
  try {
    const stored = JSON.parse(localStorage.getItem('hotkeys') || '{}');
    return { ...defaultHotkeys, ...normalizeHotkeys(stored) };
  } catch {
    return { ...defaultHotkeys };
  }
}

function refreshHotkeys() {
  hotkeys = getHotkeys();
  return hotkeys;
}

let hotkeys = getHotkeys();
window.addEventListener('storage', (e) => {
  if (e.key === 'hotkeys') refreshHotkeys();
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
  refresh: refreshHotkeys
};

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
