'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('poweredToast');
  if (!toast) return;

  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => toast.classList.remove('show'), 3000);
});
