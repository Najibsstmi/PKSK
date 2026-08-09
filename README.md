# PKSK Academy oleh CikguSTEM

PKSK Academy oleh CikguSTEM ialah platform latihan PKSK untuk murid Tahun 6 dengan guest preview, akses premium dan admin panel.

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

## Route Architecture

Public marketing website:

- `/` landing page PKSK Academy
- `/preview` free preview
- `/premium` premium sales page
- `/login` login
- `/register` register
- `/checkout` placeholder payment gateway masa depan

Premium application:

- `/app` dashboard PKSK Academy
- `/app/simulasi`
- `/app/latihan`
- `/app/pencapaian`
- `/app/lencana`
- `/app/sejarah`
- `/app/panduan`

Compatibility redirect sementara:

- `/simulasi` -> `/app/simulasi`
- `/latihan` -> `/app/latihan`
- `/performance` -> `/app/pencapaian`
- `/history` -> `/app/sejarah`
- `/achievements` -> `/app/lencana`
- `/guide` -> `/app/panduan`

## Payment Gateway Future Flow

Payment belum dibina dalam fasa ini. Route `/checkout` hanya placeholder.

Flow masa depan:

1. User register atau login
2. User masuk checkout
3. Payment provider sahkan bayaran
4. Server webhook update Supabase
5. Supabase set `subscription_status = 'premium'`
6. Supabase set `subscription_started_at` dan `subscription_ends_at`
7. User redirect ke `/app`

Premium activation mesti melalui server webhook. Jangan percaya parameter frontend seperti `?paid=true`.

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
- `/admin/questions/import`
- `/admin/questions/import-history`
- `/admin/settings`

Admin actions dibuat melalui secure RPC, bukan update terus dari frontend.

Admin boleh:

- melihat KPI pengguna dan cubaan
- melihat senarai pengguna termasuk email melalui RPC secure
- grant premium
- extend 30 hari, 6 bulan, 1 tahun atau lifetime
- revoke premium
- block/unblock user
- tambah soalan manual ringkas
- upload PDF untuk import bank soalan
- semak draft soalan sebelum publish
- batch approve/reject draft
- activate/deactivate/archive soalan

Super admin sahaja boleh:

- promote user kepada admin
- remove admin role
- set role melalui `super_admin_set_role`

## Supabase SQL Order

Jalankan SQL ini dalam Supabase SQL Editor mengikut turutan:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/migrations/20260808_add_commercial_access.sql`
4. `supabase/migrations/20260809_enable_bahagian_c_essay.sql`
5. `supabase/migrations/20260809_add_pdf_question_import.sql`

Migration komersial menambah:

- column access dalam `profiles`
- `subscription_plans`
- `subscription_history`
- `admin_audit_logs`
- `app_settings`
- RPC premium/access/admin
- settings free preview

Migration import PDF menambah:

- `question_imports`
- `imported_question_drafts`
- `imported_question_draft_options`
- `question_assets`
- `option_image_url` pada `question_options`
- support `essay_min_words` dan `essay_time_limit`
- storage bucket `question-imports`
- storage bucket `question-assets`
- RPC admin untuk upload record, review draft, batch approve dan publish approved questions

## Bahagian C Penulisan

Bahagian C sudah aktif untuk murid. Kad Bahagian C tidak dikunci.

Flow murid:

1. Pilih `Bahagian C`
2. Sistem pilih tajuk karangan secara rawak daripada database
3. Murid menulis dalam editor moden
4. Sistem kira jumlah perkataan
5. Timer berjalan semasa menulis
6. Jawapan autosave
7. Murid tekan `Hantar Karangan`
8. Jawapan disimpan dalam Supabase
9. Sistem paparkan mesej bahawa karangan berjaya dihantar

AI marking belum dibina dalam Fasa ini. Selepas murid hantar, aplikasi akan memaklumkan:

```text
Karangan berjaya dihantar.
AI marking akan ditambah pada versi akan datang.
```

Data Bahagian C disimpan dalam:

- `questions` untuk tajuk karangan
- `quiz_attempts` untuk rekod cubaan
- `attempt_questions` untuk tajuk yang dipilih
- `essay_responses` untuk jawapan karangan murid

Migration Bahagian C juga menambah RPC untuk mula cubaan, autosave dan hantar karangan.

## Admin Question Import

Workflow admin:

1. Buka `/admin/questions`
2. Klik `Import PDF`
3. Upload PDF
4. Klik `Process PDF`
5. Semak draft
6. `Approve All High Confidence` atau pilih draft tertentu
7. Klik `Import Approved Questions`

Admin tidak perlu isi metadata satu per satu. Metadata seperti bahagian, kategori, topik, aras dan jawapan disimpan sebagai cadangan draft dahulu.

## Supabase Storage

Migration import PDF akan mencipta bucket:

```text
question-imports
question-assets
```

`question-imports` ialah private bucket untuk PDF asal.

`question-assets` ialah public bucket untuk gambar/rajah soalan yang perlu dipaparkan dalam quiz.

## PDF Processing

Edge Function:

```text
supabase/functions/process-pdf-import
```

Function ini:

- sahkan pengguna ialah `admin` atau `super_admin`
- download PDF dari private Supabase Storage
- update status import
- simpan draft ke staging table
- tidak expose secret ke frontend

Nota keselamatan: external AI extraction dimatikan dahulu. PDF tidak dihantar ke OpenAI atau provider luar sehingga pemilik projek memberi kebenaran jelas. Bila dibenarkan, sambungan provider dibuat di:

```text
supabase/functions/process-pdf-import/questionExtraction.ts
```

## AI Environment Variables

Untuk Edge Function:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

`OPENAI_API_KEY` jangan diletakkan dalam Vercel frontend dan jangan guna prefix `VITE_`.

## Deploy Edge Function

Selepas login Supabase CLI dan link project:

```bash
npx supabase functions deploy process-pdf-import
```

Kemudian set secret server-side:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

Jika PDF processor belum deploy, UI akan memaparkan mesej bahawa pemproses PDF belum aktif.

## Jika Muncul Mesej Sistem Akses Premium

Jika aplikasi memaparkan mesej "Sistem akses premium sedang disiapkan", maksudnya kod production sudah dikemaskini tetapi SQL komersial belum siap di Supabase.

Jalankan fail ini dalam Supabase SQL Editor:

```text
supabase/migrations/20260808_add_commercial_access.sql
```

Selepas SQL berjaya dijalankan, tunggu 1-2 minit dan refresh laman production.

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

Gunakan admin UI di:

```text
/admin/questions/import
```

Skrip `scripts/extract_pdf_seed.py` hanya tinggal sebagai alat sokongan lama untuk jana seed SQL secara manual.
