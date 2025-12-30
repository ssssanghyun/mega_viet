import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

const SUBJECTS = [
  {
    key: 'math1',
    name: 'MATH 1',
    fileField: 'math1',
    totalQuestions: 20,
    answerColumns: { qIdx: 0, aIdx: 1 },
    infoFile: 'Math1_problem_info',
  },
  {
    key: 'math2',
    name: 'MATH 2',
    fileField: 'math2',
    totalQuestions: 20,
    answerColumns: { qIdx: 3, aIdx: 4 },
    infoFile: 'Math2_problem_info',
  },
  {
    key: 'eng',
    name: 'ENG',
    fileField: 'eng',
    totalQuestions: 25,
    answerColumns: { qIdx: 6, aIdx: 7 },
    infoFile: 'Eng_problem_info',
  },
];

const TOTAL_PARTICIPANTS = 56280;

const FIXED_ANSWERS: Record<string, Map<number, number>> = {
  math1: new Map([
    [1, 2], [2, 3], [3, 1], [4, 2], [5, 3],
    [6, 1], [7, 3], [8, 2], [9, 1], [10, 2],
    [11, 3], [12, 4], [13, 5], [14, 1], [15, 3],
    [16, 1], [17, 1], [18, 1], [19, 1], [20, 1],
  ]),
  math2: new Map([
    [1, 3], [2, 3], [3, 4], [4, 5], [5, 1],
    [6, 2], [7, 4], [8, 5], [9, 1], [10, 4],
    [11, 5], [12, 2], [13, 3], [14, 4], [15, 5],
    [16, 1], [17, 2], [18, 3], [19, 4], [20, 5],
  ]),
  eng: new Map([
    [1, 2], [2, 4], [3, 1], [4, 4], [5, 3],
    [6, 1], [7, 2], [8, 1], [9, 1], [10, 2],
    [11, 2], [12, 2], [13, 2], [14, 2], [15, 2],
    [16, 3], [17, 2], [18, 3], [19, 3], [20, 2],
    [21, 3], [22, 2], [23, 3], [24, 2], [25, 4],
  ]),
};

let openai: OpenAI | null = null;
const THAI_FONT_NAME = 'ThaiLocal';
const THAI_FONT_FILE = 'Thai-Regular.ttf';
const THAI_FONT_PATH = path.resolve(process.cwd(), 'public', 'fonts', THAI_FONT_FILE);
let thaiFontBase64: string | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

function registerThaiFont(doc: jsPDF) {
  if (!thaiFontBase64 && fs.existsSync(THAI_FONT_PATH)) {
    thaiFontBase64 = fs.readFileSync(THAI_FONT_PATH).toString('base64');
  }

  if (thaiFontBase64) {
    try {
      doc.addFileToVFS(THAI_FONT_FILE, thaiFontBase64);
      doc.addFont(THAI_FONT_FILE, THAI_FONT_NAME, 'normal');
      return true;
    } catch (error) {
      console.error('Thai font registration error:', error);
      return false;
    }
  }

  return false;
}

type StudentRecord = {
  id: string;
  name: string;
  answers: number[];
  correctCount?: number;
  score?: number;
  rank?: number;
  topPercent?: number;
  nationalRank?: number;
  standardScore?: number;
  unitResults?: Map<string, UnitResult>;
};

type UnitResult = {
  correct: number;
  total: number;
  incorrect: number[];
};

type QuestionStat = {
  correct: number;
  total: number;
  pValue?: number; // 문항 난이도 (p-value)
  dIndex?: number; // 변별도 (D-index)
  topGroupRate?: number; // 상위 그룹 정답률
  bottomGroupRate?: number; // 하위 그룹 정답률
  gap?: number; // 상위-하위 그룹 Gap
};

type SubjectData = {
  key: string;
  name: string;
  totalQuestions: number;
  questionNumbers: number[];
  students: StudentRecord[];
  answerMap: Map<number, number>;
  unitMap: Map<number, string>;
  questionStats: Map<number, QuestionStat>;
  unitStats: Map<string, { correct: number; total: number; questions: number[] }>;
  avgScore: number;
  stdDev: number;
  median: number;
  kr20?: number; // KR-20 신뢰도
};

function normalizeText(value: string) {
  return value.replace(/^"+|"+$/g, '').trim();
}

function getUnitInsights(subject: SubjectData, student: StudentRecord) {
  const unitResults = student.unitResults || new Map<string, UnitResult>();
  const unitEntries = Array.from(unitResults.entries())
    .map(([unit, result]) => ({
      unit,
      correct: result.correct,
      total: result.total,
      rate: result.total ? (result.correct / result.total) * 100 : 0,
      incorrect: result.incorrect,
    }))
    .filter((entry) => entry.total > 0);

  if (unitEntries.length === 0) {
    return { strongest: [], weakest: [], all: [] };
  }

  const strongest = [...unitEntries].sort((a, b) => b.rate - a.rate).slice(0, 2);
  const weakest = [...unitEntries].sort((a, b) => a.rate - b.rate).slice(0, 2);

  return { strongest, weakest, all: unitEntries };
}

function parseProblemInfo(filePath: string) {
  if (!fs.existsSync(filePath)) return new Map<number, string>();
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return new Map<number, string>();

  const splitLine = (line: string) => {
    const byTab = line.split('\t');
    if (byTab.length > 1) return byTab;
    return line.split(/\s{2,}/);
  };

  const numberCells = splitLine(lines[0]).map((cell) => cell.trim());
  let unitCells = splitLine(lines[1]).map((cell) => normalizeText(cell));

  if (unitCells.length > numberCells.length) {
    unitCells = unitCells.filter((cell) => cell !== '"');
  }

  if (unitCells.length < numberCells.length) {
    unitCells = [...unitCells, ...Array(numberCells.length - unitCells.length).fill('')];
  }

  const map = new Map<number, string>();
  numberCells.forEach((cell, idx) => {
    const qNum = parseInt(cell, 10);
    if (!Number.isFinite(qNum)) return;
    const unit = unitCells[idx] ? unitCells[idx].trim() : '';
    map.set(qNum, unit || `Question ${qNum}`);
  });

  return map;
}

function readSheetRowsFromBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
}

function parseAnswerSheet(rows: unknown[][], columns: { qIdx: number; aIdx: number }) {
  const answers = new Map<number, number>();
  let startRow = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const qHeader = String(row[columns.qIdx] ?? '').trim().toLowerCase();
    const aHeader = String(row[columns.aIdx] ?? '').trim().toLowerCase();
    if ((qHeader === 'q' || qHeader === 'question') && (aHeader === 'a' || aHeader === 'answer')) {
      startRow = i + 1;
      break;
    }
  }

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const qVal = parseInt(String(row[columns.qIdx] ?? '').trim(), 10);
    if (!Number.isFinite(qVal) || qVal <= 0) continue;
    const aVal = parseInt(String(row[columns.aIdx] ?? '').trim(), 10);
    answers.set(qVal, Number.isFinite(aVal) ? aVal : 0);
  }

  return answers;
}

function parseOMR(rows: unknown[][]) {
  if (rows.length === 0) return { students: [], questionNumbers: [] };
  const header = rows[0].map((cell) => String(cell).trim());
  const headerLower = header.map((cell) => cell.toLowerCase());

  const idIdx = headerLower.indexOf('id');
  const nameIdx = headerLower.indexOf('user_name');

  const questionColumns: { idx: number; qNum: number }[] = [];
  header.forEach((cell, idx) => {
    const qNum = parseInt(cell, 10);
    if (Number.isFinite(qNum) && qNum > 0) questionColumns.push({ idx, qNum });
  });

  const questionNumbers = questionColumns.map((q) => q.qNum).sort((a, b) => a - b);
  const students: StudentRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const studentId = String(row[idIdx !== -1 ? idIdx : 2] ?? '').trim();
    const userName = String(row[nameIdx !== -1 ? nameIdx : 3] ?? '').trim();
    if (!studentId && !userName) continue;

    const answers = questionNumbers.map((qNum) => {
      const col = questionColumns.find((q) => q.qNum === qNum);
      const raw = col ? row[col.idx] : '';
      const val = parseInt(String(raw).trim(), 10);
      return Number.isFinite(val) ? val : 0;
    });

    students.push({
      id: studentId || 'unknown',
      name: userName || 'unknown',
      answers,
    });
  }

  return { students, questionNumbers };
}

