# Simulator PKSK

Simulator PKSK ialah aplikasi web Fasa 1 untuk membantu murid Tahun 6 bersedia menghadapi Pentaksiran Kemasukan Sekolah Khusus.

Fasa ini memberi tumpuan kepada asas yang stabil dan boleh deploy:

- Dashboard utama
- Tiga mod latihan: Simulasi Penuh, Latihan Mengikut Bahagian, Cabaran Pantas
- Borang maklumat calon
- Navigasi aplikasi
- Panduan ringkas bahagian PKSK
- Paparan pencapaian asas

Bank soalan penuh belum dimasukkan dalam Fasa 1 supaya aplikasi ringan, stabil, dan mudah dikembangkan.

## Jalankan Projek

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output build akan berada dalam folder `dist`.

## Deploy Ke Vercel

Tetapan yang digunakan:

- Framework: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Fail `vercel.json` telah disediakan supaya laluan React Router berfungsi selepas deploy.
