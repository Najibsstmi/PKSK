# Simulator PKSK

Simulator PKSK ialah aplikasi web Fasa 1 untuk membantu murid Tahun 6 bersedia menghadapi Pentaksiran Kemasukan Sekolah Khusus.

Fasa ini fokus kepada aplikasi yang stabil, cerah, moden, dan boleh deploy:

- Dashboard calon
- Log masuk dan daftar akaun melalui Supabase Auth
- Profil murid
- Mod latihan penuh, latihan mengikut bahagian, dan cabaran pantas
- Soalan objektif yang dibaca daripada Supabase
- Pemilihan soalan secara rawak setiap kali simulasi bermula
- Susunan pilihan jawapan rawak dan disimpan untuk setiap percubaan
- Skor, XP, level, sejarah latihan, dan lencana pencapaian
- Struktur database yang boleh menyokong ribuan soalan

Soalan tidak disimpan dalam source React. PDF pertama hanya digunakan untuk menghasilkan seed data Supabase.

## Struktur Supabase

Jalankan SQL ini dalam Supabase SQL Editor mengikut turutan:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

`schema.sql` membina table, polisi keselamatan, fungsi rawak soalan, fungsi semak jawapan, dan sistem lencana.
`seed.sql` memasukkan bank soalan pertama daripada `tips pksk 2026.pdf`.

Table utama:

- `questions`
- `question_options`
- `question_sources`
- `quiz_attempts`
- `attempt_questions`
- `attempt_question_options`
- `attempt_answers`
- `profiles`
- `badges`
- `user_badges`
- `xp_history`

Jawapan betul disimpan dalam `question_options.is_correct`, tetapi React tidak membaca column itu secara terus. App menggunakan fungsi Supabase untuk menghantar jawapan dan menerima markah.

## Environment Variables

Buat fail `.env.local` untuk pembangunan lokal:

```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Dalam Vercel, masukkan nilai yang sama di:

`Project Settings` -> `Environment Variables`

Nama variable yang diperlukan:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

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

Selepas SQL Supabase dijalankan dan environment variables dimasukkan, push ke branch `main` akan mencetuskan production deployment baharu.

## Import PDF Seterusnya

Skrip `scripts/extract_pdf_seed.py` boleh dijadikan asas untuk menjana seed SQL daripada PDF lain tanpa mengubah source React.

Contoh:

```bash
python scripts/extract_pdf_seed.py "C:/path/to/bank-soalan.pdf" --output supabase/seed-bank-baru.sql --source-code bank-baru-2026 --source-title "Bank Baru 2026"
```

Selepas SQL baharu dijana, semak kandungan dan jalankan di Supabase SQL Editor.
