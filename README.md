# Simulator PKSK

Simulator PKSK ialah aplikasi web latihan PKSK untuk murid Tahun 6 dengan guest preview, akses premium dan admin panel.

Domain production:

```text
https://pksk.cikgustem.com
```

Stack:

- Vite
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vercel

## Commercial Access Model

Sistem menggunakan dua konsep berasingan:

- `role`: `user`, `admin`, `super_admin`
- `subscription_status`: `free`, `premium`, `expired`, `blocked`

Guest tanpa akaun bukan subscription user. Guest hanya boleh menggunakan Free Preview.

## Guest Preview

Pelawat boleh terus mencuba tanpa daftar dan tanpa log masuk:

- Bahagian A: maksimum 5 soalan
- Bahagian B: maksimum 5 soalan
- Tiada sejarah cubaan
- Tiada mata/level
- Tiada lencana
- Tiada dashboard prestasi penuh

Selepas preview selesai, aplikasi memaparkan paywall premium.

## Premium Subscription

Akaun premium mesti:

- berdaftar
- log masuk
- mempunyai `subscription_status = 'premium'`
- tidak blocked
- tarikh tamat masih aktif, atau lifetime

Premium mendapat akses kepada simulasi penuh, latihan mengikut bahagian, cabaran pantas, sejarah cubaan, pencapaian, mata, level dan lencana.

## Admin Panel

Route admin:

- `/admin`
- `/admin/users`
- `/admin/subscriptions`
- `/admin/questions`
- `/admin/settings`

Admin actions dibuat melalui secure RPC, bukan update terus dari frontend.

Admin boleh:

- melihat KPI pengguna dan cubaan
- melihat senarai pengguna termasuk email melalui RPC secure
- grant premium
- extend 30 hari, 6 bulan, 1 tahun atau lifetime
- revoke premium
- block/unblock user

Super admin sahaja boleh:

- promote user kepada admin
- remove admin role
- set role melalui `super_admin_set_role`

## Supabase SQL Order

Jalankan SQL ini dalam Supabase SQL Editor mengikut turutan:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/migrations/20260808_add_commercial_access.sql`

Migration komersial menambah:

- column access dalam `profiles`
- `subscription_plans`
- `subscription_history`
- `admin_audit_logs`
- `app_settings`
- RPC premium/access/admin
- settings free preview

## Create First Super Admin

1. Daftar akaun sendiri melalui aplikasi PKSK.
2. Buka Supabase Dashboard.
3. Pergi `Authentication` -> `Users`.
4. Klik user akaun anda.
5. Copy `User UID`.
6. Jalankan SQL ini dalam Supabase SQL Editor:

```sql
update public.profiles
set
  role = 'super_admin',
  subscription_status = 'premium',
  subscription_plan = 'lifetime',
  subscription_started_at = now(),
  subscription_ends_at = null,
  access_granted_at = now(),
  is_blocked = false
where id = 'PASTE_USER_UUID_DI_SINI';
```

Jangan hardcode UUID sebenar dalam GitHub.

## Supabase Auth Redirect

Untuk custom domain, tetapkan di Supabase:

`Authentication` -> `URL Configuration`

Site URL:

```text
https://pksk.cikgustem.com
```

Redirect URLs:

```text
https://pksk.cikgustem.com
https://pksk.cikgustem.com/**
https://pksk-nu.vercel.app
https://pksk-nu.vercel.app/**
http://localhost:5173
http://localhost:5173/**
http://localhost:5174/**
http://localhost:5175/**
http://localhost:5176/**
```

## Environment Variables

Buat fail `.env.local` untuk pembangunan lokal:

```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Dalam Vercel, masukkan nilai yang sama di:

`Project Settings` -> `Environment Variables`

Nama variable:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Selepas menambah environment variables, redeploy Vercel.

## Jalankan Projek

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output build berada dalam folder `dist`.

## Deploy Ke Vercel

Tetapan Vercel:

- Framework: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

## Import PDF Seterusnya

Skrip `scripts/extract_pdf_seed.py` boleh dijadikan asas untuk menjana seed SQL daripada PDF lain tanpa mengubah source React.

Contoh:

```bash
python scripts/extract_pdf_seed.py "C:/path/to/bank-soalan.pdf" --output supabase/seed-bank-baru.sql --source-code bank-baru-2026 --source-title "Bank Baru 2026"
```

Selepas SQL baharu dijana, semak kandungan dan jalankan di Supabase SQL Editor.
