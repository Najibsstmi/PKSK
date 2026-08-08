-- Simulator PKSK seed data from PDF.
-- Copy and paste this file into Supabase SQL Editor after running supabase/schema.sql.
-- Questions: 103

do $$
declare
  v_source_id uuid;
  v_question_id uuid;
  v_question jsonb;
  v_option jsonb;
begin
  insert into public.question_sources (code, title, source_type, source_note)
  values ('tips-pksk-2026', 'tips pksk 2026.pdf', 'pdf', 'Generated from tips pksk 2026.pdf; source PDF is used as the first question bank only.')
  on conflict (code) do update set
    title = excluded.title,
    source_type = excluded.source_type,
    source_note = excluded.source_note,
    imported_at = now()
  returning id into v_source_id;

  for v_question in
    select value from jsonb_array_elements($questions$
[
  {
    "source_key": "tips-pksk-2026-A-001",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Kamu melihat rakan sekelas diganggu oleh pelajar lain. Apa yang kamu lakukan?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Buat tidak tahu",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Membela rakan tersebut atau lapor guru",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Menyokong pelajar yang mengganggu",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Menjauhkan diri dari semua pihak",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-002",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Jika kamu gagal dalam ujian penting, apa reaksi kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menyalahkan guru",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Berusaha memperbaiki diri",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tidak kisah",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Marah pada rakan",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-003",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Rakan kamu meminta bantuan menyiapkan kerja kumpulan. Kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menolak terus",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Membantu sebahagian sahaja",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Membantu sepenuhnya",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Mengabaikannya",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-004",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Kamu kehilangan barang di sekolah. Apa yang kamu buat dahulu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menuduh orang lain mencuri",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menangis sahaja",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Mencari dan bertanya pada guru",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Biarkan sahaja",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-005",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Apabila guru memuji hasil kerja kamu di hadapan kelas, kamu rasa…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Malu tapi gembira",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Bangga dan berusaha lebih baik",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tiada perasaan",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Rasa iri pada diri sendiri",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-006",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika ada kawan baru yang pemalu, kamu akan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Membiarkan dia sendirian",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menyapanya dan mengajak berbual",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Ketawakan dia",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Menunggu dia datang dahulu",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-007",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Apabila guru memberi tugasan berkumpulan, kamu lebih suka…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Bekerja sendirian",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menguasai kumpulan sepenuhnya",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Bekerja sama dan beri idea",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Biarkan rakan lain buat semua kerja",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-008",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika kawan kamu murung, apa reaksi kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menghiburkan atau menasihatinya",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Mengabaikannya",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Mengejeknya",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Melaporkan kepada guru sahaja",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-009",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Kamu dipilih jadi ketua kelas. Tindakan kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menolak tanggungjawab",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menerima dan cuba pimpin dengan baik",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Hanya jalankan tugas bila disuruh guru",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Serahkan tugas kepada rakan lain",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-010",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika ternampak rakan membuang sampah merata-rata, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menegur dengan baik",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Ikut buang juga",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Biarkan sahaja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Lapor guru tanpa menegur",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-011",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Dalam perbincangan kumpulan, rakan kamu tidak bersetuju dengan idea kamu. Kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Marah dan tinggalkan kumpulan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Dengar dan bincang semula",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Paksa mereka terima idea kamu",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tidak mahu bercakap langsung",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-012",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika guru menegur kamu di hadapan kelas, kamu akan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Rasa malu tapi terima teguran",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Marah dan merungut",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Ketawa sahaja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tidak peduli",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-013",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Apabila rakan kamu menang pertandingan, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Ucap tahniah",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Iri hati dan menjauhi",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tidak kisah",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Merendah-rendahkannya",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-014",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika kamu jatuh ketika berlari di padang, apa yang kamu harapkan dari rakan?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Mereka ketawa",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Mereka membantu kamu",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Mereka tinggalkan kamu",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Mereka ambil gambar kamu",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-015",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Apabila guru meminta sukarelawan membersihkan kelas, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Mengelak",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menyertai tanpa dipaksa",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Hanya buat jika rakan buat",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Buat alasan tidak boleh",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-016",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Jika kamu mendapat markah tinggi, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Sombong kepada rakan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Berkongsi tips belajar dengan rakan",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Senyap sahaja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Mengejek rakan yang gagal",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-017",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika rakan kamu sering datang lewat, apa nasihat kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Tidak perlu nasihat",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Nasihat dengan baik",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Marah-marah",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Laporkan sahaja tanpa bercakap",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-018",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Kamu sedang marah. Apa tindakan terbaik?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menjerit dan memukul",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Tarik nafas dan bertenang",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Simpan marah sampai dendam",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Menyalahkan orang lain",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-019",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Jika ada program gotong-royong sekolah, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Tidak hadir",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Datang tapi duduk sahaja",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Turut serta aktif",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Cari alasan untuk balik awal",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-020",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Jika kamu ditegur kerana kesilapan, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Membalas balik",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Mengaku salah dan belajar dari kesilapan",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tidak peduli",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Salahkan orang lain",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-021",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Kawan kamu ketinggalan dalam pelajaran. Apa yang kamu buat?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Gelakkan dia",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Ajak belajar bersama",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Biarkan sahaja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Jauhkan diri daripadanya",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-022",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Kamu melihat rakan berkelahi. Apa tindakan kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Masuk campur bergaduh",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Cuba meleraikan dan lapor guru",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Menonton sahaja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Rakam video untuk seronok",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-023",
    "question_type": "objective",
    "section": "A",
    "category": "SQ",
    "topic": "Nilai dan Tanggungjawab",
    "difficulty": "medium",
    "question_text": "Kamu diberi peluang jadi pengawas. Apa reaksi kamu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Terima dengan tanggungjawab",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Tolak tanpa sebab",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Ambil jawatan tapi malas bekerja",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Suruh orang lain ambil",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-024",
    "question_type": "objective",
    "section": "A",
    "category": "SQ",
    "topic": "Nilai dan Tanggungjawab",
    "difficulty": "medium",
    "question_text": "Apabila guru minta pendapat, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Diam sahaja",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Memberi idea dengan yakin",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Bergantung pada rakan",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Menolak beri pendapat",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-025",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Kamu terlihat rakan menipu dalam ujian. Kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Tegur atau lapor guru",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Ikut meniru sama",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Buat tidak tahu",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Senyum sahaja",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-026",
    "question_type": "objective",
    "section": "A",
    "category": "SQ",
    "topic": "Nilai dan Tanggungjawab",
    "difficulty": "medium",
    "question_text": "Jika ibu bapa marah kerana prestasi menurun, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Melawan cakap mereka",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menerima dan berusaha baiki",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Diam dan tidak peduli",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Salahkan guru",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-027",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Dalam permainan berkumpulan, pasukan kamu kalah. Kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menyalahkan ahli pasukan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Terima kekalahan dengan baik",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Marah-marah dan merajuk",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tidak mahu bermain lagi",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-028",
    "question_type": "objective",
    "section": "A",
    "category": "SSQ",
    "topic": "Kemahiran Sosial",
    "difficulty": "medium",
    "question_text": "Jika rakan kamu menangis, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Biarkan dia",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Menenangkan dan bertanya masalah",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Mengejeknya",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Mengambil gambar",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-029",
    "question_type": "objective",
    "section": "A",
    "category": "SQ",
    "topic": "Nilai dan Tanggungjawab",
    "difficulty": "medium",
    "question_text": "Apabila guru beri tugasan last-minute, kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Mengeluh dan tidak buat",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Cuba siapkan sebaik mungkin",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Minta orang lain buatkan",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Abaikan",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-A-030",
    "question_type": "objective",
    "section": "A",
    "category": "EQ",
    "topic": "Emosi dan Sahsiah",
    "difficulty": "medium",
    "question_text": "Kamu diminta bagi ucapan di perhimpunan sekolah. Kamu…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Menolak terus",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Cuba walaupun gementar",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Diam di atas pentas",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Larikan diri",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-001",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Susunan nombor berikut: 2, 4, 8, 16, … Apakah nombor seterusnya?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "18",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "20",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "24",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "32",
        "is_correct": true,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-002",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Jika semua mawar adalah bunga, dan semua bunga adalah tumbuhan, maka…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Semua tumbuhan ialah mawar",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Semua bunga ialah tumbuhan",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Semua tumbuhan ialah bunga",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Semua bunga bukan tumbuhan",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-003",
    "question_type": "objective",
    "section": "B",
    "category": "Logik",
    "topic": "Penaakulan",
    "difficulty": "medium",
    "question_text": "Cari pasangan yang berbeza:",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Kucing",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Harimau",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Singa",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Burung",
        "is_correct": true,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-004",
    "question_type": "objective",
    "section": "B",
    "category": "Logik",
    "topic": "Penaakulan",
    "difficulty": "medium",
    "question_text": "Ali lebih tinggi daripada Abu. Badrul lebih rendah daripada Ali. Siapakah paling rendah?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Ali",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Abu",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Badrul",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tidak pasti",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-005",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika 5 × 5 = 25, maka 25 ÷ 5 = ?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "10",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "5",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "25",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "0",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-006",
    "question_type": "objective",
    "section": "B",
    "category": "Logik",
    "topic": "Penaakulan",
    "difficulty": "medium",
    "question_text": "Cari perkataan yang boleh disusun daripada huruf ini: A, P, L, E",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "PAEL",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "PEAL",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "LEAP",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "PELA",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-007",
    "question_type": "objective",
    "section": "B",
    "category": "Logik",
    "topic": "Penaakulan",
    "difficulty": "medium",
    "question_text": "Jika hari ini Selasa, hari selepas lusa ialah?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Jumaat",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Sabtu",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Ahad",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Isnin",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-008",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Dalam satu kotak ada 6 bola merah, 4 bola biru, dan 2 bola hijau. Ambil 1 bola secara rawak, warna manakah paling tinggi kebarangkalian?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Hijau",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Biru",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Merah",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Sama sahaja",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-009",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika jam menunjukkan 9:15, berapakah sudut antara jarum jam dan minit?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "0°",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "45°",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "90°",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "180°",
        "is_correct": true,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-010",
    "question_type": "objective",
    "section": "B",
    "category": "Logik",
    "topic": "Penaakulan",
    "difficulty": "medium",
    "question_text": "Lengkapkan pola: ■ ▲ ■ ▲ …",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "■",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "▲",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "●",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "▼",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-011",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "3/4 + 1/2 = ?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "1",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "1¼",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "1½",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "2",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-012",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Nilai 35% daripada 200 ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "35",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "70",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "75",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "80",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-013",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Sebuah segi tiga mempunyai sisi 3 cm, 4 cm, 5 cm. Apakah jenis segi tiga itu?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Siku-siku",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Sama sisi",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Sama kaki",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tumpul",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-014",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "120 ÷ 8 = ?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "12",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "14",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "15",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "16",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-015",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika 2x + 5 = 15, nilai x = ?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "3",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "4",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "5",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "6",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-016",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "1 km bersamaan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "10 m",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "100 m",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "1000 m",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "10 000 m",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-017",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Purata bagi nombor 4, 8, 12, 16 ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "8",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "10",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "12",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "14",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-018",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika 15 murid berkongsi 60 gula-gula sama rata, setiap seorang dapat…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "3",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "4",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "5",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "6",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-019",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "2 jam 30 minit bersamaan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "120 minit",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "130 minit",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "140 minit",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "150 minit",
        "is_correct": true,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-020",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Rajah berbentuk segi empat tepat mempunyai panjang 10 cm dan lebar 4 cm. Luasnya ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "14 cm²",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "20 cm²",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "40 cm²",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "80 cm²",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-021",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Dalam carta pai, ¼ bulatan berwarna biru. Jika jumlah pelajar 40 orang, berapa orang suka warna biru?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "5",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "8",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "10",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "12",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-022",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Sebuah bas membawa 45 penumpang. 12 turun di stesen pertama dan 8 naik. Berapa penumpang dalam bas sekarang?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "41",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "42",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "43",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "44",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-023",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Nilai 7² – 5² ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "12",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "24",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "48",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "74",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-024",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Bilangan sudut bagi pentagon ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "4",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "5",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "6",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "7",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-025",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "0.75 ditukar kepada pecahan biasa…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "¾",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "⅔",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "⅖",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "⅘",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-026",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Ibu negara Malaysia ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Johor Bahru",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Putrajaya",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Kuala Lumpur",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Shah Alam",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-027",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Planet paling hampir dengan Matahari ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Marikh",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Zuhrah",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Utarid",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Bumi",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-028",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Warna Jalur Gemilang yang melambangkan perpaduan ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Merah",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Biru",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Kuning",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Putih",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-029",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Gunung tertinggi di Malaysia ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Gunung Tahan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Gunung Ledang",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Gunung Kinabalu",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Gunung Jerai",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-030",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Badan manusia memerlukan vitamin D untuk…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Mata sihat",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Tulang kuat",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Rambut lebat",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Otot besar",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-031",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Sungai terpanjang di Malaysia ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Sungai Rajang",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Sungai Kinabatangan",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Sungai Pahang",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Sungai Perak",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-032",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Simbol kimia bagi air ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "CO₂",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "H₂O",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "O₂",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "HO",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-033",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Haiwan yang hanya makan tumbuhan dikenali sebagai…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Karnivor",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Herbivor",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Omnivor",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Insektivor",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-034",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Proses tumbuhan membuat makanan sendiri ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Respirasi",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Fotosintesis",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Perkumuhan",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Pencernaan",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-035",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Bentuk muka bumi yang paling sesuai untuk penanaman padi ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Pantai",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Lembah",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tanah tinggi",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Gurun",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-036",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Benua terbesar di dunia ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Afrika",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Asia",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Eropah",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Amerika",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-037",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Peranti untuk mengukur suhu dipanggil…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Barometer",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Termometer",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Higrometer",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Seismograf",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-038",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Lapisan udara yang melindungi bumi daripada sinar UV ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Stratosfera",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Atmosfera",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Ozon",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Hujan Asid",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-039",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Burung yang tidak boleh terbang ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Murai",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Helang",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Kiwi",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Layang-layang",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-040",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Duit kertas RM50 berwarna…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Biru",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Hijau",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Oren",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Merah",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-041",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Perdana Menteri Malaysia ke-10 ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Ismail Sabri",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Tun Mahathir",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Anwar Ibrahim",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Muhyiddin Yassin",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-042",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Pencemaran udara paling banyak disebabkan oleh…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Kilang dan kenderaan",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Pokok",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Sungai",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tanah",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-043",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Kitaran air bermula dengan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Hujan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Penguapan",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Sungai",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Simpanan air",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-044",
    "question_type": "objective",
    "section": "B",
    "category": "Bahasa Melayu",
    "topic": "Bahasa dan Peribahasa",
    "difficulty": "medium",
    "question_text": "Peribahasa “bagai aur dengan tebing” membawa maksud…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Saling membantu",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Saling bermusuhan",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Hidup sederhana",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Suka bersendirian",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-045",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "1 Mei di Malaysia disambut sebagai…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Hari Guru",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Hari Buruh",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Hari Merdeka",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Hari Malaysia",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-046",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Choose the correct spelling:",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Enviroment",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Environment",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Envaironment",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Environmant",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-047",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "The opposite of “Brave” is…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Strong",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Coward",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Weak",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Lazy",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-048",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Which sentence is correct?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "He go to school every day.",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "He goes to school every day.",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "He going to school every day.",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "He gone to school every day.",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-049",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "“Sang” is the past tense of…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Sing",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Song",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Singing",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Sung",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-050",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "The plural of “Child” is…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Childs",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Children",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Childrens",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Childes",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-051",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Choose the word that means “Happy”:",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Sad",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Joyful",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Angry",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Sleepy",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-052",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Which is a fruit?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Carrot",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Potato",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Apple",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Broccoli",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-053",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Complete the sentence: “I reading a book now.”",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "am",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "is",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "are",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "be",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-054",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "“Library” is a place to…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Play football",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Read books",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Buy clothes",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Cook food",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-055",
    "question_type": "objective",
    "section": "B",
    "category": "English",
    "topic": "Bahasa Inggeris",
    "difficulty": "medium",
    "question_text": "Which of the following is a synonym for “Big”?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Small",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Large",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tiny",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Thin",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-056",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Jika Utara di atas peta, arah kiri peta ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Selatan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Barat",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Timur",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Tenggara",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-057",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika 12 ekor burung di pokok dan 4 terbang pergi, tinggal…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "6",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "7",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "8",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "9",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-058",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Negara jiran Malaysia yang mempunyai pulau Bali ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Thailand",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Indonesia",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Brunei",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Filipina",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-059",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Simbol mata wang Jepun ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "$",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "¥",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "€",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "₩",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-060",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Dalam pilihan jawapan ini, yang manakah bentuk geometri 3D?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Segi empat tepat",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Silinder",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Segi tiga",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Bulatan",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-061",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Perubahan iklim yang menyebabkan suhu bumi meningkat dipanggil…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Hujan asid",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Pemanasan global",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Fotosintesis",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Gempa bumi",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-062",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "Jika ¼ daripada 80 pelajar ponteng, berapa pelajar hadir?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "20",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "40",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "60",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "80",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-063",
    "question_type": "objective",
    "section": "B",
    "category": "Bahasa Melayu",
    "topic": "Bahasa dan Peribahasa",
    "difficulty": "medium",
    "question_text": "Peribahasa “Sedikit-sedikit, lama-lama jadi bukit” membawa maksud…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Suka memanjat",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Sikit-sikit lama jadi banyak",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Hidup sederhana",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Bukit yang tinggi",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-064",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Peralatan yang digunakan untuk menyimpan fail digital ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Cawan",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Pemacu USB",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Buku nota",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Kalkulator",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-065",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Haiwan yang hidup di darat dan air ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Singa",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Katak",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Burung Hantu",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Ular Sawa",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-066",
    "question_type": "objective",
    "section": "B",
    "category": "Bahasa Melayu",
    "topic": "Bahasa dan Peribahasa",
    "difficulty": "medium",
    "question_text": "Bahasa rasmi Pertubuhan Bangsa-Bangsa Bersatu bukan termasuk…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Inggeris",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Arab",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Jepun",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Perancis",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-067",
    "question_type": "objective",
    "section": "B",
    "category": "Matematik",
    "topic": "Matematik Logik",
    "difficulty": "medium",
    "question_text": "9 × 9 – 9 = ?",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "72",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "81",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "90",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "99",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-068",
    "question_type": "objective",
    "section": "B",
    "category": "Pengetahuan Am",
    "topic": "Pengetahuan Am",
    "difficulty": "medium",
    "question_text": "Bateri telefon dicas untuk…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Simpan tenaga",
        "is_correct": true,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Hasilkan cahaya",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Tukar data",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Main muzik",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-069",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Ikan bernafas menggunakan…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Hidung",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Insang",
        "is_correct": true,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Paru-paru",
        "is_correct": false,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Kulit",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-B-070",
    "question_type": "objective",
    "section": "B",
    "category": "Sains",
    "topic": "Sains dan Alam Sekitar",
    "difficulty": "medium",
    "question_text": "Organ yang mengepam darah dalam badan ialah…",
    "explanation": null,
    "options": [
      {
        "label": "A",
        "text": "Otak",
        "is_correct": false,
        "sort_order": 1
      },
      {
        "label": "B",
        "text": "Paru-paru",
        "is_correct": false,
        "sort_order": 2
      },
      {
        "label": "C",
        "text": "Jantung",
        "is_correct": true,
        "sort_order": 3
      },
      {
        "label": "D",
        "text": "Hati",
        "is_correct": false,
        "sort_order": 4
      }
    ]
  },
  {
    "source_key": "tips-pksk-2026-C-001",
    "question_type": "essay",
    "section": "C",
    "category": "Karangan",
    "topic": "Cita-Cita Saya",
    "difficulty": "medium",
    "question_text": "Cita-Cita Saya: Tulis tentang cita-cita anda, sebab anda memilih cita-cita tersebut dan usaha anda untuk mencapainya.",
    "explanation": null,
    "options": []
  },
  {
    "source_key": "tips-pksk-2026-C-002",
    "question_type": "essay",
    "section": "C",
    "category": "Karangan",
    "topic": "Kebaikan Mengamalkan Sikap Bertanggungjawab",
    "difficulty": "medium",
    "question_text": "Kebaikan Mengamalkan Sikap Bertanggungjawab: Jelaskan maksud sikap bertanggungjawab dan bagaimana ia memberi manfaat kepada individu dan masyarakat.",
    "explanation": null,
    "options": []
  },
  {
    "source_key": "tips-pksk-2026-C-003",
    "question_type": "essay",
    "section": "C",
    "category": "Karangan",
    "topic": "Aktiviti Kegemaran Saya",
    "difficulty": "medium",
    "question_text": "Aktiviti Kegemaran Saya: Nyatakan aktiviti kegemaran anda dan sebab anda meminatinya. Terangkan juga manfaat aktiviti tersebut.",
    "explanation": null,
    "options": []
  }
]
$questions$::jsonb)
  loop
    insert into public.questions (
      source_id,
      source_key,
      question_type,
      section,
      category,
      topic,
      difficulty,
      question_text,
      explanation,
      is_active
    )
    values (
      v_source_id,
      v_question->>'source_key',
      v_question->>'question_type',
      v_question->>'section',
      v_question->>'category',
      v_question->>'topic',
      v_question->>'difficulty',
      v_question->>'question_text',
      nullif(v_question->>'explanation', 'null'),
      true
    )
    on conflict (source_key) do update set
      source_id = excluded.source_id,
      question_type = excluded.question_type,
      section = excluded.section,
      category = excluded.category,
      topic = excluded.topic,
      difficulty = excluded.difficulty,
      question_text = excluded.question_text,
      explanation = excluded.explanation,
      is_active = true,
      updated_at = now()
    returning id into v_question_id;

    delete from public.question_options where question_id = v_question_id;

    for v_option in
      select value from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb))
    loop
      insert into public.question_options (
        question_id,
        option_label,
        option_text,
        is_correct,
        sort_order
      )
      values (
        v_question_id,
        v_option->>'label',
        v_option->>'text',
        coalesce((v_option->>'is_correct')::boolean, false),
        coalesce((v_option->>'sort_order')::integer, 0)
      );
    end loop;
  end loop;
end $$;