function computeSubjectStats(subject: {
  students: StudentRecord[];
  questionNumbers: number[];
  answerMap: Map<number, number>;
  unitMap: Map<number, string>;
}) {
  const questionStats = new Map<number, QuestionStat>();
  subject.questionNumbers.forEach((q) => {
    questionStats.set(q, { correct: 0, total: 0 });
  });

  const unitStats = new Map<string, { correct: number; total: number; questions: number[] }>();

  subject.students.forEach((student) => {
    let correctCount = 0;
    const unitResults = new Map<string, UnitResult>();

    subject.questionNumbers.forEach((qNum, idx) => {
      const correctAnswer = subject.answerMap.get(qNum) || 0;
      const studentAnswer = student.answers[idx] || 0;
      const isCorrect = studentAnswer !== 0 && studentAnswer === correctAnswer;

      if (isCorrect) correctCount += 1;

      const qStat = questionStats.get(qNum);
      if (qStat) {
        qStat.total += 1;
        if (isCorrect) qStat.correct += 1;
      }

      const unitName = subject.unitMap.get(qNum) || `Question ${qNum}`;
      const unitEntry = unitResults.get(unitName) || { correct: 0, total: 0, incorrect: [] };
      unitEntry.total += 1;
      if (isCorrect) {
        unitEntry.correct += 1;
      } else {
        unitEntry.incorrect.push(qNum);
      }
      unitResults.set(unitName, unitEntry);
    });

    const score = subject.questionNumbers.length
      ? (correctCount / subject.questionNumbers.length) * 100
      : 0;

    student.correctCount = correctCount;
    student.score = score;
    student.unitResults = unitResults;
  });

  const scores = subject.students.map((s) => s.score || 0).sort((a, b) => b - a);
  subject.students.forEach((student) => {
    const rank = scores.findIndex((score) => score === student.score) + 1;
    student.rank = rank;
    const nationalRank = Math.max(1, Math.round((rank / scores.length) * TOTAL_PARTICIPANTS));
    student.nationalRank = nationalRank;
    student.topPercent = Math.max(1, Math.min(100, Math.round((nationalRank / TOTAL_PARTICIPANTS) * 100)));
  });

  questionStats.forEach((stat, qNum) => {
    const unitName = subject.unitMap.get(qNum) || `Question ${qNum}`;
    const unitEntry = unitStats.get(unitName) || { correct: 0, total: 0, questions: [] };
    unitEntry.correct += stat.correct;
    unitEntry.total += stat.total;
    unitEntry.questions.push(qNum);
    unitStats.set(unitName, unitEntry);
  });

  const avgScore = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
  const stdDev = scores.length
    ? Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length)
    : 0;
  const median =
    scores.length === 0
      ? 0
      : scores.length % 2 === 0
      ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
      : scores[Math.floor(scores.length / 2)];

  subject.students.forEach((student) => {
    const standardScore = 50 + ((student.score || 0) - avgScore) / (stdDev || 1) * 10;
    student.standardScore = Math.round(standardScore);
  });

  // Calculate p-value (문항 난이도) for each question
  questionStats.forEach((stat, qNum) => {
    stat.pValue = stat.total > 0 ? stat.correct / stat.total : 0;
  });

  // Calculate D-index (변별도) and group comparisons
  const sortedStudents = [...subject.students].sort((a, b) => (b.score || 0) - (a.score || 0));
  const topGroupSize = Math.max(1, Math.floor(sortedStudents.length * 0.27)); // 상위 27%
  const bottomGroupSize = Math.max(1, Math.floor(sortedStudents.length * 0.27)); // 하위 27%
  const topGroup = sortedStudents.slice(0, topGroupSize);
  const bottomGroup = sortedStudents.slice(-bottomGroupSize);

  questionStats.forEach((stat, qNum) => {
    // Calculate top group correct rate
    let topCorrect = 0;
    topGroup.forEach((student) => {
      const idx = subject.questionNumbers.indexOf(qNum);
      if (idx !== -1) {
        const correctAnswer = subject.answerMap.get(qNum) || 0;
        const studentAnswer = student.answers[idx] || 0;
        if (studentAnswer !== 0 && studentAnswer === correctAnswer) topCorrect += 1;
      }
    });
    stat.topGroupRate = topGroupSize > 0 ? topCorrect / topGroupSize : 0;

    // Calculate bottom group correct rate
    let bottomCorrect = 0;
    bottomGroup.forEach((student) => {
      const idx = subject.questionNumbers.indexOf(qNum);
      if (idx !== -1) {
        const correctAnswer = subject.answerMap.get(qNum) || 0;
        const studentAnswer = student.answers[idx] || 0;
        if (studentAnswer !== 0 && studentAnswer === correctAnswer) bottomCorrect += 1;
      }
    });
    stat.bottomGroupRate = bottomGroupSize > 0 ? bottomCorrect / bottomGroupSize : 0;

    // Calculate gap and D-index
    stat.gap = (stat.topGroupRate || 0) - (stat.bottomGroupRate || 0);
    stat.dIndex = stat.gap; // D-index = gap between top and bottom groups
  });

  // Calculate KR-20 (신뢰도)
  const kr20 = calculateKR20(subject.students, subject.questionNumbers, questionStats, subject.answerMap);

  return { questionStats, unitStats, avgScore, stdDev, median, kr20 };
}

function calculateKR20(
  students: StudentRecord[],
  questionNumbers: number[],
  questionStats: Map<number, QuestionStat>,
  answerMap: Map<number, number>
): number {
  if (students.length === 0 || questionNumbers.length === 0) return 0;

  // Calculate variance of total scores
  const scores = students.map((s) => s.score || 0);
  const meanScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const varianceTotal = scores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / scores.length;

  // Calculate sum of p*q for each question (p = correct rate, q = 1-p)
  let sumPQ = 0;
  questionNumbers.forEach((qNum) => {
    const stat = questionStats.get(qNum);
    if (stat && stat.total > 0) {
      const p = stat.pValue || 0;
      const q = 1 - p;
      sumPQ += p * q;
    }
  });

  // KR-20 formula: (k/(k-1)) * (1 - sum(pq)/variance)
  const k = questionNumbers.length;
  if (k <= 1 || varianceTotal === 0) return 0;

  const kr20 = (k / (k - 1)) * (1 - sumPQ / varianceTotal);
  return Math.max(0, Math.min(1, kr20)); // Clamp between 0 and 1
}

