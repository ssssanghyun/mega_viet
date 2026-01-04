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

  return { questionStats, unitStats, avgScore, stdDev, median };
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

  const cardWidth = (contentWidth - 15) / 5;
  const cardHeight = 24;
  const totalQuestions = subject.questionNumbers.length;
  const percentile = 100 - (student.topPercent ?? 100);
  const cards = [
    { label: 'Total Score', value: `맞은개수, 총점 ${student.correctCount ?? 0}/${totalQuestions}` },
    { label: 'Percentile', value: `${percentile}th` },
    { label: 'Top %', value: `Top ${student.topPercent ?? 100}%` },
    { label: 'Estimated Rank', value: `${student.nationalRank ?? 0}` },
    { label: 'Total Participants', value: `${TOTAL_PARTICIPANTS}` },
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
    addHeader(doc, 'Score Analysis Report', student.name);
    yPos = 58;
  }

  // Difficulty Level Performance 섹션 (먼저)
  const difficulty = computeDifficultyPerformance(subject, student);
  if (difficulty.total > 0) {
    yPos = drawDifficultyPerformanceChart(doc, subject, student, yPos);
    
    if (yPos > pageHeight - 80) {
      doc.addPage();
      addHeader(doc, 'Score Analysis Report', student.name);
      yPos = 58;
    }
  }

  yPos = drawQuestionRateChart(doc, subject, student, yPos);

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', student.name);
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
    addHeader(doc, 'Score Analysis Report', student.name);
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
    addHeader(doc, 'Score Analysis Report', student.name);
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
    addHeader(doc, 'Score Analysis Report', student.name);
    yPos = 58;
  }

  if (yPos > pageHeight - 80) {
    doc.addPage();
    addHeader(doc, 'Score Analysis Report', student.name);
    yPos = 58;
  }

  const questionTable = subject.questionNumbers.map((qNum) => {
    const stat = questionStats.get(qNum);
    const rate = stat && stat.total ? ((stat.correct / stat.total) * 100).toFixed(1) : '0.0';
    return [qNum, `${stat?.correct ?? 0}/${stat?.total ?? 0}`, `${rate}%`, subject.unitMap.get(qNum) || `Question ${qNum}`];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Q', 'Correct/Total', 'Rate', 'Unit']],
    body: questionTable,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.08 },
      1: { cellWidth: contentWidth * 0.2 },
      2: { cellWidth: contentWidth * 0.12 },
      3: { cellWidth: contentWidth * 0.6 },
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
  const avgScore = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

  // 영역 구분을 위한 배경색 추가
  // 왼쪽 하단: 낮은 점수 영역 (빨간색/주황색 계열 - 연한 색상)
  doc.setFillColor(254, 226, 226); // 연한 빨간색
  doc.rect(chartLeft, chartTop + chartHeight / 2, chartWidth / 2, chartHeight / 2, 'F');
  
  // 오른쪽 상단: 높은 점수 영역 (초록색/파란색 계열 - 연한 색상)
  doc.setFillColor(219, 234, 254); // 연한 파란색
  doc.rect(chartLeft + chartWidth / 2, chartTop, chartWidth / 2, chartHeight / 2, 'F');

  // 평균 기준선 (수평선)
  const avgY = chartBottom - ((avgScore - minScore) / (maxScore - minScore || 1) * chartHeight);
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(1);
  doc.setLineDashPattern([5, 5], 0);
  doc.line(chartLeft, avgY, chartLeft + chartWidth, avgY);
  doc.setLineDashPattern([], 0);

  // 대각선 기준선 (왼쪽 하단에서 오른쪽 상단으로)
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(chartLeft, chartBottom, chartLeft + chartWidth, chartTop);
  doc.setLineDashPattern([], 0);

  // 영역 레이블 추가
  doc.setFontSize(7);
  // 왼쪽 하단: "낮은 점수"
  doc.setTextColor(220, 38, 38); // 빨간색
  doc.setFont('helvetica', 'bold');
  doc.text('낮은 점수', chartLeft + 5, chartBottom - 5);
  
  // 오른쪽 상단: "높은 점수"
  doc.setTextColor(34, 197, 94); // 초록색
  doc.text('높은 점수', chartLeft + chartWidth - 35, chartTop + 8);

  // 평균 기준선 레이블
  doc.setFontSize(6);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'normal');
  doc.text(`평균 ${avgScore.toFixed(1)}`, chartLeft + chartWidth - 40, avgY - 2);

  // 그래프 테두리 다시 그리기 (배경색 위에)
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(1);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight);

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
  const percentile = 100 - (student.topPercent ?? 100);
  doc.text(`Percentile: ${percentile}th`, chartLeft, statsY);
  doc.text(`Top ${student.topPercent ?? 100}%`, chartLeft + 90, statsY);
  doc.text(`Est. Rank: ${student.nationalRank ?? 0}`, chartLeft, statsY + 10);
  doc.text(`Total: ${TOTAL_PARTICIPANTS}`, chartLeft + 90, statsY + 10);

  return statsY + 18;
}

