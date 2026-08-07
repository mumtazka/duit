import { supabase } from './lib/supabase.js';
import { loadData, renderAll, bindEvents, switchView } from './app.js';

const $ = (id) => document.getElementById(id);
const authScreen = $('authScreen');
const appRoot = $('appRoot');
const appHeader = $('appHeader');

let mode = 'login';

function showApp(user) {
  authScreen.hidden = true;
  appRoot.hidden = false;
  appHeader.hidden = false;
  $('userEmail').textContent = user?.email || '';
}

function showAuth() {
  authScreen.hidden = false;
  appRoot.hidden = true;
  appHeader.hidden = true;
}

async function boot(user) {
  showApp(user);
  try {
    await loadData();
    renderAll();
    bindEvents();
    switchView('daily');
  } catch (e) {
    console.error(e);
    alert('Gagal memuat data: ' + (e.message || e));
  }
}

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  $('authError').textContent = '';
  const btn = $('authSubmit');
  btn.disabled = true;
  try {
    const { user, session, error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (mode === 'register' && !session) {
      $('authError').textContent = 'Akun dibuat. Cek email untuk verifikasi, lalu masuk.';
      return;
    }
    await boot(user);
  } catch (err) {
    $('authError').textContent = err.message || 'Terjadi kesalahan';
  } finally {
    btn.disabled = false;
  }
});

$('authToggle').addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  $('authSubmit').textContent = mode === 'login' ? 'Masuk' : 'Daftar';
  $('authToggle').textContent = mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk';
  $('authError').textContent = '';
});

$('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) boot(session.user);
});

(async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await boot(data.session.user);
  } else {
    showAuth();
  }
})();