function sanitizeFilename(value: string) {
  return value
    .replace(/\s+/g, '_')
    .replace(/[^\w\-.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function buildStudentIndex(subjects: SubjectData[]) {
  const index = new Map<string, { id: string; name: string; subjects: Record<string, StudentRecord> }>();
  subjects.forEach((subject) => {
    subject.students.forEach((student) => {
      const key = `${student.id}::${student.name}`;
      if (!index.has(key)) {
        index.set(key, { id: student.id, name: student.name, subjects: {} });
      }
      index.get(key)!.subjects[subject.key] = student;
    });
  });
  return index;
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('megastudy', margin, 15);

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, 22, pageWidth - margin, 22);

  doc.setFontSize(18);
  doc.setTextColor(59, 130, 246);
  doc.text(title, margin, 38);

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, margin, 48);
}

function addSubjectSection(
  doc: jsPDF,
  subject: SubjectData,
  student: StudentRecord,
  questionStats: Map<number, QuestionStat>,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(12);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text(`${subject.name} Score Summary`, margin + 8, yPos + 9);

  yPos += 18;

  const cardWidth = (contentWidth - 15) / 4;
  const cardHeight = 24;
  const correctRate = subject.questionNumbers.length > 0 
    ? ((student.correctCount ?? 0) / subject.questionNumbers.length * 100).toFixed(1) 
    : '0.0';
  const cards = [
    { label: 'Total Score', value: `${student.correctCount ?? 0}/${subject.questionNumbers.length}` },
    { label: 'Correct Rate', value: `${correctRate}%` },
    { label: 'Percentile', value: `${100 - (student.topPercent ?? 100)}th` },
    { label: 'Standard Score', value: `${student.standardScore ?? 0}` },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardWidth + 5);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, yPos, cardWidth, cardHeight, 3, 3, 'F');
    doc.setFontSize(12);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, x + cardWidth / 2, yPos + 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + cardWidth / 2, yPos + 19, { align: 'center' });
  });

  yPos += cardHeight + 12;

  yPos = drawStudentScatter(doc, subject, student, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  const interpretLines = buildThaiInterpretation(subject, student);
  if (interpretLines.length > 0) {
    const thaiReady = registerThaiFont(doc);
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('How to Read This', margin + 8, yPos + 9);

    yPos += 16;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
    interpretLines.forEach((line) => {
      doc.text(line, margin + 2, yPos);
      yPos += 5;
    });
    yPos += 6;
    doc.setFont('helvetica', 'normal');
  }

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  const unitSummaryLines = buildThaiUnitSummary(subject, student);
  if (unitSummaryLines.length > 0) {
    const thaiReady = registerThaiFont(doc);
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, yPos, 3, 12, 'F');
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Summary (TH)', margin + 8, yPos + 9);

    yPos += 16;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
    unitSummaryLines.forEach((line) => {
      doc.text(line, margin + 2, yPos);
      yPos += 5;
    });
    yPos += 6;
    doc.setFont('helvetica', 'normal');
  }

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  const unitResults = student.unitResults || new Map<string, UnitResult>();
  const unitTable = Array.from(unitResults.entries()).map(([unitName, result]) => {
    const rate = result.total ? ((result.correct / result.total) * 100).toFixed(1) : '0.0';
    const incorrectList = result.incorrect.length ? result.incorrect.join(', ') : '-';
    return [unitName, `${result.correct}/${result.total}`, `${rate}%`, incorrectList];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Unit', 'Correct/Total', 'Rate', 'Incorrect Q']],
    body: unitTable,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.45 },
      1: { cellWidth: contentWidth * 0.17 },
      2: { cellWidth: contentWidth * 0.13 },
      3: { cellWidth: contentWidth * 0.25 },
    },
    margin: { left: margin, right: margin },
  });

  yPos = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : yPos + 10;

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  yPos = drawQuestionRateChart(doc, subject, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  // Add difficulty level performance chart
  yPos = drawDifficultyPerformanceChart(doc, subject, student, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  // Add top-bottom comparison chart
  yPos = drawTopBottomComparisonChart(doc, subject, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  // Add difficulty-discrimination scatter plot
  yPos = drawDifficultyDiscriminationScatter(doc, subject, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);
    yPos = 58;
  }

  // Add test reliability and statistics section
  const thaiReady = registerThaiFont(doc);
  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Test Statistics & Reliability', margin + 8, yPos + 9);

  yPos += 18;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');

  const kr20 = subject.kr20 ?? 0;
  const kr20Quality = kr20 >= 0.8 ? 'Excellent' : kr20 >= 0.7 ? 'Good' : kr20 >= 0.6 ? 'Acceptable' : 'Needs Improvement';
  
  doc.text(`KR-20 Reliability: ${kr20.toFixed(3)} (${kr20Quality})`, margin, yPos);
  yPos += 8;
  doc.text(`Interpretation: ${kr20 >= 0.8 ? 'Very reliable test' : kr20 >= 0.7 ? 'Reliable test' : kr20 >= 0.6 ? 'Moderately reliable' : 'Low reliability - test quality needs improvement'}`, margin, yPos);
  yPos += 12;

  // Question statistics summary
  const totalQuestions = subject.questionNumbers.length;
  const goodDiscrimination = Array.from(questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0.3).length;
  const moderateDiscrimination = Array.from(questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0.1 && (s.dIndex ?? 0) < 0.3).length;
  const poorDiscrimination = Array.from(questionStats.values()).filter(s => (s.dIndex ?? 0) < 0.1).length;

  doc.text(`Question Quality: Good (D≥0.3): ${goodDiscrimination}, Moderate (0.1≤D<0.3): ${moderateDiscrimination}, Poor (D<0.1): ${poorDiscrimination}`, margin, yPos);
  yPos += 8;

  const easyQuestions = Array.from(questionStats.values()).filter(s => (s.pValue ?? 0) >= 0.7).length;
  const mediumQuestions = Array.from(questionStats.values()).filter(s => (s.pValue ?? 0) > 0.3 && (s.pValue ?? 0) < 0.7).length;
  const hardQuestions = Array.from(questionStats.values()).filter(s => (s.pValue ?? 0) <= 0.3).length;

  doc.text(`Difficulty Distribution: Easy (p≥0.7): ${easyQuestions}, Medium (0.3<p<0.7): ${mediumQuestions}, Hard (p≤0.3): ${hardQuestions}`, margin, yPos);
  yPos += 15;

  const questionTable = subject.questionNumbers.map((qNum) => {
    const stat = questionStats.get(qNum);
    const rate = stat && stat.total ? ((stat.correct / stat.total) * 100).toFixed(1) : '0.0';
    const pValue = stat?.pValue !== undefined ? stat.pValue.toFixed(2) : '-';
    const dIndex = stat?.dIndex !== undefined ? stat.dIndex.toFixed(2) : '-';
    return [qNum, `${stat?.correct ?? 0}/${stat?.total ?? 0}`, `${rate}%`, pValue, dIndex, subject.unitMap.get(qNum) || `Question ${qNum}`];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Q', 'Correct/Total', 'Rate', 'p-value', 'D-index', 'Unit']],
    body: questionTable,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.05 },
      1: { cellWidth: contentWidth * 0.12 },
      2: { cellWidth: contentWidth * 0.08 },
      3: { cellWidth: contentWidth * 0.08 },
      4: { cellWidth: contentWidth * 0.08 },
      5: { cellWidth: contentWidth * 0.59 },
    },
    margin: { left: margin, right: margin },
  });

  return (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 12 : yPos + 12;
}

function drawStudentScatter(doc: jsPDF, subject: SubjectData, student: StudentRecord, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 70;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Score Distribution (Cohort)', margin + 8, yPos + 9);

  const chartTop = yPos + 18;
  const chartLeft = margin;
  const chartWidth = contentWidth;
  const chartBottom = chartTop + chartHeight;

  doc.setDrawColor(229, 231, 235);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight);

  const scores = subject.students.map((s) => s.score || 0);
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 100);

  subject.students.forEach((entry) => {
    const x = chartLeft + (subject.students.length > 1 ? (entry.rank! - 1) / (subject.students.length - 1) * chartWidth : chartWidth / 2);
    const y = chartBottom - ((entry.score || 0) - minScore) / (maxScore - minScore || 1) * chartHeight;
    doc.setFillColor(209, 213, 219);
    doc.circle(x, y, 0.8, 'F');
  });

  const studentX = chartLeft + (subject.students.length > 1 ? (student.rank! - 1) / (subject.students.length - 1) * chartWidth : chartWidth / 2);
  const studentY = chartBottom - ((student.score || 0) - minScore) / (maxScore - minScore || 1) * chartHeight;
  doc.setFillColor(239, 68, 68);
  doc.circle(studentX, studentY, 1.6, 'F');
  doc.setFontSize(7);
  doc.setTextColor(239, 68, 68);
  doc.text('You', studentX + 2, studentY - 2);

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Rank', chartLeft, chartBottom + 8);
  doc.text('Score', chartLeft, chartTop - 4);

  const statsY = chartBottom + 16;
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Standard Score: ${student.standardScore ?? 0}`, chartLeft, statsY);
  doc.text(`Top ${student.topPercent ?? 100}%`, chartLeft + 90, statsY);
  doc.text(`Est. Rank: ${student.nationalRank ?? 0}`, chartLeft, statsY + 10);
  doc.text(`Total: ${TOTAL_PARTICIPANTS}`, chartLeft + 90, statsY + 10);

  // Add interpretation
  const thaiReady = registerThaiFont(doc);
  let interpretY = statsY + 20;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
  const interpretation = `• กราฟนี้แสดงการกระจายคะแนนของนักเรียนทั้งหมดในกลุ่ม โดยจุดสีแดงคือตำแหน่งของคุณ
