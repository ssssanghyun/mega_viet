import {
  StudentResult,
  ExamStatistics,
  QuestionStatistics,
  CategoryStatistics,
  StudentAnalysis,
  AdvancedStatistics,
  QuestionDifficulty,
  QuestionDiscrimination,
  DifficultyDistribution,
  DifficultyLevelPerformance,
} from './types';
import { examData } from './examData';

// Question categories mapping (used for statistics calculations)
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

/**
 * Load exam data from hardcoded data file
 * This avoids Excel file reading errors and improves performance
 */
export async function loadExamData(): Promise<StudentResult[]> {
  // Return the hardcoded exam data directly
  // Using Promise.resolve to maintain the async API for backward compatibility
  return Promise.resolve(examData);
}

/**
 * Get correct answers for all 60 questions
 * Extracts correct answers from the exam data (all students have the same correct answers)
 */
export function getCorrectAnswers(): number[] {
  if (examData.length === 0) {
    return Array(60).fill(0);
  }
  
  // Extract correct answers from the first student (all students have the same correct answers)
  const firstStudent = examData[0];
  return firstStudent.answers
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((answer) => answer.correctAnswer);
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

/**
 * Calculate advanced statistics including p-value, D-index, KR-20
 */
export function calculateAdvancedStatistics(
  students: StudentResult[],
  studentAnswers?: number[]
): AdvancedStatistics {
  if (students.length === 0) {
    return {
      kr20: 0,
      questionDifficulties: [],
      questionDiscriminations: [],
      difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
      studentDifficultyPerformance: [],
    };
  }

  const totalStudents = students.length;
  const top10Count = Math.ceil(totalStudents * 0.1);
  const bottom10Count = Math.ceil(totalStudents * 0.1);

  // Sort students by score
  const sortedStudents = [...students].sort((a, b) => b.point - a.point);
  const top10Students = sortedStudents.slice(0, top10Count);
  const bottom10Students = sortedStudents.slice(-bottom10Count);

  // Calculate question difficulties (p-value)
  const questionDifficulties: QuestionDifficulty[] = [];
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

    const pValue = totalAttempts > 0 ? correctCount / totalAttempts : 0;

    questionDifficulties.push({
      questionNumber: q,
      pValue,
      category: categoryInfo.category,
      subCategory: categoryInfo.subCategory,
    });
  }

  // Calculate question discriminations (D-index)
  const questionDiscriminations: QuestionDiscrimination[] = [];
  for (let q = 1; q <= 60; q++) {
    const categoryInfo = questionCategories[q] || { category: 'Unknown', subCategory: 'Unknown' };
    
    // Top 10% correct rate
    let top10Correct = 0;
    top10Students.forEach((student) => {
      const answer = student.answers.find((a) => a.questionNumber === q);
      if (answer && answer.isCorrect) top10Correct++;
    });
    const top10Rate = top10Count > 0 ? top10Correct / top10Count : 0;

    // Bottom 10% correct rate
    let bottom10Correct = 0;
    bottom10Students.forEach((student) => {
      const answer = student.answers.find((a) => a.questionNumber === q);
      if (answer && answer.isCorrect) bottom10Correct++;
    });
    const bottom10Rate = bottom10Count > 0 ? bottom10Correct / bottom10Count : 0;

    const gap = top10Rate - bottom10Rate;
    const dIndex = gap; // Simplified D-index approximation

    const pValue = questionDifficulties[q - 1].pValue;

    questionDiscriminations.push({
      questionNumber: q,
      dIndex,
      top10Rate,
      bottom10Rate,
      gap,
      pValue,
      category: categoryInfo.category,
      subCategory: categoryInfo.subCategory,
    });
  }

  // Difficulty distribution
  const difficultyDistribution: DifficultyDistribution = {
    easy: questionDifficulties.filter((q) => q.pValue >= 0.7).length,
    medium: questionDifficulties.filter((q) => q.pValue > 0.3 && q.pValue < 0.7).length,
    hard: questionDifficulties.filter((q) => q.pValue <= 0.3).length,
  };

  // Calculate KR-20 reliability
  const kr20 = calculateKR20(students, questionDifficulties);

  // Student difficulty performance (if student answers provided)
  let studentDifficultyPerformance: DifficultyLevelPerformance[] = [];
  if (studentAnswers) {
    const easyQuestions = questionDifficulties.filter((q) => q.pValue >= 0.7).map((q) => q.questionNumber);
    const mediumQuestions = questionDifficulties.filter((q) => q.pValue > 0.3 && q.pValue < 0.7).map((q) => q.questionNumber);
    const hardQuestions = questionDifficulties.filter((q) => q.pValue <= 0.3).map((q) => q.questionNumber);

    // Get correct answers
    const correctAnswers = getCorrectAnswers();

    // Calculate performance for each difficulty level
    const calculateLevelPerformance = (questionNumbers: number[], level: 'easy' | 'medium' | 'hard') => {
      let correct = 0;
      questionNumbers.forEach((qNum) => {
        if (studentAnswers[qNum - 1] === correctAnswers[qNum - 1] && studentAnswers[qNum - 1] !== 0) {
          correct++;
        }
      });
      const total = questionNumbers.length;
      const correctRate = total > 0 ? (correct / total) * 100 : 0;

      // Calculate average for this level
      const avgCorrectRate = questionNumbers.reduce((sum, qNum) => {
        const q = questionDifficulties.find((qd) => qd.questionNumber === qNum);
        return sum + (q ? q.pValue * 100 : 0);
      }, 0) / total;

      return {
        level,
        studentCorrectRate: correctRate,
        averageCorrectRate: avgCorrectRate,
        questionCount: total,
        correctCount: correct,
      };
    };

    studentDifficultyPerformance = [
      calculateLevelPerformance(easyQuestions, 'easy'),
      calculateLevelPerformance(mediumQuestions, 'medium'),
      calculateLevelPerformance(hardQuestions, 'hard'),
    ];
  }

  return {
    kr20,
    questionDifficulties,
    questionDiscriminations,
    difficultyDistribution,
    studentDifficultyPerformance,
  };
}

/**
 * Calculate KR-20 reliability coefficient
 */
function calculateKR20(students: StudentResult[], questionDifficulties: QuestionDifficulty[]): number {
  if (students.length === 0 || questionDifficulties.length === 0) return 0;

  const totalQuestions = questionDifficulties.length;
  const totalStudents = students.length;

  // Calculate total score variance
  const scores = students.map((s) => s.point);
  const meanScore = scores.reduce((a, b) => a + b, 0) / totalStudents;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) / totalStudents;

  if (variance === 0) return 0;

  // Calculate sum of pq for each question
  let sumPQ = 0;
  questionDifficulties.forEach((q) => {
    const p = q.pValue;
    const q_val = 1 - p;
    sumPQ += p * q_val;
  });

  // KR-20 formula: (n / (n-1)) * (1 - sum(pq) / variance)
  const kr20 = (totalQuestions / (totalQuestions - 1)) * (1 - sumPQ / variance);

  return Math.max(0, Math.min(1, kr20)); // Clamp between 0 and 1
}
