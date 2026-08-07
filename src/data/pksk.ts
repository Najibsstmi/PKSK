import type { PkskSection, PracticeMode } from "../types";

export const practiceModes: PracticeMode[] = [
  {
    id: "full",
    title: "Simulasi Penuh",
    subtitle: "Latihan berstruktur mengikut aliran PKSK sebenar.",
    duration: "90 minit",
    focus: "Profil, arahan, pemasa dan ringkasan prestasi.",
    status: "Fasa 1",
    accent: "ocean",
  },
  {
    id: "section",
    title: "Latihan Mengikut Bahagian",
    subtitle: "Pilih satu bahagian untuk bina keyakinan sedikit demi sedikit.",
    duration: "15-30 minit",
    focus: "Bahagian A, B dan C disediakan sebagai modul.",
    status: "Sedia",
    accent: "leaf",
  },
  {
    id: "quick",
    title: "Cabaran Pantas",
    subtitle: "Sesi pendek untuk ulang kaji sebelum atau selepas sekolah.",
    duration: "10 minit",
    focus: "Pemanas minda dan sasaran harian.",
    status: "Sedia",
    accent: "coral",
  },
];

export const pkskSections: PkskSection[] = [
  {
    title: "Bahagian A",
    label: "Kecerdasan Insaniah",
    description:
      "Menilai nilai diri, sikap, minat, kepimpinan dan cara calon membuat pilihan dalam situasi harian.",
    examples: ["Nilai murni", "Sikap belajar", "Tanggungjawab", "Kerjasama"],
  },
  {
    title: "Bahagian B",
    label: "Kecerdasan Intelek",
    description:
      "Melatih pemikiran logik, bahasa, matematik, pengetahuan am dan keupayaan menyelesaikan masalah.",
    examples: ["Logik", "Matematik", "Bahasa", "Pengetahuan am"],
  },
  {
    title: "Bahagian C",
    label: "Artikulasi Penulisan",
    description:
      "Membantu calon menyusun idea, membina perenggan dan menulis jawapan yang jelas dalam masa terhad.",
    examples: ["Idea utama", "Huraian", "Contoh", "Penutup"],
  },
];

export const states = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "W.P. Kuala Lumpur",
  "W.P. Labuan",
  "W.P. Putrajaya",
];