• หากจุดของคุณอยู่ด้านซ้ายล่าง หมายความว่าคะแนนต่ำกว่าเพื่อน แต่ถ้าอยู่ด้านขวาบน หมายความว่าคะแนนสูงกว่า
• กราฟนี้ช่วยให้เห็นว่าคุณอยู่ในตำแหน่งไหนเมื่อเทียบกับนักเรียนคนอื่นในกลุ่มเดียวกัน`;
  const interpretLines = doc.splitTextToSize(interpretation, contentWidth - 10);
  interpretLines.forEach((line: string) => {
    doc.text(line, margin + 5, interpretY);
    interpretY += 5;
  });

  return interpretY + 5;
}

function buildThaiInterpretation(subject: SubjectData, student: StudentRecord) {
  const lines: string[] = [];
  const topPercent = student.topPercent ?? 100;
  const nationalRank = student.nationalRank ?? 0;
  const standardScore = student.standardScore ?? 0;

  lines.push(`• อันดับระดับประเทศ: อยู่ในกลุ่มบน ${topPercent}% (ประมาณ ${nationalRank} จาก ${TOTAL_PARTICIPANTS} คน)`);
  lines.push(`• คะแนนปรับมาตรฐาน (Standard Score): ${standardScore} ใช้เทียบความสามารถกับค่าเฉลี่ยรวม`);

  const difficulty = computeDifficultyPerformance(subject, student);
  if (difficulty.total > 0) {
    lines.push(
      `• ความยากง่าย: ง่าย ${difficulty.easy.correct}/${difficulty.easy.total}, กลาง ${difficulty.medium.correct}/${difficulty.medium.total}, ยาก ${difficulty.hard.correct}/${difficulty.hard.total}`
    );
  }

  const peerInfo = computePeerBand(subject, student, 5);
  if (peerInfo.count > 0) {
    lines.push(`• กลุ่มคะแนนใกล้เคียง (±5): ${peerInfo.count} คน เฉลี่ย ${peerInfo.avg.toFixed(1)}%`);
  }

  return lines;
}

function computeDifficultyPerformance(subject: SubjectData, student: StudentRecord) {
  const groups = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 },
  };

  subject.questionNumbers.forEach((qNum, idx) => {
    const stat = subject.questionStats.get(qNum);
    const rate = stat && stat.total ? stat.correct / stat.total : 0;
    const studentAnswer = student.answers[idx] || 0;
    const correctAnswer = subject.answerMap.get(qNum) || 0;
    const isCorrect = studentAnswer !== 0 && studentAnswer === correctAnswer;

    let bucket = groups.medium;
    if (rate >= 0.7) bucket = groups.easy;
    else if (rate <= 0.3) bucket = groups.hard;

    bucket.total += 1;
    if (isCorrect) bucket.correct += 1;
  });

  return {
    easy: groups.easy,
    medium: groups.medium,
    hard: groups.hard,
    total: groups.easy.total + groups.medium.total + groups.hard.total,
  };
}

function computePeerBand(subject: SubjectData, student: StudentRecord, delta: number) {
  const score = student.score ?? 0;
  const peers = subject.students.filter((s) => Math.abs((s.score ?? 0) - score) <= delta);
  const avg = peers.length
    ? peers.reduce((sum, s) => sum + (s.score ?? 0), 0) / peers.length
    : 0;
  return { count: peers.length, avg };
}

function buildThaiUnitSummary(subject: SubjectData, student: StudentRecord) {
  const { strongest, weakest } = getUnitInsights(subject, student);
  if (strongest.length === 0 && weakest.length === 0) return [];

  const strongText = strongest.length
    ? strongest
        .map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`)
        .join(', ')
    : 'ไม่มีข้อมูล';
  const weakText = weakest.length
    ? weakest
        .map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`)
        .join(', ')
    : 'ไม่มีข้อมูล';

  const score = student.score ?? 0;
  const diff = score - subject.avgScore;
  const compare = diff >= 0 ? `สูงกว่าค่าเฉลี่ย ${diff.toFixed(1)}%` : `ต่ำกว่าค่าเฉลี่ย ${Math.abs(diff).toFixed(1)}%`;

  return [
    `สรุปภาพรวม: คะแนน ${score.toFixed(1)}% (${compare})`,
    `หน่วยที่ทำได้ดี: ${strongText}`,
    `หน่วยที่ควรปรับปรุง: ${weakText}`,
  ];
}

function drawQuestionRateChart(doc: jsPDF, subject: SubjectData, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 35;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Question Correct Rate (Cohort)', margin + 8, yPos + 9);

  const chartTop = yPos + 18;
  const barWidth = contentWidth / subject.totalQuestions;
  const maxHeight = chartHeight;

  subject.questionNumbers.forEach((qNum, idx) => {
    const stat = subject.questionStats.get(qNum);
    const rate = stat && stat.total ? stat.correct / stat.total : 0;
    const height = rate * maxHeight;
    const x = margin + idx * barWidth;
    doc.setFillColor(147, 197, 253);
    doc.rect(x + 1, chartTop + (maxHeight - height), Math.max(1, barWidth - 2), height, 'F');
  });

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  subject.questionNumbers.forEach((qNum, idx) => {
    if (qNum % 5 !== 0 && qNum !== 1 && qNum !== subject.totalQuestions) return;
    const x = margin + idx * barWidth;
    doc.text(String(qNum), x, chartTop + maxHeight + 6);
  });

  // Add interpretation
  const thaiReady = registerThaiFont(doc);
  let interpretY = chartTop + maxHeight + 15;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
  const interpretation = `• กราฟนี้แสดงอัตราการตอบถูกของแต่ละข้อในกลุ่มนักเรียนทั้งหมด
