import { loadData, renderAll, bindEvents } from './app.js';

(async () => {
  try {
    await loadData();
    renderAll();
    bindEvents();
  } catch (e) {
    console.error(e);
    alert('Gagal memuat data: ' + (e.message || e));
  }
})();