import { useState, useCallback, useEffect, useRef } from 'react';

export interface Command {
  cat: string;
  label: string;
  desc?: string;
  icon?: string;
  action: () => void;
}

export function useCommandPalette(commands: Command[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = commands.filter(cmd =>
    !query ||
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    (cmd.desc || '').toLowerCase().includes(query.toLowerCase()) ||
    cmd.cat.toLowerCase().includes(query.toLowerCase())
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => { setIsOpen(false); }, []);

  const select = useCallback(() => {
    const cmd = filtered[activeIndex];
    if (cmd) { close(); cmd.action(); }
  }, [filtered, activeIndex, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        isOpen ? close() : open();
        return;
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => filtered.length ? (i + 1) % filtered.length : 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => filtered.length ? (i - 1 + filtered.length) % filtered.length : 0); return; }
      if (e.key === 'Enter') { e.preventDefault(); select(); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, open, close, select, filtered.length]);

  return {
    isOpen, query, activeIndex, filtered, inputRef,
    open, close, select,
    setQuery: (q: string) => { setQuery(q); setActiveIndex(0); },
    setActiveIndex,
  };
}