• แถบที่สูงแสดงว่าข้อนั้นมีนักเรียนตอบถูกมาก (ข้อง่าย) แถบที่ต่ำแสดงว่ามีนักเรียนตอบถูกน้อย (ข้อยาก)
• กราฟนี้ช่วยให้เห็นว่าข้อไหนเป็นข้อที่ควรฝึกเพิ่ม โดยเฉพาะข้อที่แถบต่ำมาก (ยาก) ที่คุณตอบผิด`;
  const interpretLines = doc.splitTextToSize(interpretation, contentWidth - 10);
  interpretLines.forEach((line: string) => {
    doc.text(line, margin + 5, interpretY);
    interpretY += 5;
  });

  return interpretY + 5;
}

function drawDifficultyDiscriminationScatter(
  doc: jsPDF,
  subject: SubjectData,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 80;
  const chartWidth = contentWidth;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Difficulty-Discrimination Scatter (p-value vs D-index)', margin + 8, yPos + 9);

  const chartTop = yPos + 18;
  const chartLeft = margin + 30;
  const chartBottom = chartTop + chartHeight;
  const chartRight = chartLeft + chartWidth - 60;

  // Calculate D-index range to handle negative values
  const dIndexValues = Array.from(subject.questionStats.values())
    .map(s => s.dIndex ?? 0)
    .filter(d => d !== undefined);
  const minDIndex = Math.min(...dIndexValues, 0);
  const maxDIndex = Math.max(...dIndexValues, 1);
  const dIndexRange = maxDIndex - minDIndex;
  const dIndexOffset = Math.abs(minDIndex); // Offset to handle negative values

  // Draw chart border
  doc.setDrawColor(229, 231, 235);
  doc.rect(chartLeft, chartTop, chartWidth - 60, chartHeight);

  // Draw axes
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(chartLeft, chartBottom, chartRight, chartBottom); // X-axis
  doc.line(chartLeft, chartTop, chartLeft, chartBottom); // Y-axis

  // Draw zero line for D-index if there are negative values
  if (minDIndex < 0) {
    const zeroY = chartBottom - (dIndexOffset / dIndexRange) * chartHeight;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);
    doc.line(chartLeft, zeroY, chartRight, zeroY);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text('D=0', chartLeft - 8, zeroY, { align: 'right' });
  }

  // Draw labels
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('p-value (Difficulty)', chartLeft + (chartWidth - 60) / 2, chartBottom + 10, { align: 'center' });
  doc.text('D-index (Discrimination)', chartLeft - 25, chartTop + chartHeight / 2, { align: 'center', angle: 90 });

  // Draw grid lines and labels for X-axis (p-value)
  for (let i = 0; i <= 10; i++) {
    const x = chartLeft + (i / 10) * (chartWidth - 60);
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.2);
    doc.line(x, chartTop, x, chartBottom);
    if (i % 2 === 0) {
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.text((i / 10).toFixed(1), x, chartBottom + 6, { align: 'center' });
    }
  }

  // Draw grid lines and labels for Y-axis (D-index) with negative support
  const yAxisSteps = 8;
  for (let i = 0; i <= yAxisSteps; i++) {
    const dValue = minDIndex + (i / yAxisSteps) * dIndexRange;
    const y = chartBottom - ((dValue - minDIndex) / dIndexRange) * chartHeight;
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.2);
    doc.line(chartLeft, y, chartRight, y);
    if (i % 2 === 0 || Math.abs(dValue) < 0.05) {
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.text(dValue.toFixed(2), chartLeft - 5, y, { align: 'right' });
    }
  }

  // Draw reference lines
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  // p-value = 0.3 (difficulty threshold)
  const p30X = chartLeft + 0.3 * (chartWidth - 60);
  doc.line(p30X, chartTop, p30X, chartBottom);
  // p-value = 0.7 (difficulty threshold)
  const p70X = chartLeft + 0.7 * (chartWidth - 60);
  doc.line(p70X, chartTop, p70X, chartBottom);
  // D-index = 0.3 (good discrimination)
  const d30Y = chartBottom - ((0.3 - minDIndex) / dIndexRange) * chartHeight;
  if (d30Y >= chartTop && d30Y <= chartBottom) {
    doc.line(chartLeft, d30Y, chartRight, d30Y);
  }

  // Plot questions
  subject.questionNumbers.forEach((qNum) => {
    const stat = subject.questionStats.get(qNum);
    if (!stat || stat.pValue === undefined || stat.dIndex === undefined) return;

    const x = chartLeft + stat.pValue * (chartWidth - 60);
    const y = chartBottom - ((stat.dIndex - minDIndex) / dIndexRange) * chartHeight;

    // Color code by quality (including negative values)
    if (stat.dIndex >= 0.3) {
      doc.setFillColor(34, 197, 94); // Green for good discrimination
    } else if (stat.dIndex >= 0.1) {
      doc.setFillColor(251, 191, 36); // Yellow for moderate
    } else if (stat.dIndex >= 0) {
      doc.setFillColor(239, 68, 68); // Red for poor discrimination (positive but low)
    } else {
      doc.setFillColor(168, 85, 247); // Purple for negative discrimination (problematic question)
    }
    doc.circle(x, y, 1.2, 'F');
  });

  // Legend
  const legendY = chartTop - 10;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Good (D≥0.3)', chartRight + 5, legendY);
  doc.setFillColor(34, 197, 94);
  doc.circle(chartRight + 25, legendY - 1.5, 1.2, 'F');
  doc.setTextColor(100, 100, 100);
  doc.text('Mod (0.1≤D<0.3)', chartRight + 5, legendY + 6);
  doc.setFillColor(251, 191, 36);
  doc.circle(chartRight + 40, legendY + 4.5, 1.2, 'F');
  doc.setTextColor(100, 100, 100);
  doc.text('Poor (0≤D<0.1)', chartRight + 5, legendY + 12);
  doc.setFillColor(239, 68, 68);
  doc.circle(chartRight + 35, legendY + 10.5, 1.2, 'F');
  if (minDIndex < 0) {
    doc.setTextColor(100, 100, 100);
    doc.text('Neg (D<0)', chartRight + 5, legendY + 18);
    doc.setFillColor(168, 85, 247);
    doc.circle(chartRight + 25, legendY + 16.5, 1.2, 'F');
  }

  // Add interpretation
  const thaiReady = registerThaiFont(doc);
  let interpretY = chartBottom + (minDIndex < 0 ? 28 : 20) + 5;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
  
  const goodCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0.3).length;
  const mediumCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0.1 && (s.dIndex ?? 0) < 0.3).length;
  const poorCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0 && (s.dIndex ?? 0) < 0.1).length;
  const negativeCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) < 0).length;
  
  let interpretation = `• กราฟนี้แสดงความสัมพันธ์ระหว่างความยากของข้อสอบ (p-value, แกน X) กับความสามารถในการแยกความสามารถ (D-index, แกน Y)`;
  interpretation += `\n• จุดเขียว (มุมขวาบน): ข้อสอบดี - ยากแต่แยกความสามารถได้ดี (${goodCount} ข้อ)`;
  interpretation += `\n• จุดเหลือง: ข้อสอบพอใช้ (${mediumCount} ข้อ)`;
  interpretation += `\n• จุดแดง (มุมซ้ายล่าง): ข้อสอบไม่ดี - ยากแต่ไม่แยกความสามารถ (${poorCount} ข้อ)`;
  if (negativeCount > 0) {
    interpretation += `\n• จุดม่วง (ใต้เส้น D=0): ข้อสอบมีปัญหา - นักเรียนอ่อนทำถูกมากกว่านักเรียนเก่ง (${negativeCount} ข้อ)`;
  }
  interpretation += `\n• สำหรับนักเรียน: ควรฝึกข้อที่อยู่มุมขวาบน (เขียว) ที่คุณทำผิด เพราะเป็นข้อที่นักเรียนเก่งส่วนใหญ่ทำถูก`;
  
  const interpretLines = doc.splitTextToSize(interpretation, pageWidth - margin * 2 - 10);
  interpretLines.forEach((line: string) => {
    doc.text(line, margin + 5, interpretY);
    interpretY += 5;
  });

  return interpretY + 5;
}

function drawTopBottomComparisonChart(
  doc: jsPDF,
  subject: SubjectData,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 60;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Top-Bottom Group Comparison (D-index)', margin + 8, yPos + 9);

  const chartTop = yPos + 18;
  const chartLeft = margin;
  const chartWidth = contentWidth;
  const chartBottom = chartTop + chartHeight;
  const barWidth = Math.min(8, (chartWidth - 40) / subject.totalQuestions);

  // Draw chart border
  doc.setDrawColor(229, 231, 235);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight);

  // Calculate D-index range for proper scaling
  const dIndexValues = Array.from(subject.questionStats.values())
    .map(s => s.dIndex ?? 0)
    .filter(d => d !== undefined);
  const minDIndex = Math.min(...dIndexValues, 0);
  const maxDIndex = Math.max(...dIndexValues, 1);
  const dIndexRange = maxDIndex - minDIndex;
  const zeroY = minDIndex < 0 ? chartBottom - 5 - (Math.abs(minDIndex) / dIndexRange) * (chartHeight - 10) : chartBottom - 5;

  // Draw zero line if there are negative values
  if (minDIndex < 0) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);
    doc.line(chartLeft + 20, zeroY, chartLeft + chartWidth, zeroY);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text('D=0', chartLeft + 18, zeroY - 2, { align: 'right' });
  }

  // Draw bars
  subject.questionNumbers.forEach((qNum, idx) => {
    const stat = subject.questionStats.get(qNum);
    if (!stat || stat.dIndex === undefined) return;

    const x = chartLeft + 20 + idx * barWidth;
    const barHeight = (Math.abs(stat.dIndex) / dIndexRange) * (chartHeight - 10);
    
    let y: number;
    if (stat.dIndex >= 0) {
      y = zeroY - barHeight; // Bars go up from zero line
    } else {
      y = zeroY; // Bars go down from zero line
    }

    // Color by D-index value
    if (stat.dIndex >= 0.3) {
      doc.setFillColor(34, 197, 94); // Green
    } else if (stat.dIndex >= 0.1) {
      doc.setFillColor(251, 191, 36); // Yellow
    } else if (stat.dIndex >= 0) {
      doc.setFillColor(239, 68, 68); // Red
    } else {
      doc.setFillColor(168, 85, 247); // Purple for negative
    }
    doc.rect(x, y, barWidth - 1, barHeight, 'F');
  });

  // Draw reference line at D=0.3
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  const refY = chartBottom - 5 - 0.3 * (chartHeight - 10);
  doc.line(chartLeft + 20, refY, chartLeft + chartWidth, refY);
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text('D=0.3', chartLeft + 22, refY - 2);

  // Labels
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('D-index', chartLeft, chartTop - 4);
  doc.text('Questions', chartLeft + chartWidth / 2, chartBottom + 10, { align: 'center' });

  // Add interpretation
  const thaiReady = registerThaiFont(doc);
  let interpretY = chartBottom + 20;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
  const goodCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) >= 0.3).length;
  const poorCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) < 0.1).length;
  const negativeCount = Array.from(subject.questionStats.values()).filter(s => (s.dIndex ?? 0) < 0).length;
  
  let interpretation = `• D-index (변별도) แสดงว่าข้อสอบแต่ละข้อสามารถแยกความสามารถของนักเรียนได้ดีแค่ไหน`;
  interpretation += `\n• แถบเขียว (D≥0.3): ข้อสอบดีมาก สามารถแยกนักเรียนเก่ง-อ่อนได้ชัดเจน (${goodCount} ข้อ)`;
  interpretation += `\n• แถบเหลือง (0.1≤D<0.3): ข้อสอบพอใช้ มีการแยกความสามารถบ้าง`;
  interpretation += `\n• แถบแดง (0≤D<0.1): ข้อสอบไม่ดี ควรปรับปรุง (${poorCount} ข้อ)`;
  if (negativeCount > 0) {
    interpretation += `\n• แถบม่วง (D<0): ข้อสอบมีปัญหา นักเรียนอ่อนตอบถูกมากกว่านักเรียนเก่ง (${negativeCount} ข้อ) - ควรแก้ไขข้อสอบ`;
  }
  interpretation += `\n• สำหรับนักเรียน: ข้อที่มี D-index สูง (เขียว) คือข้อที่นักเรียนเก่งทำถูก แต่คุณทำผิด ควรฝึกเพิ่ม`;
  
  const interpretLines = doc.splitTextToSize(interpretation, contentWidth - 10);
  interpretLines.forEach((line: string) => {
    doc.text(line, margin + 5, interpretY);
    interpretY += 5;
  });

  return interpretY + 5;
}

function drawDifficultyPerformanceChart(
  doc: jsPDF,
  subject: SubjectData,
  student: StudentRecord,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 60;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Difficulty Level Performance', margin + 8, yPos + 9);

  const difficulty = computeDifficultyPerformance(subject, student);
  const chartTop = yPos + 18;
  const chartLeft = margin;
  const chartWidth = contentWidth;
  const chartBottom = chartTop + chartHeight;
  const barWidth = (chartWidth - 40) / 3;

  // Draw bars for easy, medium, hard
  const levels = [
    { key: 'easy', label: 'Easy (p≥0.7)', data: difficulty.easy, color: [34, 197, 94] },
    { key: 'medium', label: 'Medium (0.3<p<0.7)', data: difficulty.medium, color: [251, 191, 36] },
    { key: 'hard', label: 'Hard (p≤0.3)', data: difficulty.hard, color: [239, 68, 68] },
  ];

  levels.forEach((level, i) => {
    const x = chartLeft + 20 + i * (barWidth + 10);
    const rate = level.data.total > 0 ? level.data.correct / level.data.total : 0;
    const barHeight = rate * (chartHeight - 20);
    const y = chartBottom - 10 - barHeight;

    doc.setFillColor(level.color[0], level.color[1], level.color[2]);
    doc.rect(x, y, barWidth, barHeight, 'F');

    // Label
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(level.label, x + barWidth / 2, chartBottom + 8, { align: 'center' });
    doc.text(`${level.data.correct}/${level.data.total}`, x + barWidth / 2, chartBottom + 15, { align: 'center' });
    doc.text(`${(rate * 100).toFixed(0)}%`, x + barWidth / 2, y - 3, { align: 'center' });
  });

  // Y-axis label
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Correct Rate', chartLeft, chartTop + chartHeight / 2, { align: 'center', angle: 90 });

  // Add interpretation
  const thaiReady = registerThaiFont(doc);
  let interpretY = chartBottom + 25;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');
  const easyRate = difficulty.easy.total > 0 ? ((difficulty.easy.correct / difficulty.easy.total) * 100).toFixed(0) : 0;
  const mediumRate = difficulty.medium.total > 0 ? ((difficulty.medium.correct / difficulty.medium.total) * 100).toFixed(0) : 0;
  const hardRate = difficulty.hard.total > 0 ? ((difficulty.hard.correct / difficulty.hard.total) * 100).toFixed(0) : 0;
  
  let interpretation = `• กราฟนี้แสดงผลการทำข้อสอบตามระดับความยาก: ข้อง่าย (p≥0.7), ข้อกลาง (0.3<p<0.7), ข้อยาก (p≤0.3)`;
  interpretation += `\n• คุณทำข้อง่ายได้ ${easyRate}%, ข้อกลางได้ ${mediumRate}%, ข้อยากได้ ${hardRate}%`;
  
  if (parseFloat(easyRate) < 80) {
    interpretation += `\n• ⚠️ คุณทำข้อง่ายได้น้อย แสดงว่าอาจมีปัญหาพื้นฐาน ควรทบทวนเนื้อหาพื้นฐานก่อน`;
  }
  if (parseFloat(hardRate) > 50) {
    interpretation += `\n• ✅ คุณทำข้อยากได้ดี แสดงว่ามีความเข้าใจในเนื้อหาลึกซึ้ง มีศักยภาพในการเรียนขั้นสูง`;
  } else if (parseFloat(hardRate) < 30) {
    interpretation += `\n• 💡 คุณทำข้อยากได้น้อย ควรฝึกโจทย์ที่ซับซ้อนมากขึ้นเพื่อพัฒนาความสามารถ`;
  }
  
  const interpretLines = doc.splitTextToSize(interpretation, contentWidth - 10);
  interpretLines.forEach((line: string) => {
    doc.text(line, margin + 5, interpretY);
    interpretY += 5;
  });

  return interpretY + 5;
}

async function generateAISummary(
  student: { id: string; name: string; subjects: Record<string, StudentRecord> },
  subjects: SubjectData[]
) {
  if (!process.env.OPENAI_API_KEY) {
    return 'AI summary is not available. OPENAI_API_KEY is not configured.';
  }

  try {
    const subjectSummaries = subjects.map((subject) => {
      const studentData = student.subjects[subject.key];
      const insights = getUnitInsights(subject, studentData);
      const weakest = insights.weakest.slice(0, 3);
      const strongest = insights.strongest.slice(0, 3);
      const incorrectQuestions = insights.all
        .filter((entry) => entry.incorrect.length > 0)
        .flatMap((entry) =>
          entry.incorrect.map((q) => ({
            q,
            unit: entry.unit,
            cohortRate: (() => {
              const stat = subject.questionStats.get(q);
              if (!stat || !stat.total) return 0;
              return Math.round((stat.correct / stat.total) * 100);
            })(),
          }))
        )
        .slice(0, 8);

      const difficulty = computeDifficultyPerformance(subject, studentData);
      const percentile = 100 - (studentData?.topPercent ?? 100);

      return {
        name: subject.name,
        totalQuestions: subject.totalQuestions,
        correct: studentData?.correctCount ?? 0,
        score: Number((studentData?.score ?? 0).toFixed(1)),
        avgScore: Number(subject.avgScore.toFixed(1)),
        percentile: percentile,
        standardScore: studentData?.standardScore ?? 0,
        weakestUnits: weakest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
        strongestUnits: strongest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
        incorrectQuestions: incorrectQuestions.map((item) => {
          const stat = subject.questionStats.get(item.q);
          const pValue = stat?.pValue !== undefined ? stat.pValue.toFixed(2) : '-';
          return `Q${item.q} ${item.unit} (p=${pValue}, cohort ${item.cohortRate}%)`;
        }),
        difficultyPerformance: {
          easy: `${difficulty.easy.correct}/${difficulty.easy.total} (${difficulty.easy.total > 0 ? ((difficulty.easy.correct / difficulty.easy.total) * 100).toFixed(0) : 0}%)`,
          medium: `${difficulty.medium.correct}/${difficulty.medium.total} (${difficulty.medium.total > 0 ? ((difficulty.medium.correct / difficulty.medium.total) * 100).toFixed(0) : 0}%)`,
          hard: `${difficulty.hard.correct}/${difficulty.hard.total} (${difficulty.hard.total > 0 ? ((difficulty.hard.correct / difficulty.hard.total) * 100).toFixed(0) : 0}%)`,
        },
        kr20: subject.kr20 ?? 0,
      };
    });

    const prompt = `คุณเป็นผู้เชี่ยวชาญด้านการศึกษาที่วิเคราะห์ผลการสอบให้กับนักเรียนและให้คำแนะนำการเรียนที่เฉพาะเจาะจง

