-- ============================================
-- Schema Supabase: Catatan Pengeluaran (single-user)
-- Tanpa auth. Semua akses via anon key.
-- Jalankan di SQL Editor (Supabase Dashboard).
-- AMAN dijalankan ulang (idempotent).
-- ============================================

-- ---------- Bersihkan sisa versi lama ----------
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists set_expenses_updated_at on public.expenses;
drop function if exists public.handle_new_user();
drop function if exists public.touch_updated_at();
drop table if exists public.expenses;
drop table if exists public.categories;
drop table if exists public.profiles;

-- Ekstensi untuk UUID
create extension if not exists "pgcrypto";

-- ---------- TABEL ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#4f6bf5',
  created_at timestamptz default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  amount bigint not null check (amount > 0),
  note text,
  expense_date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_expenses_date on public.expenses (expense_date);
create index idx_expenses_category on public.expenses (category_id);

-- ---------- RLS: terbuka (anon key bisa baca/tulis) ----------
-- Satu pemakai saja, RLS tidak dipakai.
alter table public.categories disable row level security;
alter table public.expenses disable row level security;

-- Sisipkan kategori default
insert into public.categories (name, color) values
  ('Makan',       '#30a46c'),
  ('Transport',   '#4f6bf5'),
  ('Belanja',     '#f5a524'),
  ('Hiburan',     '#8e4ec6'),
  ('Lainnya',     '#7a8ba3')
on conflict (name) do nothing;

-- ---------- updated_at otomatis ----------
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
-- Contoh Query
-- ============================================

-- Total bulan ini
-- select coalesce(sum(amount), 0) as total
-- from public.expenses
-- where expense_date >= date_trunc('month', now());

-- Total per kategori (bulan ini, urut terbesar)
-- select c.name, coalesce(sum(e.amount), 0) as total
-- from public.expenses e
-- left join public.categories c on c.id = e.category_id
-- where e.expense_date >= date_trunc('month', now())
-- group by c.name
-- order by total desc;