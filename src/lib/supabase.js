import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase belum dikonfigurasi. Salin .env.example ke .env dan isi VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.'
  );
}

// Catatan: tanpa auth. Tabel open (RLS dimatikan), akses via anon key. Lihat schema.sql.
export const supabase = createClient(url, anonKey);