เขียนรายงานวิเคราะห์ผลสอบ OMR ของนักเรียนโดยแยกตามวิชา โดยใช้ข้อมูลทางสถิติที่ให้มา

ข้อกำหนดสำคัญ:
1. เขียนเป็นภาษาไทยที่เข้าใจง่ายและเป็นธรรมชาติ
2. แต่ละวิชาเขียนอย่างละเอียดและครอบคลุม อย่างน้อย 20-30 ประโยค (반 페이지 이상)
3. ขึ้นหัวข้อแต่ละวิชาด้วยรูปแบบ [ชื่อวิชา]
4. ใช้ข้อมูลที่ให้มาทั้งหมดในการวิเคราะห์
5. ให้คำแนะนำที่ปฏิบัติได้จริงและเฉพาะเจาะจง
6. ขยายรายละเอียดให้ครบถ้วน อย่าสรุปสั้นเกินไป

สำหรับแต่ละวิชา ต้องเขียนให้ละเอียดและครอบคลุมทุกส่วนนี้อย่างเต็มที่:

**1. สรุปผลการสอบและตำแหน่ง (Positioning)** - 4-6 ประโยค
- เริ่มด้วยการบอกคะแนนรวม (ถูก/จำนวนข้อ) และคะแนนร้อยละ พร้อมอธิบายว่าเป็นผลอย่างไร
- บอกเปอร์เซ็นไทล์ (Percentile) อย่างละเอียด และเปรียบเทียบกับค่าเฉลี่ยวิชา (บอกว่าสูงกว่าหรือต่ำกว่าเท่าไหร่ และหมายความว่าอย่างไร)
- บอก Standard Score และแปลความหมายอย่างละเอียด (เช่น Standard Score 59 หมายความว่าอยู่ใกล้กับค่าเฉลี่ย และบอกผลกระทบ)
- บอกว่าอยู่ในตำแหน่งไหนเมื่อเทียบกับนักเรียนคนอื่นอย่างละเอียด (เช่น อยู่ในกลุ่มบน X% หรืออยู่ในช่วง Xth percentile และนี่หมายความว่าอย่างไร)
- อธิบายความหมายของตำแหน่งนี้ในแง่ของการแข่งขันและโอกาส (เช่น การเข้าสถานศึกษา หรือการประเมินความสามารถ)

