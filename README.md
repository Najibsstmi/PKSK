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
- `/payment-result` status selepas pengguna kembali daripada ToyyibPay
- `/login` login
- `/register` register
- `/checkout` compatibility page yang membawa pengguna kembali ke Premium

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

## Payment Premium

Payment Premium menyokong dua kaedah:

- ToyyibPay untuk bayaran online banking dan aktivasi Premium automatik
- QR DuitNow + WhatsApp untuk bayaran manual yang masih disahkan oleh Admin

Flow semasa:

1. User buka `/premium`
2. Klik `Dapatkan Premium RM49`
3. Jika belum login, user isi nama, e-mel dan kata laluan dalam modal bayaran
4. Sistem cuba daftar akaun menggunakan maklumat tersebut, kemudian cipta bil ToyyibPay
5. User pilih kaedah bayaran:
   - ToyyibPay: sistem cipta bil dan redirect ke ToyyibPay
   - QR DuitNow: sistem kekalkan flow QR + WhatsApp manual
6. Untuk ToyyibPay, callback server-to-server akan update `payment_requests` kepada `paid`
7. Supabase aktifkan `profiles.subscription_status = 'premium'` dengan plan `lifetime`
8. User kembali ke `/payment-result` untuk log masuk dan semak status

Architecture payment diletakkan dalam `PaymentService`. `ToyyibPayService` memanggil Edge Function server-side, manakala `ManualPaymentService` mengekalkan flow QR DuitNow sedia ada.

## Commercial Access Model

Sistem menggunakan dua konsep berasingan:

- `role`: `user`, `admin`, `super_admin`
- `subscription_status`: `free`, `premium`, `expired`, `blocked`

Guest tanpa akaun bukan subscription user. Guest hanya boleh menggunakan Free Preview.

## Guest Preview

Pelawat boleh terus mencuba tanpa daftar dan tanpa log masuk:

- Bahagian A: maksimum 15 soalan
- Bahagian B: maksimum 20 soalan
- Bahagian C dikunci untuk preview percuma
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
6. `supabase/migrations/20260809_stabilize_question_bank_admin.sql`
7. `supabase/migrations/20260809_official_pksk_flow.sql`
8. `supabase/migrations/20260811_free_preview_and_question_assets.sql`
9. `supabase/migrations/20260811_manual_payment_requests.sql`
10. `supabase/migrations/20260811_public_question_counts.sql`
11. `supabase/migrations/20260811_toyyibpay_payments.sql`

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

Migration ToyyibPay menambah:

- column `payment_method`
- column `currency`
- column `provider_bill_code`
- column `provider_reference`
- column `external_reference`
- column `paid_at`
- column `provider_response`
- status payment `paid`, `failed` dan `cancelled`
- RPC `get_my_latest_payment_request`
- admin payment list dengan method ToyyibPay / QR Manual

## Bahagian C Penulisan

Bahagian C aktif untuk murid premium dan menggunakan tajuk rawak daripada bank soalan.

Flow murid:

1. Pilih `Bahagian C`
2. Sistem pilih satu tajuk karangan secara rawak daripada database
3. Murid pilih cara menjawab:
   - `Taip Jawapan`
   - `Imbas Jawapan`
   - `Upload Gambar / PDF`
4. Untuk gambar/PDF, sistem transkripsi dahulu dan murid menyemak teks sebelum pemarkahan
5. Murid sahkan jawapan untuk semakan AI
6. Jawapan disimpan dalam Supabase selepas submit
7. Sistem paparkan result dashboard dengan markah anggaran, pecahan rubrik, peta I-H-C-P, kekuatan dan cadangan penambahbaikan

Label keputusan AI:

```text
Markah Anggaran AI – Untuk Tujuan Latihan
```

Penilaian ini bukan markah rasmi PKSK/KPM. AI bertindak sebagai pemeriksa latihan, bukan penulis karangan penuh bagi pihak murid.

Endpoint server-side Vercel:

```text
/api/transcribe-writing
/api/grade-writing
```

`/api/transcribe-writing` digunakan untuk gambar/PDF sahaja. Teks asal murid dikekalkan dan kesalahan tidak dibetulkan sebelum murid mengesahkan transkripsi.

`/api/grade-writing` digunakan untuk menilai jawapan yang ditaip atau transkripsi yang telah disahkan murid.

