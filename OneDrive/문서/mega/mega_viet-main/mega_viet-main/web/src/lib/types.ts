export interface StudentResult {
  studentCode: string;
  date: string;
  id: string;
  point: number;
  maxPoint: number;
  rank: number;
  answers: QuestionResult[];
}

export interface QuestionResult {
  questionNumber: number;
  category: string;
  subCategory: string;
  correctAnswer: number;
  studentAnswer: number;
  isCorrect: boolean;
}

export interface ExamStatistics {
  totalStudents: number;
  averageScore: number;
  top10PercentAverage: number;
  medianScore: number;
  standardDeviation: number;
  maxScore: number;
  minScore: number;
  scoreDistribution: { range: string; count: number }[];
  questionStats: QuestionStatistics[];
  categoryStats: CategoryStatistics[];
}

export interface QuestionStatistics {
  questionNumber: number;
  category: string;
  subCategory: string;
  correctRate: number;
  totalAttempts: number;
  correctCount: number;
}

export interface CategoryStatistics {
  category: string;
  subCategory: string;
  averageCorrectRate: number;
  questionCount: number;
}

export interface StudentAnalysis {
  student: StudentResult;
  percentile: number;
  standardScore: number;
  nationalRank: number;
  totalParticipants: number;
  categoryPerformance: {
    category: string;
    subCategory: string;
    correctRate: number;
    averageRate: number;
    difference: number;
  }[];
  weakPoints: string[];
  strongPoints: string[];
}

export interface FormData {
  grade: string;
  targetUniversity: string;
  targetMajor: string;
  examName: string;
  examDate: string;
  score: string;
  percentile: string;
}

// Advanced Statistics Types
export interface QuestionDifficulty {
  questionNumber: number;
  pValue: number; // 난이도 (0-1, 높을수록 쉬움)
  category: string;
  subCategory: string;
}

export interface QuestionDiscrimination {
  questionNumber: number;
  dIndex: number; // 변별도 (D-index 근사값)
  top10Rate: number; // 상위 10% 정답률
  bottom10Rate: number; // 하위 10% 정답률
  gap: number; // 상위 - 하위 정답률 차이
  pValue: number;
  category: string;
  subCategory: string;
}

export interface DifficultyDistribution {
  easy: number; // p-value >= 0.7
  medium: number; // 0.3 < p-value < 0.7
  hard: number; // p-value <= 0.3
}

export interface DifficultyLevelPerformance {
  level: 'easy' | 'medium' | 'hard';
  studentCorrectRate: number; // 학생의 해당 난이도 구간 정답률
  averageCorrectRate: number; // 전체 평균
  questionCount: number;
  correctCount: number;
}

export interface AdvancedStatistics {
  kr20: number; // KR-20 신뢰도
  questionDifficulties: QuestionDifficulty[]; // 문항별 난이도
  questionDiscriminations: QuestionDiscrimination[]; // 문항별 변별도
  difficultyDistribution: DifficultyDistribution; // 난이도 분포
  studentDifficultyPerformance: DifficultyLevelPerformance[]; // 학생의 난이도 구간별 성취도
}