**2. การวิเคราะห์จุดแข็ง (Strengths)** - 5-7 ประโยค
- บอกหน่วยที่ทำได้ดี 1-3 หน่วย พร้อมอธิบายอย่างละเอียดว่าทำได้ดีแค่ไหน (เช่น 100% ถูก หรือสูงกว่าค่าเฉลี่ยมาก) และทำไมถึงทำได้ดี
- อธิบายความสำคัญของหน่วยที่ทำได้ดีเหล่านี้ (เช่น เป็นพื้นฐานสำคัญ หรือเป็นเนื้อหายาก)
- บอกความสามารถในการทำข้อสอบยาก/ง่าย โดยอ้างอิงข้อมูล difficulty performance อย่างละเอียด (เช่น "ทำข้อง่ายได้ดีมาก แต่ข้อยากยังต้องปรับปรุง" พร้อมอธิบายว่าทำไม)
- วิเคราะห์จุดแข็งในแง่ของการเรียนรู้ (เช่น มีพื้นฐานดีในส่วนไหน หรือมีความเข้าใจในแนวคิดใด)
- เสนอแนะว่าจะใช้จุดแข็งเหล่านี้เพื่อพัฒนาจุดอ่อนได้อย่างไร

**3. การวิเคราะห์จุดอ่อน (Weaknesses)** - 6-8 ประโยค
- บอกหน่วยที่ควรปรับปรุง 2-3 หน่วย พร้อมอธิบายปัญหาที่พบอย่างละเอียด (เช่น ผิดทุกข้อ หรือได้น้อยมาก) และวิเคราะห์สาเหตุ
- วิเคราะห์ว่าข้อที่ผิดเป็นข้อแบบไหน (ง่าย/กลาง/ยาก) โดยอ้างอิง p-value เพื่อให้เห็นชัดว่าขาดพื้นฐานหรือไม่ (เช่น "ผิดข้อง่ายมาก แสดงว่าพื้นฐานไม่แน่น" หรือ "ผิดเฉพาะข้อยาก แสดงว่ามีพื้นฐานดีแต่ต้องฝึกเพิ่ม") และอธิบายรายละเอียด
- บอกข้อที่ผิดเด่น ๆ (5-8 ข้อ) และให้เหตุผลว่าทำไมควรแก้ไขอย่างละเอียด (เช่น "Q13 มี p-value ต่ำมาก แสดงว่าเป็นข้อยากที่ควรฝึกเพิ่ม" หรือ "Q1-4 เป็นข้อง่ายแต่ผิดทั้งหมด แสดงว่าพื้นฐานไม่แน่น") และบอกผลกระทบ
- วิเคราะห์รูปแบบของความผิดพลาด (เช่น ผิดในหน่วยเดียวกันหลายข้อ หรือผิดในแนวคิดเฉพาะ)
- อธิบายความเร่งด่วนในการแก้ไข (เช่น หน่วยไหนควรแก้ไขก่อน เพราะเป็นพื้นฐานของหน่วยอื่น)

**4. คำแนะนำการเรียน (Learning Guide)** - 6-8 ประโยค
- ให้คำแนะนำเฉพาะเจาะจงว่าควรเรียนอย่างไรในหน่วยที่อ่อน (เช่น "ควรเริ่มจากพื้นฐานของ Geometry & Vectors แล้วค่อยไปสู่โจทย์ที่ซับซ้อน") และบอกวิธีการเรียน
- แนะนำลำดับความสำคัญในการแก้ไขอย่างละเอียด (เช่น "ควรแก้ข้อง่ายที่ผิดก่อน เพราะเป็นพื้นฐานสำคัญ" หรือ "ควรเน้นฝึกหน่วยที่อ่อนที่สุดก่อน แล้วค่อยไปหน่วยอื่น") และบอกเหตุผล
- บอกเป้าหมายการเรียนสำหรับครั้งต่อไป (เช่น "ควรตั้งเป้าคะแนนเพิ่มขึ้น X% หรือควรทำข้อยากให้ได้เพิ่มขึ้น Y ข้อ") และบอกวิธีการวัดผล
- เสนอแนะแหล่งเรียนรู้หรือวิธีการฝึกฝนที่เหมาะสม (เช่น การอ่านหนังสือ, การทำโจทย์, การติวเสริม)
- ให้คำแนะนำเรื่องการจัดสรรเวลา (เช่น ควรใช้เวลาเท่าไหร่กับหน่วยไหน)
- แนะนำการติดตามความคืบหน้า (เช่น จะรู้ได้อย่างไรว่าทำได้ดีขึ้น)

**5. สรุปและแนวโน้ม** - 3-4 ประโยค
- สรุปภาพรวมความสามารถของนักเรียนในวิชานี้ (เช่น "โดยรวมมีพื้นฐานดี แต่ต้องฝึกเพิ่มในหน่วยที่อ่อน" หรือ "มีความสามารถในการทำข้อยาก แต่ต้องระวังข้อง่าย")
- บอกแนวโน้มและศักยภาพ (เช่น "มีแนวโน้มที่จะทำได้ดีขึ้นหากแก้ไขจุดอ่อน" หรือ "มีพื้นฐานที่ดีพอที่จะพัฒนาไปได้ไกล")
- ให้กำลังใจและสร้างแรงจูงใจ (เช่น "แม้จะยังมีจุดที่ต้องปรับปรุง แต่มีความสามารถเพียงพอที่จะประสบความสำเร็จได้")
- สรุปเป้าหมายและความคาดหวัง (เช่น "หากฝึกฝนตามคำแนะนำข้างต้น คาดว่าจะเห็นผลลัพธ์ที่ดีขึ้นในการสอบครั้งต่อไป")

학생: ${student.name} (ID: ${student.id})

ข้อมูลสถิติ:
${subjectSummaries.map((subject) => `
[${subject.name}]
- คะแนนรวม: ${subject.correct}/${subject.totalQuestions} ข้อ (${subject.score}%)
- ค่าเฉลี่ยวิชา: ${subject.avgScore}%
- Percentile: ${subject.percentile}th
- Standard Score: ${subject.standardScore}
- หน่วยที่ทำได้ดี: ${subject.strongestUnits.join(', ') || 'ไม่มี'}
- หน่วยที่ควรปรับปรุง: ${subject.weakestUnits.join(', ') || 'ไม่มี'}
- การทำข้อสอบตามระดับความยาก:
  * ข้อง่าย (p≥0.7): ${subject.difficultyPerformance.easy}
  * ข้อกลาง (0.3<p<0.7): ${subject.difficultyPerformance.medium}
  * ข้อยาก (p≤0.3): ${subject.difficultyPerformance.hard}
- ข้อที่ผิดเด่น: ${subject.incorrectQuestions.join(', ') || 'ไม่มี'}
- คุณภาพข้อสอบ (KR-20): ${subject.kr20.toFixed(3)} ${subject.kr20 >= 0.8 ? '(ดีมาก)' : subject.kr20 >= 0.7 ? '(ดี)' : subject.kr20 >= 0.6 ? '(พอใช้)' : '(ควรปรับปรุง)'}
`).join('\n')}

