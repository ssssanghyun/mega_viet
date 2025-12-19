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
