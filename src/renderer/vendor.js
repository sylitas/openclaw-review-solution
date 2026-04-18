import { setBasePath } from '../../node_modules/@shoelace-style/shoelace/dist/utilities/base-path.js';
import '../../node_modules/@shoelace-style/shoelace/dist/components/button/button.js';
import '../../node_modules/@shoelace-style/shoelace/dist/components/badge/badge.js';
import '../../node_modules/@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '../../node_modules/@shoelace-style/shoelace/dist/components/card/card.js';
import '../../node_modules/@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import { createIcons, icons } from '../../node_modules/lucide/dist/esm/lucide.js';

setBasePath('../../node_modules/@shoelace-style/shoelace/dist');

function refreshLucideIcons() {
  createIcons({
    icons,
    attrs: {
      width: '18',
      height: '18',
      'stroke-width': '2',
    },
  });
}

window.refreshLucideIcons = refreshLucideIcons;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshLucideIcons, { once: true });
} else {
  refreshLucideIcons();
}
