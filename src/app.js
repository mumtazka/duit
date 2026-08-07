import { supabase } from './lib/supabase.js';

const PALETTE = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const WEEKDAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

const CAT_ICONS = {
  'Makan': '🍱',
  'Transport': '🚗',
  'Belanja': '🛍️',
  'Hiburan': '🎬',
  'Tagihan': '⚡',
  'Kesehatan': '💊',
  'Lainnya': '📦'
};

const state = {
  expenses: [],      // {id, amount, note, category, date}
  categories: [],    // {id, name, color}
  selectedDate: todayStr(),
  editingId: null,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  searchQuery: '',
  filterCat: 'ALL'
};

/* ---------- Utilities ---------- */
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parse(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtRupiah(n) { return 'Rp' + Number(n).toLocaleString('id-ID'); }
const $ = (id) => document.getElementById(id);
const logErr = (label, e) => { console.error(label, e); alert(`${label}: ${e.message || e}`); };

function dayExpenses(ds) { return state.expenses.filter(e => e.date === ds); }
function daySum(ds) { return dayExpenses(ds).reduce((s,e)=>s+e.amount,0); }

function rangeSum(start, end) {
  let total = 0, count = 0;
  for (let d = new Date(start); d <= end; d = addDays(d,1)) {
    const ds = fmtDate(d);
    total += daySum(ds); 
    count += dayExpenses(ds).length;
  }
  return { total, count };
}

function weekStart() { return addDays(new Date(), -((new Date().getDay()+6)%7)); }
function weekRange() { const s=weekStart(); return { start:s, end:addDays(s,6) }; }
function monthRange(offset) {
  const now=new Date();
  const start=new Date(now.getFullYear(), now.getMonth()+offset, 1);
  const end=new Date(now.getFullYear(), now.getMonth()+offset+1, 0);
  return { start, end };
}

function catColor(name) { 
  const found = state.categories.find(c=>c.name===name);
  if (found && found.color) return found.color;
  if (name === 'Makan') return '#10b981';
  if (name === 'Transport') return '#6366f1';
  if (name === 'Belanja') return '#f59e0b';
  if (name === 'Hiburan') return '#8b5cf6';
  return '#64748b'; 
}

function catId(name) { return state.categories.find(c=>c.name===name)?.id || null; }

/* ---------- Theme Manager ---------- */
export function initTheme() {
  const saved = localStorage.getItem('pengeluaran-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pengeluaran-theme', next);
}

/* ---------- Supabase Data Sync ---------- */
export async function loadData() {
  const [catRes, expRes] = await Promise.all([
    supabase.from('categories').select('id,name,color').order('created_at'),
    supabase.from('expenses').select('id,amount,note,category_id,expense_date').order('expense_date'),
  ]);
  if (catRes.error) throw catRes.error;
  if (expRes.error) throw expRes.error;

  state.categories = catRes.data || [];
  const catIdToName = Object.fromEntries(state.categories.map(c => [c.id, c.name]));
  
  state.expenses = (expRes.data || []).map(r => ({
    id: r.id,
    amount: Number(r.amount),
    note: r.note || '',
    category: r.category_id ? (catIdToName[r.category_id] || 'Lainnya') : 'Lainnya',
    date: r.expense_date,
  }));
}

export async function addExpense({ amount, note, category }) {
  const { data, error } = await supabase.from('expenses').insert({
    amount,
    note,
    category_id: catId(category),
    expense_date: state.selectedDate,
  }).select('id');
  if (error) throw error;
  state.expenses.push({ id: data[0].id, amount, note, category, date: state.selectedDate });
}

export async function updateExpense(id, { amount, note, category }) {
  const { error } = await supabase.from('expenses').update({
    amount,
    note,
    category_id: catId(category),
  }).eq('id', id);
  if (error) throw error;
  const target = state.expenses.find(e => e.id === id);
  if (target) Object.assign(target, { amount, note, category });
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
  state.expenses = state.expenses.filter(e => e.id !== id);
}

export async function clearDay(ds) {
  const ids = dayExpenses(ds).map(e => e.id);
  if (!ids.length) return;
  const { error } = await supabase.from('expenses').delete().in('id', ids);
  if (error) throw error;
  state.expenses = state.expenses.filter(e => e.date !== ds);
}

/* ---------- Edit Mode Handlers ---------- */
function enterEdit(e) {
  state.editingId = e.id;
  $('note').value = e.note;
  $('amount').value = e.amount;
  $('category').value = e.category;
  $('amountPreview').textContent = `≈ ${fmtRupiah(e.amount)}`;
  $('editBar').hidden = false;
  $('editTarget').textContent = e.note || 'catatan';
  $('formHeaderTitle').textContent = 'Sunting Pengeluaran';
  const submitBtn = $('submitBtn');
  submitBtn.querySelector('span').textContent = 'Simpan Perubahan';
  document.querySelector('.input-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  state.editingId = null;
  $('note').value = ''; 
  $('amount').value = ''; 
  $('category').value = ''; 
  $('amountPreview').textContent = '';
  $('editBar').hidden = true;
  $('formHeaderTitle').textContent = 'Tambah Pengeluaran';
  const submitBtn = $('submitBtn');
  submitBtn.querySelector('span').textContent = 'Simpan Pengeluaran';
}

/* ---------- Render Functions ---------- */
function renderCategoryOptions() {
  const sel = $('category');
  const filterSel = $('filterCategory');
  const currentVal = sel.value;
  const currentFilterVal = filterSel ? filterSel.value : 'ALL';

  sel.innerHTML = '<option value="">Pilih Kategori…</option>';
  if (filterSel) {
    filterSel.innerHTML = '<option value="ALL">Semua Kategori</option>';
  }

  state.categories.forEach(c => {
    const o = document.createElement('option'); 
    o.value = c.name; 
    o.textContent = c.name; 
    sel.appendChild(o);

    if (filterSel) {
      const fo = document.createElement('option');
      fo.value = c.name;
      fo.textContent = c.name;
      filterSel.appendChild(fo);
    }
  });

  sel.value = currentVal;
  if (filterSel) filterSel.value = currentFilterVal;
}

function renderSummary() {
  const today = todayStr();
  const wk = rangeSum(weekRange().start, weekRange().end);
  const mo = rangeSum(monthRange(0).start, monthRange(0).end);
  
  $('todayTotal').textContent = fmtRupiah(daySum(today));
  $('weekTotal').textContent = fmtRupiah(wk.total);
  $('monthTotal').textContent = fmtRupiah(mo.total);
  $('monthCount').textContent = mo.count;

  // Header month badge text
  const currentMonthName = MONTHS[new Date().getMonth()];
  const currentYearName = new Date().getFullYear();
  if ($('monthBadgeText')) {
    $('monthBadgeText').textContent = `${currentMonthName} ${currentYearName}`;
  }
}

function renderCalendar() {
  const grid = $('calGrid');
  grid.querySelectorAll('.cal-day').forEach(n => n.remove());
  $('calTitle').textContent = `${MONTHS[state.viewMonth]} ${state.viewYear}`;

  const first = new Date(state.viewYear, state.viewMonth, 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  const prevDim = new Date(state.viewYear, state.viewMonth, 0).getDate();

  for (let i = startDow - 1; i >= 0; i--) {
    appendDay(new Date(state.viewYear, state.viewMonth - 1, prevDim - i), true);
  }
  for (let d = 1; d <= dim; d++) {
    appendDay(new Date(state.viewYear, state.viewMonth, d), false);
  }
  const count = grid.querySelectorAll('.cal-day').length;
  for (let i = 1; i <= 7 - (count % 7 || 7); i++) {
    appendDay(new Date(state.viewYear, state.viewMonth + 1, i), true);
  }
}

function appendDay(date, isDim) {
  const el = document.createElement('div');
  const ds = fmtDate(date);
  el.className = 'cal-day' + (isDim ? ' dim' : '');
  
  if (ds === todayStr()) el.classList.add('today');
  if (ds === state.selectedDate) el.classList.add('selected');
  
  el.textContent = date.getDate();
  
  if (daySum(ds) > 0) { 
    const dot = document.createElement('span'); 
    dot.className = 'cal-dot'; 
    el.appendChild(dot); 
  }

  el.addEventListener('click', () => {
    state.selectedDate = ds;
    renderCalendar();
    renderList();
    renderFormBadge();
  });
  
  $('calGrid').appendChild(el);
}

function renderFormBadge() {
  const d = parse(state.selectedDate);
  const isToday = state.selectedDate === todayStr();
  const badgeEl = $('selectedFormDateBadge');
  if (badgeEl) {
    badgeEl.textContent = isToday
      ? 'Hari Ini'
      : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
}

function renderList() {
  const d = parse(state.selectedDate);
  const isToday = state.selectedDate === todayStr();
  
  $('dayTitle').textContent = isToday
    ? 'Pengeluaran Hari Ini'
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    
  if ($('daySubtitle')) {
    const totalDayAmount = daySum(state.selectedDate);
    $('daySubtitle').textContent = totalDayAmount > 0 
      ? `Total: ${fmtRupiah(totalDayAmount)}`
      : 'Belum ada transaksi tercatat';
  }

  $('selectedDateHint').textContent = isToday
    ? `Hari ini · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    
  const allDayExpenses = dayExpenses(state.selectedDate);
  $('clearDay').style.display = allDayExpenses.length ? '' : 'none';

  // Apply Search and Category Filter
  let filtered = allDayExpenses;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(e => e.note.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  }
  if (state.filterCat && state.filterCat !== 'ALL') {
    filtered = filtered.filter(e => e.category === state.filterCat);
  }

  const list = $('expenseList');
  list.innerHTML = '';
  
  const emptyMsg = $('emptyMsg');
  if (!filtered.length) {
    emptyMsg.style.display = 'flex';
  } else {
    emptyMsg.style.display = 'none';
  }

  filtered.forEach(e => {
    const li = document.createElement('li'); 
    li.className = 'expense-item';

    const left = document.createElement('div'); 
    left.className = 'expense-left';

    const catPill = document.createElement('div'); 
    catPill.className = 'cat-pill';
    catPill.style.background = catColor(e.category);
    catPill.textContent = CAT_ICONS[e.category] || e.category.charAt(0).toUpperCase();

    const info = document.createElement('div'); 
    info.className = 'expense-info';
    
    const note = document.createElement('span'); 
    note.className = 'expense-note';
    note.textContent = e.note || 'Tanpa keterangan';

    const catName = document.createElement('span');
    catName.className = 'expense-cat-name';
    catName.textContent = e.category || 'Lainnya';
    info.append(note, catName);

    const right = document.createElement('div'); 
    right.className = 'expense-right';

    const amt = document.createElement('span'); 
    amt.className = 'expense-amount'; 
    amt.textContent = fmtRupiah(e.amount);

    const editBtn = document.createElement('button'); 
    editBtn.className = 'action-btn'; 
    editBtn.setAttribute('aria-label', 'Edit Transaksi');
    editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    editBtn.addEventListener('click', () => { 
      if (state.editingId === e.id) cancelEdit(); 
      else enterEdit(e); 
    });

    const delBtn = document.createElement('button'); 
    delBtn.className = 'action-btn del-action'; 
    delBtn.setAttribute('aria-label', 'Hapus Transaksi');
    delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    delBtn.addEventListener('click', async () => {
      try { 
        await deleteExpense(e.id); 
        if (state.editingId === e.id) cancelEdit(); 
        renderAll(); 
      } catch (err) { 
        logErr('Hapus gagal', err); 
      }
    });

    left.append(catPill, info); 
    right.append(amt, editBtn, delBtn); 
    li.append(left, right); 
    list.appendChild(li);
  });
}

function renderCategoryBars() {
  const { start, end } = monthRange(0);
  const byCat = {}; 
  let total = 0;

  for (let d = new Date(start); d <= end; d = addDays(d,1)) {
    dayExpenses(fmtDate(d)).forEach(e => { 
      const c = e.category || 'Lainnya'; 
      byCat[c] = (byCat[c] || 0) + e.amount; 
      total += e.amount; 
    });
  }

  const bars = $('catBars'); 
  bars.innerHTML = '';
  const entries = Object.entries(byCat).sort((a,b) => b[1] - a[1]);
  
  $('catEmpty').style.display = entries.length ? 'none' : 'block';

  entries.forEach(([cat, amt]) => {
    const pct = total ? Math.round(amt / total * 100) : 0;
    const row = document.createElement('div'); 
    row.className = 'cat-row';
    const icon = CAT_ICONS[cat] || '•';

    row.innerHTML = `
      <div class="cat-top">
        <span class="cat-name">${icon} ${cat} · ${pct}%</span>
        <span class="cat-val">${fmtRupiah(amt)}</span>
      </div>
      <div class="cat-track">
        <div class="cat-fill" style="width:${pct}%;background:${catColor(cat)}"></div>
      </div>`;
    bars.appendChild(row);
  });
}

export function renderAll() {
  renderCategoryOptions();
  renderSummary();
  renderCalendar();
  renderFormBadge();
  renderList();
  renderCategoryBars();
}

/* ---------- Event Listeners ---------- */
export function bindEvents() {
  initTheme();

  const themeToggleBtn = $('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  const todayJumpBtn = $('todayJumpBtn');
  if (todayJumpBtn) {
    todayJumpBtn.addEventListener('click', () => {
      const now = new Date();
      state.selectedDate = todayStr();
      state.viewYear = now.getFullYear();
      state.viewMonth = now.getMonth();
      renderAll();
    });
  }

  $('amount').addEventListener('input', () => {
    const v = parseInt($('amount').value, 10);
    $('amountPreview').textContent = (v >= 0 && !isNaN(v)) ? `≈ ${fmtRupiah(v)}` : '';
  });

  const searchInput = $('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderList();
    });
  }

  const filterCategory = $('filterCategory');
  if (filterCategory) {
    filterCategory.addEventListener('change', (e) => {
      state.filterCat = e.target.value;
      renderList();
    });
  }

  $('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt($('amount').value, 10);
    if (isNaN(amount) || amount <= 0) return;
    
    const submitBtn = $('submitBtn');
    submitBtn.disabled = true;

    try {
      const payload = { 
        amount, 
        note: $('note').value.trim(), 
        category: $('category').value || 'Lainnya' 
      };

      if (state.editingId) {
        await updateExpense(state.editingId, payload);
        cancelEdit();
      } else {
        await addExpense(payload);
        $('amount').value = ''; 
        $('note').value = ''; 
        $('category').value = ''; 
        $('amountPreview').textContent = '';
      }
      renderAll();
    } catch (err) { 
      logErr('Simpan gagal', err); 
    } finally { 
      submitBtn.disabled = false; 
    }
  });

  $('cancelEdit').addEventListener('click', cancelEdit);

  $('clearDay').addEventListener('click', async () => {
    if (!dayExpenses(state.selectedDate).length) return;
    if (confirm('Apakah kamu yakin ingin menghapus semua catatan pengeluaran tanggal ini?')) {
      try { 
        await clearDay(state.selectedDate); 
        renderAll(); 
      } catch (err) { 
        logErr('Hapus gagal', err); 
      }
    }
  });

  $('prevMonth').addEventListener('click', () => { 
    state.viewMonth--; 
    if (state.viewMonth < 0) { 
      state.viewMonth = 11; 
      state.viewYear--; 
    } 
    renderCalendar(); 
  });

  $('nextMonth').addEventListener('click', () => { 
    state.viewMonth++; 
    if (state.viewMonth > 11) { 
      state.viewMonth = 0; 
      state.viewYear++; 
    } 
    renderCalendar(); 
  });
}
