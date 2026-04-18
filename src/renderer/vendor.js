import { setBasePath } from '../../node_modules/@shoelace-style/shoelace/dist/utilities/base-path.js';
import '../../node_modules/@shoelace-style/shoelace/dist/shoelace-autoloader.js';

setBasePath('../../node_modules/@shoelace-style/shoelace/dist');

function refreshLucideIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') {
    return;
  }

  window.lucide.createIcons({
    attrs: {
      width: '18',
      height: '18',
      'stroke-width': '2'
    }
  });
}

window.refreshLucideIcons = refreshLucideIcons;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshLucideIcons, { once: true });
} else {
  refreshLucideIcons();
}
