import { jsPDF } from "jspdf";
import type { PrintableSimulationSet, QuizOption, QuizQuestion } from "../types/quiz";

export type PrintSimulationStudentInfo = {
  studentName: string;
  school: string;
  generatedAt: Date;
};

type PdfImageAsset = {
  dataUrl: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG" | "WEBP";
};

type PdfWriter = {
  doc: jsPDF;
  logo: PdfImageAsset | null;
  imageCache: Map<string, Promise<PdfImageAsset | null>>;
  cursorY: number;
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 16;
const HEADER_Y = 12;
const CONTENT_TOP = 26;
const FOOTER_Y = 286;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export async function downloadPrintSimulationPdf(payload: PrintableSimulationSet, info: PrintSimulationStudentInfo): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imageCache = new Map<string, Promise<PdfImageAsset | null>>();
  const logo = await loadPdfImage("/assets/pksk-academy-logo.png");
  const writer: PdfWriter = { doc, logo, imageCache, cursorY: CONTENT_TOP };
  const generatedDate = formatGeneratedDate(info.generatedAt);

  renderCover(writer, info, generatedDate);

  const sectionA = payload.questions.filter((question) => question.section === "A").sort(sortByQuestionOrder);
  const sectionB = payload.questions.filter((question) => question.section === "B").sort(sortByQuestionOrder);
  const sectionC = payload.questions.filter((question) => question.section === "C").sort(sortByQuestionOrder);

  startNewContentPage(writer);
  await renderSection(writer, "Bahagian A", "Kecerdasan Insaniah - 30 soalan objektif", sectionA);
  startNewContentPage(writer);
  await renderSection(writer, "Bahagian B", "Kecerdasan Intelek - 70 soalan objektif", sectionB);
  startNewContentPage(writer);
  await renderSection(writer, "Bahagian C", "Artikulasi Penulisan - 1 soalan", sectionC, true);

  doc.save(createPdfFileName(info.studentName, info.generatedAt));
}