function buildThaiInterpretation(subject: SubjectData, student: StudentRecord) {
  const lines: string[] = [];
  const topPercent = student.topPercent ?? 100;
  const nationalRank = student.nationalRank ?? 0;
  const percentile = 100 - topPercent;

  lines.push(`• อันดับระดับประเทศ: อยู่ในกลุ่มบน ${topPercent}% (ประมาณ ${nationalRank} จาก ${TOTAL_PARTICIPANTS} คน)`);
  lines.push(`• Percentile: ${percentile}th (แสดงว่าคะแนนของคุณสูงกว่าผู้สอบ ${percentile}% ของผู้สอบทั้งหมด)`);

  const peerInfo = computePeerBand(subject, student, 5);
  if (peerInfo.count > 0) {
    lines.push(`• นักเรียนที่มีระดับการเรียนรู้เดียวกัน: ${peerInfo.count} คน`);
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

function drawQuestionRateChart(doc: jsPDF, subject: SubjectData, student: StudentRecord, startY: number) {
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
    
    // 학생이 해당 문제를 맞췄는지 확인
    const correctAnswer = subject.answerMap.get(qNum) || 0;
    const studentAnswer = student.answers[idx] || 0;
    const isCorrect = studentAnswer !== 0 && studentAnswer === correctAnswer;
    
    // 맞힌 문항: 파란색, 틀린 문항: 빨간색/주황색
    if (isCorrect) {
      doc.setFillColor(147, 197, 253); // 파란색 (맞힌 문항)
    } else {
      doc.setFillColor(251, 146, 60); // 주황색 (틀린 문항)
    }
    
    doc.rect(x + 1, chartTop + (maxHeight - height), Math.max(1, barWidth - 2), height, 'F');
  });

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  subject.questionNumbers.forEach((qNum, idx) => {
    if (qNum % 5 !== 0 && qNum !== 1 && qNum !== subject.totalQuestions) return;
    const x = margin + idx * barWidth;
    doc.text(String(qNum), x, chartTop + maxHeight + 6);
  });

  return chartTop + maxHeight + 12;
}

