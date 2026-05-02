import React, { useEffect, useRef } from 'react';

export default function SlideUp({ open, onClose, title, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose && onClose();
    }
    if (open) {
      document.addEventListener('keydown', onKey);
      // save focus
      const prev = document.activeElement;
      // focus first focusable in panel after open
      setTimeout(() => {
        const el = panelRef.current && panelRef.current.querySelector('button, [href], input, textarea, select, [tabindex]');
        if (el) el.focus();
      }, 50);
      return () => {
        document.removeEventListener('keydown', onKey);
        if (prev && prev.focus) prev.focus();
      };
    }
    return () => {};
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div>
      <div className="slide-backdrop" onClick={() => onClose && onClose()} />
      <div className="slide-panel" role="dialog" aria-modal="true" ref={panelRef}>
        <div className="slide-panel-header">
          <div className="slide-panel-title">{title}</div>
          <button className="tool-btn" onClick={() => onClose && onClose()} aria-label="Close slide panel">✕</button>
        </div>
        <div className="slide-panel-body">{children}</div>
      </div>
    </div>
  );
}
