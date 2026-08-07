import { loadData, renderAll, bindEvents, initTheme } from './app.js';

const PASS = import.meta.env.VITE_APP_PASSWORD || 'admin123';
const LOCK_KEY = 'pengeluaran-unlocked';
const $ = (id) => document.getElementById(id);

function unlock() {
  sessionStorage.setItem(LOCK_KEY, '1');
  $('lockScreen').hidden = true;
}

function lock() {
  sessionStorage.removeItem(LOCK_KEY);
  $('lockScreen').hidden = false;
  $('lockPassword').value = '';
  $('lockError').textContent = '';
  $('lockPassword').focus();
}

$('lockForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('lockPassword').value === PASS) {
    unlock();
  } else {
    $('lockError').textContent = 'Sandi salah. Silakan coba lagi.';
    const lockCard = document.querySelector('.lock-card');
    if (lockCard) {
      lockCard.classList.remove('shake');
      void lockCard.offsetWidth; // trigger reflow
      lockCard.classList.add('shake');
    }
    $('lockPassword').select();
  }
});

$('lockBtn').addEventListener('click', lock);

(async () => {
  initTheme();
  if (sessionStorage.getItem(LOCK_KEY)) {
    unlock();
  } else {
    lock();
  }
  try {
    await loadData();
    renderAll();
    bindEvents();
  } catch (e) {
    console.error(e);
    alert('Gagal memuat data: ' + (e.message || e));
  }
})();