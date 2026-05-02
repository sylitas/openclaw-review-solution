import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppShell } from './ui/AppShell';
import './styles.css';
import './react-styles.css';

const container = document.getElementById('react-root');

async function mount() {
  if (!container) {
    return;
  }

  const root = createRoot(container);
  flushSync(() => {
    root.render(<AppShell />);
  });

  window.dispatchEvent(new CustomEvent('review-shell-ready'));
  await import('./app.js');
}

mount();