function drawDifficultyPerformanceChart(doc: jsPDF, subject: SubjectData, student: StudentRecord, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const chartHeight = 50;
  const yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text('Difficulty Level Performance', margin + 8, yPos + 9);

  const chartTop = yPos + 18;
  const chartLeft = margin;
  const chartWidth = contentWidth;
  const chartBottom = chartTop + chartHeight;
  const barWidth = chartWidth / 3;
  const maxHeight = chartHeight - 20; // 레이블 공간 확보

  const difficulty = computeDifficultyPerformance(subject, student);
  
  // 그래프 배경
  doc.setDrawColor(229, 231, 235);
  doc.rect(chartLeft, chartTop, chartWidth, chartHeight);

  // 각 난이도별 바 차트 그리기
  const levels = [
    { key: 'easy', label: 'Easy', color: [34, 197, 94], data: difficulty.easy }, // 초록색
    { key: 'medium', label: 'Medium', color: [251, 191, 36], data: difficulty.medium }, // 노란색
    { key: 'hard', label: 'Hard', color: [239, 68, 68], data: difficulty.hard }, // 빨간색
  ];

  levels.forEach((level, idx) => {
    const x = chartLeft + idx * barWidth;
    const rate = level.data.total > 0 ? (level.data.correct / level.data.total) * 100 : 0;
    const height = (rate / 100) * maxHeight;
    const barY = chartBottom - height - 5;

    // 바 차트
    doc.setFillColor(level.color[0], level.color[1], level.color[2]);
    doc.rect(x + 5, barY, barWidth - 10, height, 'F');

    // 정답률 텍스트
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(`${rate.toFixed(0)}%`, x + barWidth / 2, barY - 3, { align: 'center' });

    // 레이블 (Easy/Medium/Hard)
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(level.label, x + barWidth / 2, chartBottom + 8, { align: 'center' });

    // 정답/전체 표시
    doc.setFontSize(6);
    doc.text(`${level.data.correct}/${level.data.total}`, x + barWidth / 2, chartBottom + 15, { align: 'center' });
  });

  // Y축 레이블
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Correct Rate (%)', chartLeft - 5, chartTop + chartHeight / 2, { angle: -90, align: 'center' });

  return chartBottom + 20;
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

      return {
        name: subject.name,
        totalQuestions: subject.totalQuestions,
        correct: studentData?.correctCount ?? 0,
        score: Number((studentData?.score ?? 0).toFixed(1)),
        avgScore: Number(subject.avgScore.toFixed(1)),
        weakestUnits: weakest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
        strongestUnits: strongest.map((entry) => `${entry.unit} (${entry.correct}/${entry.total}, ${entry.rate.toFixed(0)}%)`),
        incorrectQuestions: incorrectQuestions.map((item) => `Q${item.q} ${item.unit} (cohort ${item.cohortRate}%)`),
      };
    });

    const prompt = `เขียนสรุปผล OMR ของนักเรียนจากข้อมูลด้านล่าง โดยสรุปแยกตามวิชา

ข้อกำหนด:
- เขียนเป็นภาษาไทย
- วิชาละ 3-4 ประโยค
- ต้องระบุ: คะแนนรวม (ถูก/จำนวนข้อ), เทียบค่าเฉลี่ยของวิชา, หน่วยที่ทำได้ดี 1-2 หน่วย, หน่วยที่ควรปรับปรุง 1-2 หน่วย, ข้อที่ผิดเด่น ๆ
- จุดแข็ง/จุดอ่อนต้องอ้างอิงจากสัดส่วนถูก/ทั้งหมดของหน่วยนั้นจริง
- ขึ้นหัวข้อแต่ละวิชาด้วยรูปแบบ [ชื่อวิชา] เช่น [MATH 1]

학생: ${student.name}

데이터:
${subjectSummaries.map((subject) => `\n[${subject.name}]\n- 정답/문항수: ${subject.correct}/${subject.totalQuestions}\n- 점수: ${subject.score}%\n- 과목 평균: ${subject.avgScore}%\n- 강점 단원: ${subject.strongestUnits.join(', ') || '없음'}\n- 약점 단원: ${subject.weakestUnits.join(', ') || '없음'}\n- 대표 오답: ${subject.incorrectQuestions.join(', ') || '없음'}`).join('\n')}
`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'คุณเป็นผู้เชี่ยวชาญด้านรายงานผลสอบ สรุปให้กระชับและชัดเจนโดยใช้เฉพาะข้อมูลที่ให้มา',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 700,
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

function appendAISummary(doc: jsPDF, text: string, studentName: string) {
  if (!text) return;
  doc.addPage();
  addHeader(doc, 'AI Summary', studentName);
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
        addHeader(doc, 'Score Analysis Report', student.name);

        let yPos = 58;
        yPos = addSubjectSection(
          doc,
          subject,
          student.subjects[subject.key],
          subject.questionStats,
          yPos
        );

        const aiSummary = await generateAISummary(student, [subject]);
        appendAISummary(doc, aiSummary, student.name);

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
