import * as XLSX from 'xlsx';
import {
  StudentResult,
  QuestionResult,
  ExamStatistics,
  QuestionStatistics,
  CategoryStatistics,
  StudentAnalysis,
} from './types';

// Question categories mapping
const questionCategories: { [key: number]: { category: string; subCategory: string } } = {};

// Questions 1-10: Speaking Question and Response
for (let i = 1; i <= 10; i++) {
  questionCategories[i] = { category: 'Speaking', subCategory: 'Question and Response' };
}
// Questions 11-20: Speaking Short conversations
for (let i = 11; i <= 20; i++) {
  questionCategories[i] = { category: 'Speaking', subCategory: 'Short conversations' };
}
// Questions 21-30: Speaking Long conversations
for (let i = 21; i <= 30; i++) {
  questionCategories[i] = { category: 'Speaking', subCategory: 'Long conversations' };
}
// Questions 31-45: Reading Text completion
for (let i = 31; i <= 45; i++) {
  questionCategories[i] = { category: 'Reading', subCategory: 'Text completion' };
}
// Questions 46-60: Reading Reading comprehension
for (let i = 46; i <= 60; i++) {
  questionCategories[i] = { category: 'Reading', subCategory: 'Reading comprehension' };
}

export async function loadExamData(): Promise<StudentResult[]> {
  const response = await fetch('/data.xlsx');
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

  const students: StudentResult[] = [];

  // Skip header rows (0, 1) and process student data starting from row 2
  for (let rowIndex = 2; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex];
    if (!row || !row[0]) continue;

    const studentCode = String(row[0] || '');
    const date = String(row[1] || '');
    const id = String(row[2] || '');
    const pointStr = String(row[3] || '0');
    const rankStr = String(row[4] || '0');

    // Parse point (format: "95.17 / 100")
    const pointMatch = pointStr.match(/(\d+\.?\d*)/);
    const point = pointMatch ? parseFloat(pointMatch[1]) : 0;
    const maxPoint = 100;

    const rank = parseInt(rankStr) || 0;

    const answers: QuestionResult[] = [];

    // Each question has 3 columns: answer, input, conclusion (O/X)
    // Starting from column 5 (index 5)
    for (let q = 1; q <= 60; q++) {
      const baseIndex = 5 + (q - 1) * 3;
      const correctAnswer = parseInt(String(row[baseIndex] || '0')) || 0;
      const studentAnswer = parseInt(String(row[baseIndex + 1] || '0')) || 0;
      const conclusion = String(row[baseIndex + 2] || '');
      const isCorrect = conclusion === 'O';

      const categoryInfo = questionCategories[q] || { category: 'Unknown', subCategory: 'Unknown' };

      answers.push({
        questionNumber: q,
        category: categoryInfo.category,
        subCategory: categoryInfo.subCategory,
        correctAnswer,
        studentAnswer,
        isCorrect,
      });
    }

    students.push({
      studentCode,
      date,
      id,
      point,
      maxPoint,
      rank,
      answers,
    });
  }

  return students;
}

