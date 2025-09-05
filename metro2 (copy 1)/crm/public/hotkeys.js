/* public/hotkeys.js */
function isTyping(el){
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (isTyping(document.activeElement)) return;
  const k = e.key.toLowerCase();
  const click = (id) => document.getElementById(id)?.click();

  if (k === 'h') { e.preventDefault(); window.openHelp?.(); }
  if (k === 'n') { e.preventDefault(); click('btnNewConsumer'); }
  if (k === 'u') { e.preventDefault(); click('btnUpload'); }
  if (k === 'e') { e.preventDefault(); click('btnEditConsumer'); }
  if (k === 'g') { e.preventDefault(); click('btnGenerate'); }
  if (k === 'r') { e.preventDefault(); document.querySelector('.tl-remove')?.click(); }
  if (k === 'd') { e.preventDefault(); trackEvent?.('hotkey_mode', { key: 'd', mode: 'breach' }); window.__crm_helpers?.setMode?.('breach'); }
  if (k === 's') { e.preventDefault(); trackEvent?.('hotkey_mode', { key: 's', mode: 'assault' }); window.__crm_helpers?.setMode?.('assault'); }
  if (k === 'i') { e.preventDefault(); trackEvent?.('hotkey_mode', { key: 'i', mode: 'identity' }); window.__crm_helpers?.setMode?.('identity'); }
});
