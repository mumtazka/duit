import { supabase } from './lib/supabase.js';

const PALETTE = ['#4f6bf5','#30a46c','#e5484d','#f5a524','#8e4ec6','#f0683d','#e5357f','#7a8ba3','#5c7cfa'];
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const state = {
  expenses: [],      // {id, amount, note, category, date}
  categories: [],    // {id, name, color}
  selectedDate: todayStr(),
  editingId: null,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
};

/* ---------- util ---------- */
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parse(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtRupiah(n) { return 'Rp' + Number(n).toLocaleString('id-ID'); }
function compact(n){ return n>=1000 ? `${Number((n/1000).toFixed(1))}k` : String(n); }
const $ = (id) => document.getElementById(id);
const logErr = (label, e) => { console.error(label, e); alert(`${label}: ${e.message || e}`); };

function dayExpenses(ds) { return state.expenses.filter(e => e.date === ds); }
function daySum(ds) { return dayExpenses(ds).reduce((s,e)=>s+e.amount,0); }
function rangeSum(start, end) {
  let total = 0, count = 0;
  for (let d = new Date(start); d <= end; d = addDays(d,1)) {
    const ds = fmtDate(d);
    total += daySum(ds); count += dayExpenses(ds).length;
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
function catColor(name) { return (state.categories.find(c=>c.name===name)?.color) || '#7a8ba3'; }
function catId(name) { return state.categories.find(c=>c.name===name)?.id || null; }

/* ---------- data: load dari Supabase ---------- */
export async function loadData() {
  const [catRes, expRes] = await Promise.all([
    supabase.from('categories').select('id,name,color').order('created_at'),
    supabase.from('expenses').select('id,amount,note,category_id,expense_date').order('expense_date'),
  ]);
  if (catRes.error) throw catRes.error;
  if (expRes.error) throw expRes.error;

  state.categories = catRes.data;
  const catIdToName = Object.fromEntries(catRes.data.map(c => [c.id, c.name]));
  state.expenses = (expRes.data || []).map(r => ({
    id: r.id,
    amount: Number(r.amount),
    note: r.note || '',
    category: r.category_id ? (catIdToName[r.category_id] || 'Lainnya') : 'Lainnya',
    date: r.expense_date,
  }));
}

/* ---------- write ke Supabase ---------- */
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

/* ---------- edit mode ---------- */
function editing() { return state.editingId ? state.expenses.find(e => e.id === state.editingId) : null; }

function enterEdit(e) {
  state.editingId = e.id;
  $('note').value = e.note;
  $('amount').value = e.amount;
  $('category').value = e.category;
  $('amountPreview').textContent = `≈ ${fmtRupiah(e.amount)}`;
  $('editBar').hidden = false;
  $('editTarget').textContent = e.note || 'catatan';
  $('expenseForm').querySelector('button[type="submit"]').textContent = 'Simpan Perubahan';
  document.querySelector('.input-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  state.editingId = null;
  $('note').value = ''; $('amount').value = ''; $('category').value = ''; $('amountPreview').textContent = '';
  $('editBar').hidden = true;
  $('expenseForm').querySelector('button[type="submit"]').textContent = 'Simpan Pengeluaran';
}

/* ---------- render ---------- */
function renderCategoryOptions() {
  const sel = $('category');
  sel.innerHTML = '<option value="">Kategori…</option>';
  state.categories.forEach(c => {
    const o=document.createElement('option'); o.value=c.name; o.textContent=c.name; sel.appendChild(o);
  });
}

function renderSummary() {
  const today = todayStr();
  const wk = rangeSum(weekRange().start, weekRange().end);
  const mo = rangeSum(monthRange(0).start, monthRange(0).end);
  $('todayTotal').textContent = fmtRupiah(daySum(today));
  $('weekTotal').textContent = fmtRupiah(wk.total);
  $('monthTotal').textContent = fmtRupiah(mo.total);
  $('monthCount').textContent = mo.count;
}

function renderCalendar() {
  const grid = $('calGrid');
  grid.querySelectorAll('.day').forEach(n=>n.remove());
  $('calTitle').textContent = `${MONTHS[state.viewMonth]} ${state.viewYear}`;
  const first = new Date(state.viewYear, state.viewMonth, 1);
  const startDow = (first.getDay()+6)%7;
  const dim = new Date(state.viewYear, state.viewMonth+1, 0).getDate();
  const prevDim = new Date(state.viewYear, state.viewMonth, 0).getDate();
  for (let i=startDow-1;i>=0;i--) appendDay(new Date(state.viewYear, state.viewMonth-1, prevDim-i), true);
  for (let d=1;d<=dim;d++) appendDay(new Date(state.viewYear, state.viewMonth, d), false);
  const count = grid.querySelectorAll('.day').length;
  for (let i=1;i<=7-(count%7||7);i++) appendDay(new Date(state.viewYear, state.viewMonth+1, i), true);
}

function appendDay(date, isDim) {
  const el=document.createElement('div');
  const ds=fmtDate(date);
  el.className='cal-day day'+(isDim?' dim':'');
  if (ds===todayStr()) el.classList.add('today');
  if (ds===state.selectedDate) el.classList.add('selected');
  el.textContent=date.getDate();
  if (daySum(ds)>0){ const dot=document.createElement('span'); dot.className='cal-dot'; el.appendChild(dot); }
  el.addEventListener('click',()=>{ state.selectedDate=ds; renderCalendar(); renderList(); });
  $('calGrid').appendChild(el);
}

function renderList() {
  const d = parse(state.selectedDate);
  const isToday = state.selectedDate===todayStr();
  $('dayTitle').textContent = isToday
    ? 'Pengeluaran Hari Ini'
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  $('selectedDateHint').textContent = isToday
    ? `Hari ini · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  $('clearDay').style.display = dayExpenses(state.selectedDate).length ? '' : 'none';

  const list=$('expenseList');
  list.innerHTML='';
  $('emptyMsg').style.display = dayExpenses(state.selectedDate).length ? 'none':'block';
  dayExpenses(state.selectedDate).forEach(e=>{
    const li=document.createElement('li'); li.className='expense-item';
    const left=document.createElement('div'); left.className='expense-left';
    const dot=document.createElement('span'); dot.className='cat-dot';
    dot.style.background = e.category?catColor(e.category):'#cdd2dc';
    const note=document.createElement('div'); note.className='expense-note';
    note.textContent=e.note||'Tanpa keterangan';
    const small=document.createElement('small'); small.textContent=e.category||'Lainnya'; note.appendChild(small);
    const right=document.createElement('div'); right.className='expense-right';
    const amt=document.createElement('span'); amt.className='expense-amount'; amt.textContent=fmtRupiah(e.amount);
    const edit=document.createElement('button'); edit.className='del-btn'; edit.textContent='✎'; edit.setAttribute('aria-label','Edit');
    edit.addEventListener('click',()=>{ if(state.editingId===e.id) cancelEdit(); else enterEdit(e); });
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.setAttribute('aria-label','Hapus');
    del.addEventListener('click', async ()=>{
      try { await deleteExpense(e.id); if(state.editingId===e.id) cancelEdit(); renderAll(); }
      catch (e) { logErr('Hapus gagal', e); }
    });
    left.append(dot,note); right.append(amt,edit,del); li.append(left,right); list.appendChild(li);
  });
}

function renderCategoryBars() {
  const { start, end } = monthRange(0);
  const byCat={}; let total=0;
  for (let d=new Date(start); d<=end; d=addDays(d,1)){
    dayExpenses(fmtDate(d)).forEach(e=>{ const c=e.category||'Lainnya'; byCat[c]=(byCat[c]||0)+e.amount; total+=e.amount; });
  }
  const bars=$('catBars'); bars.innerHTML='';
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $('catEmpty').style.display=entries.length?'none':'block';
  entries.forEach(([cat,amt])=>{
    const pct=total?Math.round(amt/total*100):0;
    const row=document.createElement('div'); row.className='cat-row';
    row.innerHTML=`<div class="cat-top"><span>${cat} · ${pct}%</span><span>${fmtRupiah(amt)}</span></div>
      <div class="cat-track"><div class="cat-fill" style="width:${pct}%;background:${catColor(cat)}"></div></div>`;
    bars.appendChild(row);
  });
}

export function renderAll(){
  renderCategoryOptions();
  renderSummary();
  renderCalendar();
  renderList();
  renderCategoryBars();
}

/* ---------- bind events ---------- */
export function bindEvents(){
  $('amount').addEventListener('input',()=>{
    const v=parseInt($('amount').value,10);
    $('amountPreview').textContent= v>=0&&!isNaN(v)?`≈ ${fmtRupiah(v)}`:'';
  });

  $('expenseForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const amount=parseInt($('amount').value,10);
    if(isNaN(amount)||amount<=0) return;
    const submitBtn=$('expenseForm').querySelector('button[type="submit"]');
    submitBtn.disabled=true;
    try {
      const payload = { amount, note: $('note').value.trim(), category: $('category').value || 'Lainnya' };
      if (state.editingId) {
        await updateExpense(state.editingId, payload);
        cancelEdit();
      } else {
        await addExpense(payload);
        $('amount').value=''; $('note').value=''; $('category').value=''; $('amountPreview').textContent='';
      }
      renderAll();
    } catch (e) { logErr('Simpan gagal', e); }
    finally { submitBtn.disabled=false; }
  });

  $('cancelEdit').addEventListener('click', cancelEdit);

  $('clearDay').addEventListener('click', async ()=>{
    if(!dayExpenses(state.selectedDate).length) return;
    if(confirm('Hapus semua pengeluaran tanggal ini?')){
      try { await clearDay(state.selectedDate); renderAll(); }
      catch (e) { logErr('Hapus gagal', e); }
    }
  });

  $('prevMonth').addEventListener('click',()=>{ state.viewMonth--; if(state.viewMonth<0){state.viewMonth=11;state.viewYear--;} renderCalendar(); });
  $('nextMonth').addEventListener('click',()=>{ state.viewMonth++; if(state.viewMonth>11){state.viewMonth=0;state.viewYear++;} renderCalendar(); });
}

const WEEKDAYS = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
