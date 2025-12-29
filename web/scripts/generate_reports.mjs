import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const repoRoot = process.cwd();

const SUBJECTS = [
  {
    key: 'math1',
    name: 'MATH 1',
    omrSheet: 'MATH 1_OMR',
    infoSheet: 'MATH 1',
    answerSheet: 'Sheet1',
    answerColumns: { qIdx: 0, aIdx: 1 },
  },
  {
    key: 'math2',
    name: 'MATH 2',
    omrSheet: 'MATH 2_OMR',
    infoSheet: 'MATH 2',
    answerSheet: 'Sheet1',
    answerColumns: { qIdx: 3, aIdx: 4 },
  },
  {
    key: 'eng',
    name: 'ENG',
    omrSheet: 'ENG_OMR',
    infoSheet: 'ENG',
    answerSheet: 'Sheet1',
    answerColumns: { qIdx: 6, aIdx: 7 },
  },
];

const reportsDir = path.resolve(repoRoot, 'web/public/reports');
const answerPath = path.resolve(repoRoot, 'Answer.xlsx');

function findDiagnosisFile() {
  const entries = fs.readdirSync(repoRoot);
  const direct = entries.find((name) => /진단평가.*\.xlsx$/u.test(name.normalize('NFC')));
  if (direct) return path.resolve(repoRoot, direct);

  const xlsxFiles = entries.filter((name) => name.toLowerCase().endsWith('.xlsx'));
  const candidate = xlsxFiles.find((name) => name !== 'Answer.xlsx' && name !== 'TGAT69 Mockup exam_20251209.xlsx');
  if (candidate) {
    const candidatePath = path.resolve(repoRoot, candidate);
    try {
      const workbook = XLSX.readFile(candidatePath, { bookSheets: true });
      if (workbook.SheetNames.includes('MATH 1_OMR')) return candidatePath;
    } catch (_error) {
      // Ignore broken candidate.
    }
  }

  for (const name of xlsxFiles) {
    if (name === 'Answer.xlsx') continue;
    const candidatePath = path.resolve(repoRoot, name);
    try {
      const workbook = XLSX.readFile(candidatePath, { bookSheets: true });
      if (workbook.SheetNames.includes('MATH 1_OMR')) return candidatePath;
    } catch (_error) {
      // Ignore broken candidate.
    }
  }

  return null;
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

function readSheetAsArray(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

function parseAnswerSheet(rows, columnsOverride) {
  if (rows.length === 0) return { answers: new Map(), questionCount: 0 };

  let qIdx = columnsOverride?.qIdx ?? 16;
  let aIdx = columnsOverride?.aIdx ?? 0;
  let startRow = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const qHeader = String(row[qIdx] ?? '').trim().toLowerCase();
    const aHeader = String(row[aIdx] ?? '').trim().toLowerCase();
    if ((qHeader === 'q' || qHeader === 'question') && (aHeader === 'a' || aHeader === 'answer')) {
      startRow = i + 1;
      break;
    }
  }

  const answers = new Map();
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const qVal = parseInt(String(row[qIdx] ?? '').trim(), 10);
    if (!Number.isFinite(qVal) || qVal <= 0) continue;
    const aVal = parseInt(String(row[aIdx] ?? '').trim(), 10);
    answers.set(qVal, Number.isFinite(aVal) ? aVal : 0);
  }

  const questionCount = Math.max(0, ...answers.keys());
  return { answers, questionCount };
}

function findQuestionRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const numericCount = rows[i].filter((cell) => {
      const num = parseInt(String(cell).trim(), 10);
      return Number.isFinite(num) && num > 0;
    }).length;
    if (numericCount >= 5) return i;
  }
  return -1;
}

function parseQuestionUnits(rows) {
  const questionRowIdx = findQuestionRow(rows);
  if (questionRowIdx === -1) return new Map();

  let unitRowIdx = questionRowIdx + 1;
  while (unitRowIdx < rows.length && rows[unitRowIdx].every((cell) => String(cell).trim() === '')) {
    unitRowIdx += 1;
  }
  if (unitRowIdx >= rows.length) return new Map();

  const questionRow = rows[questionRowIdx];
  const unitRow = rows[unitRowIdx];
  const units = new Map();

  questionRow.forEach((cell, idx) => {
    const qNum = parseInt(String(cell).trim(), 10);
    if (!Number.isFinite(qNum) || qNum <= 0) return;
    const unit = String(unitRow[idx] ?? '').trim();
    units.set(qNum, unit || `Question ${qNum}`);
  });

  return units;
}

