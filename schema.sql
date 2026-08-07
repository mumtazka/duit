-- ============================================
-- Schema Supabase: Catatan Pengeluaran
-- Jalankan di SQL Editor (Supabase Dashboard)
-- ============================================

-- Ekstensi untuk UUID
create extension if not exists "pgcrypto";

-- ---------- TABEL ----------

-- Profil tersinkron dengan auth.users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

-- Kategori pengeluaran milik user
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text default '#4f6bf5',
  created_at timestamptz default now(),
  unique (user_id, name)
);

-- Catatan pengeluaran
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  amount bigint not null check (amount > 0),
  note text,
  expense_date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indeks untuk query cepat
create index idx_expenses_user_date on public.expenses (user_id, expense_date);
create index idx_expenses_category on public.expenses (category_id);
create index idx_categories_user on public.categories (user_id);

-- ---------- ROW LEVEL SECURITY ----------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

-- profil: hanya pemilik
create policy "profiles select_own"  on public.profiles for select using (auth.uid() = id);
create policy "profiles insert_own"  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update_own"  on public.profiles for update using (auth.uid() = id);

-- categories: hanya pemilik
create policy "categories all_own" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- expenses: hanya pemilik
create policy "expenses all_own" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- TRIGGER: auto buat profil & updated_at ----------

-- buat profil otomatis saat user daftar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  -- + kategori default user baru
  insert into public.categories (user_id, name, color) values
    (new.id, 'Makan',      '#30a46c'),
    (new.id, 'Transport',  '#4f6bf5'),
    (new.id, 'Belanja',    '#f5a524'),
    (new.id, 'Hiburan',    '#8e4ec6'),
    (new.id, 'Lainnya',    '#7a8ba3')
  on conflict (user_id, name) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at otomatis
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute procedure public.touch_updated_at();

-- ============================================
-- Contoh Query Ringkasan
-- ============================================

-- Total bulan ini (per user)
-- select coalesce(sum(amount), 0) as total
-- from public.expenses
-- where user_id = auth.uid()
--   and expense_date >= date_trunc('month', now());

-- Total per kategori (bulan ini, urut terbesar)
-- select c.name, coalesce(sum(e.amount), 0) as total
-- from public.expenses e
-- left join public.categories c on c.id = e.category_id
-- where e.user_id = auth.uid()
--   and e.expense_date >= date_trunc('month', now())
-- group by c.name
-- order by total desc;