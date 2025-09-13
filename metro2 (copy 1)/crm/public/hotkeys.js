/* public/hotkeys.js */
function isTyping(el){
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

const defaultHotkeys = {
  help: 'h',
  newConsumer: 'n',
  upload: 'u',
  editConsumer: 'e',
  generate: 'g',
  remove: 'r',
  modeBreach: 'd',
  modeAssault: 's',
  modeIdentity: 'i'
};

function getHotkeys(){
  try {
    return { ...defaultHotkeys, ...JSON.parse(localStorage.getItem('hotkeys') || '{}') };
  } catch {
    return { ...defaultHotkeys };
  }
}

let hotkeys = getHotkeys();
window.addEventListener('storage', (e) => {
  if (e.key === 'hotkeys') hotkeys = getHotkeys();
});

document.addEventListener('keydown', (e) => {
  if (isTyping(document.activeElement)) return;
  const k = e.key.toLowerCase();
  const click = (id) => document.getElementById(id)?.click();

  if (k === hotkeys.help) { e.preventDefault(); window.openHelp?.(); }
  if (k === hotkeys.newConsumer) { e.preventDefault(); click('btnNewConsumer'); }
  if (k === hotkeys.upload) { e.preventDefault(); click('btnUpload'); }
  if (k === hotkeys.editConsumer) { e.preventDefault(); click('btnEditConsumer'); }
  if (k === hotkeys.generate) { e.preventDefault(); click('btnGenerate'); }
  if (k === hotkeys.remove) { e.preventDefault(); document.querySelector('.tl-remove')?.click(); }
  if (k === hotkeys.modeBreach) window.__crm_helpers?.setMode?.('breach');
  if (k === hotkeys.modeAssault) window.__crm_helpers?.setMode?.('assault');
  if (k === hotkeys.modeIdentity) window.__crm_helpers?.setMode?.('identity');
});