export function calculateStatistics(students: StudentResult[]): ExamStatistics {
  if (students.length === 0) {
    return {
      totalStudents: 0,
      averageScore: 0,
      top10PercentAverage: 0,
      medianScore: 0,
      standardDeviation: 0,
      maxScore: 0,
      minScore: 0,
      scoreDistribution: [],
      questionStats: [],
      categoryStats: [],
    };
  }

  const scores = students.map((s) => s.point).sort((a, b) => b - a);
  const totalStudents = students.length;

  // Average score
  const averageScore = scores.reduce((a, b) => a + b, 0) / totalStudents;

  // Top 10% average
  const top10Count = Math.ceil(totalStudents * 0.1);
  const top10PercentAverage = scores.slice(0, top10Count).reduce((a, b) => a + b, 0) / top10Count;

  // Median
  const medianScore =
    totalStudents % 2 === 0
      ? (scores[totalStudents / 2 - 1] + scores[totalStudents / 2]) / 2
      : scores[Math.floor(totalStudents / 2)];

  // Standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - averageScore, 2), 0) / totalStudents;
  const standardDeviation = Math.sqrt(variance);

  // Max and min
  const maxScore = scores[0];
  const minScore = scores[scores.length - 1];

  // Score distribution
  const ranges = [
    { range: '90-100', min: 90, max: 100 },
    { range: '80-89', min: 80, max: 89.99 },
    { range: '70-79', min: 70, max: 79.99 },
    { range: '60-69', min: 60, max: 69.99 },
    { range: '50-59', min: 50, max: 59.99 },
    { range: '40-49', min: 40, max: 49.99 },
    { range: '30-39', min: 30, max: 39.99 },
    { range: '0-29', min: 0, max: 29.99 },
  ];

  const scoreDistribution = ranges.map(({ range, min, max }) => ({
    range,
    count: scores.filter((s) => s >= min && s <= max).length,
  }));

  // Question statistics
  const questionStats: QuestionStatistics[] = [];
  for (let q = 1; q <= 60; q++) {
    const categoryInfo = questionCategories[q] || { category: 'Unknown', subCategory: 'Unknown' };
    let correctCount = 0;
    let totalAttempts = 0;

    students.forEach((student) => {
      const answer = student.answers.find((a) => a.questionNumber === q);
      if (answer) {
        totalAttempts++;
        if (answer.isCorrect) correctCount++;
      }
    });

    questionStats.push({
      questionNumber: q,
      category: categoryInfo.category,
      subCategory: categoryInfo.subCategory,
      correctRate: totalAttempts > 0 ? (correctCount / totalAttempts) * 100 : 0,
      totalAttempts,
      correctCount,
    });
  }

  // Category statistics
  const categoryGroups = new Map<string, QuestionStatistics[]>();
  questionStats.forEach((qs) => {
    const key = `${qs.category}|${qs.subCategory}`;
    if (!categoryGroups.has(key)) {
      categoryGroups.set(key, []);
    }
    categoryGroups.get(key)!.push(qs);
  });

  const categoryStats: CategoryStatistics[] = [];
  categoryGroups.forEach((questions, key) => {
    const [category, subCategory] = key.split('|');
    const avgCorrectRate = questions.reduce((sum, q) => sum + q.correctRate, 0) / questions.length;
    categoryStats.push({
      category,
      subCategory,
      averageCorrectRate: avgCorrectRate,
      questionCount: questions.length,
    });
  });

  return {
    totalStudents,
    averageScore,
    top10PercentAverage,
    medianScore,
    standardDeviation,
    maxScore,
    minScore,
    scoreDistribution,
    questionStats,
    categoryStats,
  };
}

export function analyzeStudent(
  studentId: string,
  students: StudentResult[],
  statistics: ExamStatistics
): StudentAnalysis | null {
  const student = students.find((s) => s.id === studentId || s.studentCode === studentId);
  if (!student) return null;

  const scores = students.map((s) => s.point).sort((a, b) => b - a);
  const studentRank = scores.findIndex((s) => s <= student.point) + 1;
  const percentile = ((students.length - studentRank + 1) / students.length) * 100;

  // Standard score calculation (T-score style)
  const standardScore = 50 + ((student.point - statistics.averageScore) / statistics.standardDeviation) * 10;

  // Category performance
  const categoryPerformance: StudentAnalysis['categoryPerformance'] = [];
  statistics.categoryStats.forEach((catStat) => {
    const studentQuestions = student.answers.filter(
      (a) => a.category === catStat.category && a.subCategory === catStat.subCategory
    );
    const correctCount = studentQuestions.filter((a) => a.isCorrect).length;
    const studentRate = (correctCount / studentQuestions.length) * 100;

    categoryPerformance.push({
      category: catStat.category,
      subCategory: catStat.subCategory,
      correctRate: studentRate,
      averageRate: catStat.averageCorrectRate,
      difference: studentRate - catStat.averageCorrectRate,
    });
  });

  // Identify weak and strong points
  const weakPoints = categoryPerformance
    .filter((cp) => cp.difference < -10)
    .map((cp) => `${cp.category} - ${cp.subCategory}`);

  const strongPoints = categoryPerformance
    .filter((cp) => cp.difference > 10)
    .map((cp) => `${cp.category} - ${cp.subCategory}`);

  return {
    student,
    percentile,
    standardScore: Math.round(standardScore * 10) / 10,
    nationalRank: studentRank,
    totalParticipants: students.length,
    categoryPerformance,
    weakPoints,
    strongPoints,
  };
}

export function getScatterData(students: StudentResult[]) {
  return students.map((student, index) => ({
    x: index + 1,
    y: student.point,
    id: student.id,
    rank: student.rank,
  }));
}