function renderCover(writer: PdfWriter, info: PrintSimulationStudentInfo, generatedDate: string) {
  const { doc, logo } = writer;

  doc.setFillColor(240, 253, 250);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(16, 22, PAGE_WIDTH - 32, 230, 6, 6, "F");
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.4);
  doc.roundedRect(16, 22, PAGE_WIDTH - 32, 230, 6, 6, "S");

  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, 75, 36, 60, 26, undefined, "FAST");
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(8, 47, 73);
    doc.text("PKSK Academy", PAGE_WIDTH / 2, 50, { align: "center" });
  }

  doc.setTextColor(2, 6, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Cetak Simulasi PKSK", PAGE_WIDTH / 2, 88, { align: "center" });

  doc.setFontSize(15);
  doc.setTextColor(14, 116, 144);
  doc.text("Set Lengkap Bahagian A, B dan C", PAGE_WIDTH / 2, 101, { align: "center" });

  drawCoverField(doc, "Nama murid", info.studentName || "________________________", 36, 126);
  drawCoverField(doc, "Sekolah", info.school || "________________________", 36, 150);
  drawCoverField(doc, "Tarikh janaan", generatedDate, 36, 174);

  const boxY = 205;
  drawCoverStat(doc, "Bahagian A", "30 soalan", 35, boxY);
  drawCoverStat(doc, "Bahagian B", "70 soalan", 84, boxY);
  drawCoverStat(doc, "Bahagian C", "1 soalan", 133, boxY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Gunakan set ini untuk latihan cetakan. Jawapan boleh ditanda pada kertas sendiri.", PAGE_WIDTH / 2, 242, { align: "center" });

  drawFooter(doc);
}

function drawCoverField(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(14, 116, 144);
  doc.text(label.toUpperCase(), x, y);
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(toPdfText(value), x, y + 9);
  doc.setDrawColor(203, 213, 225);
  doc.line(x, y + 14, PAGE_WIDTH - 36, y + 14);
}

function drawCoverStat(doc: jsPDF, title: string, value: string, x: number, y: number) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, 42, 22, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(title, x + 21, y + 8, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(2, 6, 23);
  doc.text(value, x + 21, y + 16, { align: "center" });
}

async function renderSection(writer: PdfWriter, title: string, subtitle: string, questions: QuizQuestion[], essay = false) {
  ensureSpace(writer, 22);
  const { doc } = writer;

  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(153, 246, 228);
  doc.roundedRect(MARGIN_X, writer.cursorY, CONTENT_WIDTH, 15, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(8, 47, 73);
  doc.text(title, MARGIN_X + 5, writer.cursorY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, MARGIN_X + 5, writer.cursorY + 11);
  writer.cursorY += 22;

  for (let index = 0; index < questions.length; index += 1) {
    await renderQuestion(writer, questions[index], index + 1, essay);
  }
}

async function renderQuestion(writer: PdfWriter, question: QuizQuestion, displayNumber: number, essay: boolean) {
  const { doc } = writer;
  ensureSpace(writer, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(2, 6, 23);
  const prefix = essay ? "Soalan" : `${displayNumber}.`;
  drawWrappedText(writer, `${prefix} ${question.question_text}`, MARGIN_X, CONTENT_WIDTH, 5);

  const questionImage = await getCachedImage(writer, question.question_image_url);
  if (questionImage) {
    addImageBlock(writer, questionImage, MARGIN_X + 4, CONTENT_WIDTH - 8, 58);
  }

  if (!essay) {
    await renderOptions(writer, question.options ?? []);
    writer.cursorY += 5;
    return;
  }

  writer.cursorY += 3;
  drawWritingLines(writer, 20);
  writer.cursorY += 4;
}

async function renderOptions(writer: PdfWriter, options: QuizOption[]) {
  const orderedOptions = [...options].sort((a, b) => a.option_order - b.option_order);

  for (let index = 0; index < orderedOptions.length; index += 1) {
    const option = orderedOptions[index];
    const label = OPTION_LABELS[index] ?? String(index + 1);
    ensureSpace(writer, 12);

    writer.doc.setFont("helvetica", "normal");
    writer.doc.setFontSize(9.8);
    writer.doc.setTextColor(30, 41, 59);
    drawWrappedText(writer, `${label}. ${option.option_text ?? ""}`.trim(), MARGIN_X + 5, CONTENT_WIDTH - 10, 4.6);

    const optionImage = await getCachedImage(writer, option.option_image_url);
    if (optionImage) {
      addImageBlock(writer, optionImage, MARGIN_X + 11, 72, 34);
    }
  }
}

function drawWritingLines(writer: PdfWriter, lineCount: number) {
  const { doc } = writer;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);

  for (let index = 0; index < lineCount; index += 1) {
    ensureSpace(writer, 8);
    doc.line(MARGIN_X, writer.cursorY, PAGE_WIDTH - MARGIN_X, writer.cursorY);
    writer.cursorY += 8;
  }
}

function drawWrappedText(writer: PdfWriter, text: string, x: number, width: number, lineHeight: number) {
  const lines = writer.doc.splitTextToSize(toPdfText(text), width) as string[];
  const font = writer.doc.getFont();
  const fontSize = writer.doc.getFontSize();
  const textColor = writer.doc.getTextColor();

  for (const line of lines) {
    ensureSpace(writer, lineHeight + 2);
    writer.doc.setFont(font.fontName, font.fontStyle);
    writer.doc.setFontSize(fontSize);
    writer.doc.setTextColor(textColor);
    writer.doc.text(line, x, writer.cursorY);
    writer.cursorY += lineHeight;
  }
}

function addImageBlock(writer: PdfWriter, image: PdfImageAsset, x: number, maxWidth: number, maxHeight: number) {
  const size = containImage(image, maxWidth, maxHeight);
  ensureSpace(writer, size.height + 8);

  writer.doc.setFillColor(248, 250, 252);
  writer.doc.setDrawColor(226, 232, 240);
  writer.doc.roundedRect(x - 2, writer.cursorY - 2, size.width + 4, size.height + 4, 3, 3, "FD");
  writer.doc.addImage(image.dataUrl, image.format, x, writer.cursorY, size.width, size.height, undefined, "FAST");
  writer.cursorY += size.height + 7;
}

function containImage(image: PdfImageAsset, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  return {
    width: image.width * ratio,
    height: image.height * ratio,
  };
}

function ensureSpace(writer: PdfWriter, neededHeight: number) {
  if (writer.cursorY + neededHeight <= FOOTER_Y - 6) {
    return;
  }

  startNewContentPage(writer);
}

function startNewContentPage(writer: PdfWriter) {
  writer.doc.addPage();
  startContentPage(writer);
}

function startContentPage(writer: PdfWriter) {
  writer.cursorY = CONTENT_TOP;
  drawHeader(writer.doc, writer.logo);
  drawFooter(writer.doc);
}

function drawHeader(doc: jsPDF, logo: PdfImageAsset | null) {
  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, MARGIN_X, 6, 25, 11, undefined, "FAST");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("PKSK Academy", logo ? MARGIN_X + 31 : MARGIN_X, HEADER_Y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Cetak Simulasi PKSK", PAGE_WIDTH - MARGIN_X, HEADER_Y, { align: "right" });
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN_X, 20, PAGE_WIDTH - MARGIN_X, 20);
}

function drawFooter(doc: jsPDF) {
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN_X, FOOTER_Y - 6, PAGE_WIDTH - MARGIN_X, FOOTER_Y - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PKSK Academy", MARGIN_X, FOOTER_Y);
  doc.text(`Halaman ${doc.getNumberOfPages()}`, PAGE_WIDTH - MARGIN_X, FOOTER_Y, { align: "right" });
}

async function getCachedImage(writer: PdfWriter, url?: string | null) {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) {
    return null;
  }

  if (!writer.imageCache.has(trimmedUrl)) {
    writer.imageCache.set(trimmedUrl, loadPdfImage(trimmedUrl));
  }

  return writer.imageCache.get(trimmedUrl) ?? null;
}

async function loadPdfImage(url: string): Promise<PdfImageAsset | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    const dimensions = await readImageDimensions(dataUrl);
    const mimeType = blob.type.toLowerCase();

    if (mimeType.includes("svg")) {
      return rasterizeSvg(dataUrl, dimensions.width, dimensions.height);
    }

    const format = mimeType.includes("png") ? "PNG" : mimeType.includes("webp") ? "WEBP" : "JPEG";
    return {
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      format,
    };
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 900, height: image.naturalHeight || 400 });
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = dataUrl;
  });
}

async function rasterizeSvg(dataUrl: string, width: number, height: number): Promise<PdfImageAsset | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error("SVG_LOAD_FAILED"));
    nextImage.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(width, 1);
  canvas.height = Math.max(height, 1);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    format: "PNG",
  };
}

function formatGeneratedDate(date: Date) {
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createPdfFileName(studentName: string, generatedAt: Date) {
  const dateSlug = generatedAt.toISOString().slice(0, 10);
  const nameSlug = studentName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `cetak-simulasi-pksk-${nameSlug || "murid"}-${dateSlug}.pdf`;
}

function sortByQuestionOrder(a: QuizQuestion, b: QuizQuestion) {
  return a.question_order - b.question_order;
}

function toPdfText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}
