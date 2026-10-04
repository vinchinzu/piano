import { useEffect, useRef, type ReactNode } from 'react';

export function PracticeDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialog.current;
    if (!panel) return;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex="0"]'))
      .filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable(); const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel.addEventListener('keydown', handleKey);
    return () => { cancelAnimationFrame(frame); panel.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="practice-drawer-overlay">
    <button className="practice-drawer-backdrop" tabIndex={-1} aria-label="Close settings overlay" onClick={onClose} />
    <aside className="practice-drawer" role="dialog" aria-modal="true" aria-labelledby="practice-drawer-title" ref={dialog}>
      <header><div><small>LITTLE PIANO CLUB</small><h2 id="practice-drawer-title">Songs & practice settings</h2></div><button aria-label="Close menu" onClick={onClose}>×</button></header>
      <div className="practice-drawer-content">{children}</div>
      <footer><button onClick={onClose}>Back to piano →</button></footer>
    </aside>
  </div>;
}
