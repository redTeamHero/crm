import { useEffect, useRef } from 'react';

export interface HotkeyMap {
  help?: string;
  newConsumer?: string;
  newClient?: string;
  newLead?: string;
  upload?: string;
  editConsumer?: string;
  generate?: string;
  remove?: string;
  modeBreach?: string;
  modeAssault?: string;
  modeIdentity?: string;
  [key: string]: string | undefined;
}

export type HotkeyActions = Partial<Record<string, () => boolean | void>>;

const STORAGE_KEY = 'hotkeys';
const DEFAULTS: HotkeyMap = {
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
  modeIdentity: 'i',
};

function normalize(raw: Record<string, unknown>): HotkeyMap {
  const result: HotkeyMap = {};
  for (const k of Object.keys(raw)) {
    const v = String(raw[k] || '').trim().toLowerCase().slice(0, 1);
    if (v) result[k] = v;
  }
  return result;
}

function getStoredOverrides(): HotkeyMap {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>);
  } catch {
    return {};
  }
}

function getHotkeys(): HotkeyMap {
  return { ...DEFAULTS, ...getStoredOverrides() };
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

async function syncFromServer(onUpdated: (hk: HotkeyMap) => void) {
  try {
    const resp = await fetch('/api/settings/hotkeys', { cache: 'no-store', credentials: 'same-origin' });
    if (!resp.ok) return;
    const data = await resp.json().catch(() => null);
    if (!data || data.ok === false) return;
    const overrides = normalize(data.hotkeys || {});
    const current = getStoredOverrides();
    const sig = (m: HotkeyMap) => Object.keys(m).sort().map(k => `${k}:${m[k]}`).join('|');
    if (sig(current) !== sig(overrides)) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch { /* ignore */ }
      onUpdated({ ...DEFAULTS, ...overrides });
    }
  } catch {
    /* ignore network errors */
  }
}

export function useHotkeys(actions: HotkeyActions = {}) {
  const hkRef = useRef<HotkeyMap>(getHotkeys());

  useEffect(() => {
    const update = (hk: HotkeyMap) => { hkRef.current = hk; };
    syncFromServer(update);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) hkRef.current = getHotkeys();
    };
    window.addEventListener('storage', onStorage);

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const k = e.key.toLowerCase();
      const hk = hkRef.current;

      const click = (id: string): boolean => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.click();
        return true;
      };

      const runAction = (name: string): boolean => {
        const fn = actions[name];
        if (typeof fn === 'function') return fn() !== false;
        const winFn = (window as unknown as { __crm_hotkeyActions?: Record<string, () => boolean | void> }).__crm_hotkeyActions;
        if (winFn && typeof (winFn as Record<string, unknown>)[name] === 'function') {
          return ((winFn as Record<string, unknown>)[name] as () => boolean)() !== false;
        }
        return false;
      };

      const newClientKey = hk.newClient || hk.newConsumer;
      if (k === hk.help) { e.preventDefault(); window.openHelp?.(); return; }
      if (newClientKey && k === newClientKey) {
        e.preventDefault();
        if (runAction('newClient') || runAction('newConsumer')) return;
        if (click('btnNewConsumer')) return;
        click('btnCreateClient');
        return;
      }
      if (hk.newLead && k === hk.newLead) {
        e.preventDefault();
        if (runAction('newLead')) return;
        const leadForm = document.getElementById('leadForm');
        if (leadForm) {
          leadForm.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          const nameInput = leadForm.querySelector<HTMLInputElement>('#leadName, [name="name"]');
          if (nameInput) { nameInput.focus(); setTimeout(() => nameInput.select?.(), 0); }
        }
        return;
      }
      if (k === hk.upload) { e.preventDefault(); click('btnUpload'); }
      if (k === hk.editConsumer) { e.preventDefault(); click('btnEditConsumer'); }
      if (k === hk.generate) { e.preventDefault(); click('btnGenerate'); }
      if (k === hk.remove) { e.preventDefault(); document.querySelector<HTMLElement>('.tl-remove')?.click(); }
      if (k === hk.modeBreach) runAction('setMode_breach');
      if (k === hk.modeAssault) runAction('setMode_assault');
      if (k === hk.modeIdentity) runAction('setMode_identity');
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('storage', onStorage);
    };
  }, [actions]);

  return {
    getHotkeys: () => hkRef.current,
    storeOverrides: (overrides: HotkeyMap) => {
      const norm = normalize(overrides as Record<string, unknown>);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(norm)); } catch { /* ignore */ }
      hkRef.current = { ...DEFAULTS, ...norm };
      return { ...hkRef.current };
    },
    defaults: { ...DEFAULTS },
  };
}

