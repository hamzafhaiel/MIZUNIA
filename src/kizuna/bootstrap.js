import './scene.css';

import('./scene.js').catch(error => {
  console.error('KIZUNA 3D', error);
  document.querySelector('#scene-fallback').hidden = false;
  document.querySelector('#scene-status').textContent = 'Vue 3D indisponible';
  document.querySelector('.scene-tools').hidden = true;
});