function parseOMR(rows) {
  if (rows.length === 0) return { students: [], questionNumbers: [] };

  const header = rows[0].map((cell) => String(cell).trim());
  const headerLower = header.map((cell) => cell.toLowerCase());

  const idIdx = headerLower.indexOf('id');
  const nameIdx = headerLower.indexOf('user_name');

  const questionColumns = [];
  header.forEach((cell, idx) => {
    const qNum = parseInt(String(cell).trim(), 10);
    if (Number.isFinite(qNum) && qNum > 0) {
      questionColumns.push({ idx, qNum });
    }
  });

  const questionNumbers = questionColumns.map((q) => q.qNum).sort((a, b) => a - b);

  const students = [];
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

function sanitizeFilename(value) {
  return value
    .replace(/\s+/g, '_')
    .replace(/[^\w\-\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function computeSubjectStats(subject, answerMap, unitsMap) {
  const { students, questionNumbers } = subject;
  const questionCount = questionNumbers.length;

  const questionStats = new Map();
  questionNumbers.forEach((q) => {
    questionStats.set(q, { correct: 0, total: 0 });
  });

  const unitStats = new Map();

  students.forEach((student) => {
    let correctCount = 0;
    const unitResults = new Map();

    questionNumbers.forEach((qNum, idx) => {
      const correctAnswer = answerMap.get(qNum) || 0;
      const studentAnswer = student.answers[idx] || 0;
      const isCorrect = studentAnswer !== 0 && studentAnswer === correctAnswer;

      if (isCorrect) correctCount += 1;

      const qStat = questionStats.get(qNum);
      if (qStat) {
        qStat.total += 1;
        if (isCorrect) qStat.correct += 1;
      }

      const unitName = unitsMap.get(qNum) || `Question ${qNum}`;
      const unitEntry = unitResults.get(unitName) || { correct: 0, total: 0, incorrect: [] };
      unitEntry.total += 1;
      if (isCorrect) {
        unitEntry.correct += 1;
      } else {
        unitEntry.incorrect.push(qNum);
      }
      unitResults.set(unitName, unitEntry);
    });

    const score = questionCount ? (correctCount / questionCount) * 100 : 0;
    student.correctCount = correctCount;
    student.score = score;
    student.unitResults = unitResults;
  });

  const scores = students.map((s) => s.score || 0).sort((a, b) => b - a);
  students.forEach((student) => {
    const rank = scores.findIndex((s) => s === student.score) + 1;
    student.rank = rank;
    student.topPercent = Math.max(1, Math.min(100, Math.round((rank / scores.length) * 100)));
  });

  questionStats.forEach((stat, qNum) => {
    const unitName = unitsMap.get(qNum) || `Question ${qNum}`;
    const unitEntry = unitStats.get(unitName) || { correct: 0, total: 0, questions: [] };
    unitEntry.correct += stat.correct;
    unitEntry.total += stat.total;
    unitEntry.questions.push(qNum);
    unitStats.set(unitName, unitEntry);
  });

  const avgScore = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

  return {
    questionStats,
    unitStats,
    avgScore,
  };
}

function addHeader(doc, title, studentLabel) {
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
  doc.text(studentLabel, margin, 48);
}

function addSubjectSummary(doc, subjectName, student, questionCount, unitResults, startY) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = startY;

  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, 3, 12, 'F');
  doc.setFontSize(12);
  doc.setTextColor(59, 130, 246);
  doc.setFont('helvetica', 'bold');
  doc.text(subjectName, margin + 8, yPos + 9);

  yPos += 18;

  const cardWidth = (contentWidth - 10) / 3;
  const cardHeight = 24;
  const cards = [
    { label: 'Correct', value: `${student.correctCount}/${questionCount}` },
    { label: 'Score', value: `${(student.score || 0).toFixed(1)}%` },
    { label: 'Rank', value: `Top ${student.topPercent}%` },
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

  yPos += cardHeight + 10;

  const tableBody = Array.from(unitResults.entries()).map(([unitName, result]) => {
    const rate = result.total ? ((result.correct / result.total) * 100).toFixed(1) : '0.0';
    const incorrectList = result.incorrect.length ? result.incorrect.join(', ') : '-';
    return [unitName, `${result.correct}/${result.total}`, `${rate}%`, incorrectList];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Unit', 'Correct/Total', 'Rate', 'Incorrect Q']],
    body: tableBody,
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

  return (doc.lastAutoTable?.finalY || yPos) + 10;
}

function generateStudentPDF(student, subjectsData) {
  const doc = new jsPDF();
  const studentLabel = `Student: ${student.name} (ID: ${student.id})`;

  addHeader(doc, 'Score Analysis Report', studentLabel);

  let yPos = 58;

  subjectsData.forEach((subject, index) => {
    if (index > 0 && yPos > 220) {
      doc.addPage();
      addHeader(doc, 'Score Analysis Report', studentLabel);
      yPos = 58;
    }

    yPos = addSubjectSummary(
      doc,
      subject.name,
      student.subjects[subject.key],
      subject.questionCount,
      student.subjects[subject.key].unitResults,
      yPos
    );
  });

  return doc;
}

function buildStudentIndex(subjectsData) {
  const studentIndex = new Map();
  subjectsData.forEach((subject) => {
    subject.students.forEach((student) => {
      const key = `${student.id}::${student.name}`;
      if (!studentIndex.has(key)) {
        studentIndex.set(key, {
          id: student.id,
          name: student.name,
          subjects: {},
        });
      }
      studentIndex.get(key).subjects[subject.key] = student;
    });
  });
  return studentIndex;
}

function main() {
  const diagnosisPath = findDiagnosisFile();
  if (!diagnosisPath) {
    throw new Error('Diagnosis Excel file not found in repo root.');
  }

  ensureFileExists(diagnosisPath);
  ensureFileExists(answerPath);
  fs.mkdirSync(reportsDir, { recursive: true });

  const diagnosisWorkbook = XLSX.readFile(diagnosisPath);
  const answerWorkbook = XLSX.readFile(answerPath);

  const subjectsData = SUBJECTS.map((subject) => {
    const omrRows = readSheetAsArray(diagnosisWorkbook, subject.omrSheet);
    const infoRows = readSheetAsArray(diagnosisWorkbook, subject.infoSheet);
    const answerRows = readSheetAsArray(answerWorkbook, subject.answerSheet);

    const { students, questionNumbers } = parseOMR(omrRows);
    const unitMap = parseQuestionUnits(infoRows);
    const { answers: answerMap, questionCount } = parseAnswerSheet(answerRows, subject.answerColumns);

    const stats = computeSubjectStats({ students, questionNumbers }, answerMap, unitMap);

    return {
      ...subject,
      students,
      questionCount: questionCount || questionNumbers.length,
      questionNumbers,
      unitMap,
      answerMap,
      stats,
    };
  });

  const studentIndex = buildStudentIndex(subjectsData);

  const statsOutput = {
    generatedAt: new Date().toISOString(),
    subjects: subjectsData.map((subject) => ({
      key: subject.key,
      name: subject.name,
      questionCount: subject.questionCount,
      totalStudents: subject.students.length,
      avgScore: Number(subject.stats.avgScore.toFixed(2)),
      questionStats: Array.from(subject.stats.questionStats.entries()).map(([q, stat]) => ({
        question: q,
        correct: stat.correct,
        total: stat.total,
        rate: stat.total ? Number(((stat.correct / stat.total) * 100).toFixed(2)) : 0,
        unit: subject.unitMap.get(q) || `Question ${q}`,
      })),
      unitStats: Array.from(subject.stats.unitStats.entries()).map(([unit, stat]) => ({
        unit,
        correct: stat.correct,
        total: stat.total,
        rate: stat.total ? Number(((stat.correct / stat.total) * 100).toFixed(2)) : 0,
        questions: stat.questions,
      })),
    })),
  };

  fs.writeFileSync(
    path.resolve(reportsDir, 'stats.json'),
    JSON.stringify(statsOutput, null, 2),
    'utf-8'
  );

  for (const student of studentIndex.values()) {
    const missingSubjects = SUBJECTS.filter((s) => !student.subjects[s.key]);
    if (missingSubjects.length > 0) {
      missingSubjects.forEach((s) => {
        student.subjects[s.key] = {
          correctCount: 0,
          score: 0,
          topPercent: 100,
          unitResults: new Map(),
        };
      });
    }

    const doc = generateStudentPDF(student, subjectsData);
    const fileName = `Report_${sanitizeFilename(student.id)}_${sanitizeFilename(student.name)}.pdf`;
    const filePath = path.resolve(reportsDir, fileName);

    const pdfArrayBuffer = doc.output('arraybuffer');
    fs.writeFileSync(filePath, Buffer.from(pdfArrayBuffer));
  }

  console.log(`Generated ${studentIndex.size} reports in ${reportsDir}`);
  console.log(`Stats saved to ${path.resolve(reportsDir, 'stats.json')}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
