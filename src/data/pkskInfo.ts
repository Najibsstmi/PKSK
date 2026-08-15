export type PkskInfoEvent = {
  title: string;
  label: string;
  dateLabel: string;
  startLabel: string;
  start: string;
  end: string;
};

export const pkskInfoConfig = {
  sessionYear: 2027,
  timezone: "Asia/Kuala_Lumpur",
  officialSources: [
    {
      label: "Portal Sistem Permohonan Sekolah Khusus Tingkatan 1",
      url: "https://spskt1.moe.gov.my/spat1_mohon/panduan.cfm",
    },
    {
      label: "Hebahan KPM Kemasukan Sekolah Khusus dan MRSM Tahun 2027",
      url: "https://www.moe.gov.my/index.php/permohonan-kemasukan-ke-sekolah-khusus-dan-maktab-",
    },
  ],
  events: {
    application: {
      title: "Permohonan",
      label: "Permohonan dibuka",
      dateLabel: "10 Julai - 14 Ogos 2026",
      startLabel: "10 Julai 2026",
      start: "2026-07-10T00:00:00+08:00",
      end: "2026-08-14T23:59:59+08:00",
    },
    centreCheck: {
      title: "Semakan Pusat PKSK",
      label: "Semakan pusat pentaksiran",
      dateLabel: "11 September - 22 Oktober 2026",
      startLabel: "11 September 2026",
      start: "2026-09-11T00:00:00+08:00",
      end: "2026-10-22T23:59:59+08:00",
    },
    form4: {
      title: "PKSK Tingkatan 4",
      label: "Pelaksanaan PKSK Tingkatan 4",
      dateLabel: "21 September - 1 Oktober 2026",
      startLabel: "21 September 2026",
      start: "2026-09-21T00:00:00+08:00",
      end: "2026-10-01T23:59:59+08:00",
    },
    form1: {
      title: "PKSK Tingkatan 1",
      label: "Pelaksanaan PKSK Tingkatan 1",
      dateLabel: "12 - 22 Oktober 2026",
      startLabel: "12 Oktober 2026",
      start: "2026-10-12T00:00:00+08:00",
      end: "2026-10-22T23:59:59+08:00",
    },
  },
  timelineEventIds: ["application", "centreCheck", "form4", "form1"],
  countdownEventIds: ["form4", "form1"],
} as const;

export type PkskInfoEventId = keyof typeof pkskInfoConfig.events;