โปรดเขียนรายงานที่ให้กำลังใจแต่ตรงไปตรงมา และให้คำแนะนำที่เป็นประโยชน์จริง ๆ ต่อการเรียนของนักเรียน`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'คุณเป็นผู้เชี่ยวชาญด้านการศึกษาและการให้คำปรึกษาทางวิชาการ คุณมีความเชี่ยวชาญในการวิเคราะห์ผลการสอบและให้คำแนะนำการเรียนที่เฉพาะเจาะจงและปฏิบัติได้จริง คุณเขียนรายงานที่ให้กำลังใจนักเรียนแต่ตรงไปตรงมา และให้ข้อมูลที่มีประโยชน์ต่อการเรียนรู้',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || '';
    if (content.trim().length === 0) {
      return buildDeterministicSummary(subjectSummaries);
    }
    return content;
  } catch (error) {
    console.error('OpenAI summary error:', error);
    return buildDeterministicSummary(
      subjects.map((subject) => {
        const studentData = student.subjects[subject.key];
        const insights = getUnitInsights(subject, studentData);
        return {
          name: subject.name,
          totalQuestions: subject.totalQuestions,
          correct: studentData?.correctCount ?? 0,
          score: Number((studentData?.score ?? 0).toFixed(1)),
          avgScore: Number(subject.avgScore.toFixed(1)),
          weakestUnits: insights.weakest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
          strongestUnits: insights.strongest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
          incorrectQuestions: insights.all
            .filter((entry) => entry.incorrect.length > 0)
            .flatMap((entry) => entry.incorrect.map((q) => `Q${q} ${entry.unit}`))
            .slice(0, 6),
        };
      })
    );
  }
}

function buildDeterministicSummary(
  subjectSummaries: {
    name: string;
    totalQuestions: number;
    correct: number;
    score: number;
    avgScore: number;
    strongestUnits: string[];
    weakestUnits: string[];
    incorrectQuestions: string[];
  }[]
) {
  return subjectSummaries
    .map((subject) => {
      const diff = subject.score - subject.avgScore;
      const compare = diff >= 0 ? `สูงกว่าค่าเฉลี่ย ${diff.toFixed(1)}%` : `ต่ำกว่าค่าเฉลี่ย ${Math.abs(diff).toFixed(1)}%`;
      const strongText = subject.strongestUnits.length ? subject.strongestUnits.join(', ') : 'ไม่มีข้อมูล';
      const weakText = subject.weakestUnits.length ? subject.weakestUnits.join(', ') : 'ไม่มีข้อมูล';
      const incorrectText = subject.incorrectQuestions.length ? subject.incorrectQuestions.join(', ') : 'ไม่มีข้อมูล';
      return `[${subject.name}]
คะแนน ${subject.correct}/${subject.totalQuestions} (${subject.score.toFixed(1)}%) ${compare}.
จุดแข็ง: ${strongText}.
จุดที่ควรปรับปรุง: ${weakText}.
ข้อที่ผิดเด่น: ${incorrectText}.`;
    })
    .join('\n\n');
}

function appendAISummary(doc: jsPDF, text: string) {
  if (!text) return;
  doc.addPage();
  addHeader(doc, 'AI Summary', '');
  const thaiReady = registerThaiFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 60;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont(thaiReady ? THAI_FONT_NAME : 'helvetica', 'normal');

  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  for (const line of lines) {
    const splitLines = doc.splitTextToSize(line, contentWidth);
    for (const splitLine of splitLines) {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = 30;
      }
      doc.text(splitLine, margin, yPos);
      yPos += 5;
    }
    yPos += 2;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const subjects: SubjectData[] = [];
    const skippedSubjects: string[] = [];

    for (const subject of SUBJECTS) {
      const file = formData.get(subject.fileField) as File | null;
      if (!file) {
        skippedSubjects.push(subject.name);
        continue;
      }

      const buffer = await file.arrayBuffer();
      const rows = readSheetRowsFromBuffer(buffer);
      const { students, questionNumbers: rawQuestionNumbers } = parseOMR(rows);
      const questionNumbers =
        rawQuestionNumbers.length > 0
          ? rawQuestionNumbers
          : Array.from({ length: subject.totalQuestions }, (_, idx) => idx + 1);

      const infoPath = path.resolve(process.cwd(), '..', subject.infoFile);
      const unitMap = parseProblemInfo(infoPath);
      const answerMap = FIXED_ANSWERS[subject.key];
      if (!answerMap) {
        return NextResponse.json({ error: `Missing fixed answers for ${subject.name}.` }, { status: 500 });
      }

      const stats = computeSubjectStats({ students, questionNumbers, answerMap, unitMap });

      subjects.push({
        key: subject.key,
        name: subject.name,
        totalQuestions: subject.totalQuestions,
        questionNumbers,
        students,
        answerMap,
        unitMap,
        questionStats: stats.questionStats,
        unitStats: stats.unitStats,
        avgScore: stats.avgScore,
        stdDev: stats.stdDev,
        median: stats.median,
        kr20: stats.kr20,
      });
    }

    if (subjects.length === 0) {
      return NextResponse.json({ error: 'No OMR files uploaded.' }, { status: 400 });
    }

    const studentIndex = buildStudentIndex(subjects);
    const reportsDir = path.resolve(process.cwd(), 'public', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    const statsOutput = {
      generatedAt: new Date().toISOString(),
      subjects: subjects.map((subject) => ({
        key: subject.key,
        name: subject.name,
        questionCount: subject.totalQuestions,
        totalStudents: subject.students.length,
        avgScore: Number(subject.avgScore.toFixed(2)),
        stdDev: Number(subject.stdDev.toFixed(2)),
        median: Number(subject.median.toFixed(2)),
        questionStats: Array.from(subject.questionStats.entries()).map(([q, stat]) => ({
          question: q,
          correct: stat.correct,
          total: stat.total,
          rate: stat.total ? Number(((stat.correct / stat.total) * 100).toFixed(2)) : 0,
          unit: subject.unitMap.get(q) || `Question ${q}`,
        })),
        unitStats: Array.from(subject.unitStats.entries()).map(([unit, stat]) => ({
          unit,
          correct: stat.correct,
          total: stat.total,
          rate: stat.total ? Number(((stat.correct / stat.total) * 100).toFixed(2)) : 0,
          questions: stat.questions,
        })),
      })),
    };

    fs.writeFileSync(path.resolve(reportsDir, 'stats.json'), JSON.stringify(statsOutput, null, 2), 'utf-8');

    let reportCount = 0;
    const files: { filename: string; data: string }[] = [];

    for (const student of studentIndex.values()) {
      const studentSubjects = subjects.filter((subject) => student.subjects[subject.key]);
      for (const subject of studentSubjects) {
        const doc = new jsPDF();
        addHeader(doc, 'Score Analysis Report', `Student: ${student.name} (ID: ${student.id})`);

        let yPos = 58;
        yPos = addSubjectSection(
          doc,
          subject,
          student.subjects[subject.key],
          subject.questionStats,
          yPos
        );

        const aiSummary = await generateAISummary(student, [subject]);
        appendAISummary(doc, aiSummary);

        const fileName = `Report_${sanitizeFilename(subject.key)}_${sanitizeFilename(student.id)}_${sanitizeFilename(student.name)}.pdf`;
        const pdfArrayBuffer = doc.output('arraybuffer');
        files.push({
          filename: fileName,
          data: Buffer.from(pdfArrayBuffer).toString('base64'),
        });
        reportCount += 1;
      }
    }

    return NextResponse.json({
      reportCount,
      statsPath: path.resolve(reportsDir, 'stats.json'),
      files,
      skippedSubjects,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate reports.' },
      { status: 500 }
    );
  }
}