Environment variable diperlukan:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Masukkan `OPENAI_API_KEY` di Vercel Project Settings > Environment Variables untuk Production. Untuk local development, tambah nilai sama dalam `.env.local` tetapi jangan commit fail tersebut.

Data Bahagian C disimpan dalam:

- `questions` untuk tajuk karangan
- `quiz_attempts` untuk rekod cubaan
- `attempt_questions` untuk tajuk yang dipilih
- `essay_responses` untuk jawapan karangan murid

Migration Bahagian C sedia ada sudah mencukupi untuk flow ini. Tiada migration baharu diperlukan untuk AI marking MVP kerana gambar/PDF diproses sementara dan tidak disimpan kekal.
## Admin Question Import

Workflow admin:

1. Buka `/admin/questions`
2. Klik `Import PDF`
3. Upload PDF
4. Klik `Ekstrak Soalan`
5. Semak draft
6. `Approve All High Confidence` atau pilih draft tertentu
7. Klik `Import Approved Questions`

Admin tidak perlu isi metadata satu per satu. Metadata seperti bahagian, kategori, topik, aras dan jawapan disimpan sebagai cadangan draft dahulu.

Workflow CSV:

1. Buka `/admin/questions`
2. Klik `Import Excel/CSV`
3. Download template CSV
4. Isi soalan objektif atau esei dalam template
5. Untuk soalan bergambar, upload gambar melalui modal CSV atau borang `Tambah Soalan`
6. Salin URL gambar ke kolum `question_image_url`
7. Upload CSV untuk import ke bank soalan

Kolum gambar pilihan jawapan juga disokong melalui `option_a_image_url`, `option_b_image_url`, `option_c_image_url` dan `option_d_image_url`.

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
- ekstrak teks PDF secara server-side tanpa menghantar PDF ke luar
- cuba pecahkan teks kepada draft Bahagian A, B dan C
- simpan draft ke staging table untuk disemak admin
- tidak expose secret ke frontend

Nota keselamatan: pemproses PDF semasa menggunakan parser teks tempatan. PDF tidak dihantar ke OpenAI atau provider luar. Jika PDF berbentuk scan/gambar, parser akan memaparkan mesej bahawa fail perlukan OCR atau AI extraction selepas pemilik projek memberi kebenaran jelas.

```text
supabase/functions/process-pdf-import/questionExtraction.ts
```

## Edge Function Environment

Untuk Edge Function:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Jangan letakkan `SUPABASE_SERVICE_ROLE_KEY` dalam Vercel frontend dan jangan guna prefix `VITE_`.

## Deploy Edge Function

Selepas login Supabase CLI dan link project:

```bash
npx supabase functions deploy process-pdf-import
```

Kemudian set secret server-side:

```bash
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

Jika PDF processor belum deploy, UI akan memaparkan mesej bahawa pemproses PDF belum aktif.

## ToyyibPay Edge Functions

Edge Functions:

```text
supabase/functions/create-toyyibpay-bill
supabase/functions/toyyibpay-callback
```

Set Supabase secrets server-side:

```bash
npx supabase secrets set TOYYIBPAY_SECRET_KEY=YOUR_SECRET_KEY
npx supabase secrets set TOYYIBPAY_CATEGORY_CODE=wgskyp3z
npx supabase secrets set TOYYIBPAY_BASE_URL=https://toyyibpay.com
```

Jangan letakkan `TOYYIBPAY_SECRET_KEY` dalam `.env.local`, Vercel frontend, React atau GitHub.

Deploy functions:

```bash
npx supabase functions deploy create-toyyibpay-bill
npx supabase functions deploy toyyibpay-callback
```

Callback URL untuk ToyyibPay:

```text
https://lwsmerjraxmtwhuioseo.supabase.co/functions/v1/toyyibpay-callback
```

Dalam ToyyibPay, pastikan category code menggunakan:

```text
wgskyp3z
```

Return URL:

```text
https://pksk.cikgustem.com/payment-result
```

Callback URL:

```text
https://lwsmerjraxmtwhuioseo.supabase.co/functions/v1/toyyibpay-callback
```

ToyyibPay callback ialah sumber utama untuk aktifkan Premium. Route `/payment-result` hanya menyemak status daripada Supabase dan tidak mengaktifkan Premium berdasarkan query parameter browser.

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
