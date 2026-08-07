import { supabase } from './lib/supabase.js';

const PALETTE = ['#4f6bf5','#30a46c','#e5484d','#f5a524','#8e4ec6','#f0683d','#e5357f','#7a8ba3','#5c7cfa'];
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const WEEKDAY = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

const state = {
  expenses: [],      // {id, amount, note, category, date}
  categories: [],    // {id, name, color}
  selectedDate: todayStr(),
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  weekOffset: 0,
  monthOffset: 0,
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
function weekRange(offset) { const s=addDays(weekStart(), offset*7); return { start:s, end:addDays(s,6) }; }
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

async function addCategory(name) {
  const { data, error } = await supabase.from('categories').insert({
    name, color: PALETTE[state.categories.length % PALETTE.length],
  }).select('id,name,color').single();
  if (error) {
    // jika sudah ada (duplicate) muat ulang kategori saja
    if (error.code === '23505') { await loadData(); return; }
    throw error;
  }
  state.categories.push(data);
}

/* ---------- render ---------- */
export function renderCategoryOptions() {
  const sel = $('category');
  sel.innerHTML = '<option value="">Kategori…</option>';
  state.categories.forEach(c => {
    const o=document.createElement('option'); o.value=c.name; o.textContent=c.name; sel.appendChild(o);
  });
}

function renderSummary() {
  const m = monthRange(0);
  const r = rangeSum(m.start, m.end);
  $('periodTotal').textContent = fmtRupiah(r.total);
  $('periodLabel').textContent = `${MONTHS[m.start.getMonth()]} ${m.start.getFullYear()}`;
  $('monthBadge').textContent = `${MONTHS[m.start.getMonth()]} ${m.start.getFullYear()}`;
  $('todayTotal').textContent = fmtRupiah(daySum(todayStr()));
  $('countTotal').textContent = r.count;
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
  $('dayTitle').textContent = state.selectedDate===todayStr()
    ? 'Pengeluaran Hari Ini'
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕'; del.setAttribute('aria-label','Hapus');
    del.addEventListener('click', async ()=>{
      try { await deleteExpense(e.id); renderAll(); }
      catch (e) { logErr('Hapus gagal', e); }
    });
    left.append(dot,note); right.append(amt,del); li.append(left,right); list.appendChild(li);
  });
}

function renderWeekly() {
  const { start, end } = weekRange(state.weekOffset);
  const grid=$('weekGrid'); grid.innerHTML='';
  $('weekTitle').textContent = (start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear())
    ? `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  for (let i=0;i<7;i++){
    const day=addDays(start,i); const ds=fmtDate(day); const amt=daySum(ds);
    const cell=document.createElement('div');
    cell.className='week-cell '+(ds===todayStr()?'today ':'')+(amt>0?'has':'zero');
    cell.innerHTML=`<span class="wd">${WEEKDAY[i]}</span><span class="dd">${day.getDate()}</span><span class="amt">${amt>0?compact(amt):'—'}</span>`;
    cell.addEventListener('click',()=>{ state.viewYear=day.getFullYear(); state.viewMonth=day.getMonth(); state.selectedDate=ds; switchView('daily'); renderCalendar(); renderList(); });
    grid.appendChild(cell);
  }
}

function renderMonthly(){
  const { start, end } = monthRange(state.monthOffset);
  $('monthTitle').textContent=`${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  const r=rangeSum(start,end);
  const avg = r.count?Math.round(r.total/r.count):0;
  $('monthStats').innerHTML=`
    <div class="mstat"><span class="label">Total</span><strong>${fmtRupiah(r.total)}</strong></div>
    <div class="mstat"><span class="label">Catatan</span><strong>${r.count}</strong></div>
    <div class="mstat"><span class="label">Rata/note</span><strong>${fmtRupiah(avg)}</strong></div>`;
  const chart=$('monthChart'); chart.innerHTML='';
  const sums=[];
  for (let d=new Date(start); d<=end; d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)) sums.push(daySum(fmtDate(d)));
  const max=Math.max(...sums,1);
  sums.forEach(v=>{
    const bar=document.createElement('div');
    bar.className='chart-bar'+(v>0?' full':'');
    bar.style.height=`${Math.max(0.1,(v/max)*100)}%`;
    bar.title=v>0?fmtRupiah(v):'';
    chart.appendChild(bar);
  });
  renderCategoryBars(start,end);
}

function renderCategoryBars(start,end){
  const byCat={}; let total=0;
  for (let d=new Date(start); d<=end; d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
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

export function switchView(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name));
  $('view-daily').hidden=name!=='daily';
  $('view-weekly').hidden=name!=='weekly';
  $('view-monthly').hidden=name!=='monthly';
  if(name==='weekly') renderWeekly();
  if(name==='monthly') renderMonthly();
}

export function renderAll(){
  renderCategoryOptions();
  renderSummary();
  renderCalendar();
  renderList();
  renderWeekly();
  renderMonthly();
}

/* ---------- bind events ---------- */
export function bindEvents(){
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>switchView(t.dataset.view)));

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
      await addExpense({ amount, note: $('note').value.trim(), category: $('category').value || 'Lainnya' });
      $('amount').value=''; $('note').value=''; $('category').value=''; $('amountPreview').textContent='';
      renderAll();
    } catch (e) { logErr('Simpan gagal', e); }
    finally { submitBtn.disabled=false; }
  });

  $('clearDay').addEventListener('click', async ()=>{
    if(!dayExpenses(state.selectedDate).length) return;
    if(confirm('Hapus semua pengeluaran tanggal ini?')){
      try { await clearDay(state.selectedDate); renderAll(); }
      catch (e) { logErr('Hapus gagal', e); }
    }
  });

  $('prevMonth').addEventListener('click',()=>{ state.viewMonth--; if(state.viewMonth<0){state.viewMonth=11;state.viewYear--;} renderCalendar(); });
  $('nextMonth').addEventListener('click',()=>{ state.viewMonth++; if(state.viewMonth>11){state.viewMonth=0;state.viewYear++;} renderCalendar(); });
  $('prevWeek').addEventListener('click',()=>{ state.weekOffset--; renderWeekly(); });
  $('nextWeek').addEventListener('click',()=>{ state.weekOffset++; renderWeekly(); });
  $('prevM').addEventListener('click',()=>{ state.monthOffset--; renderMonthly(); });
  $('nextM').addEventListener('click',()=>{ state.monthOffset++; renderMonthly(); });
}