'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import ProgressCircle from '@/components/ProgressCircle';
import ScatterChart from '@/components/ScatterChart';
import UniversityCard from '@/components/UniversityCard';
import HistogramChart from '@/components/HistogramChart';
import DifficultyDistributionChart from '@/components/DifficultyDistributionChart';
import DifficultyDiscriminationChart from '@/components/DifficultyDiscriminationChart';
import TopBottomComparisonChart from '@/components/TopBottomComparisonChart';
import DifficultyPerformanceChart from '@/components/DifficultyPerformanceChart';
import {
  loadExamData,
  calculateStatistics,
  getScatterData,
  calculateAdvancedStatistics,
} from '@/lib/data';
import { StudentResult, ExamStatistics, AdvancedStatistics } from '@/lib/types';
import { Download, Share2, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

interface FormData {
  name: string;
  correctAnswers: number[];
  studentAnswers: number[];
}

interface CategoryPerformance {
  category: string;
  subCategory: string;
  correctCount: number;
  totalCount: number;
  correctRate: number;
  averageRate: number;
  difference: number;
}

const QUESTION_CATEGORIES = [
  { start: 1, end: 10, category: 'Speaking', subCategory: 'Question and Response' },
  { start: 11, end: 20, category: 'Speaking', subCategory: 'Short conversations' },
  { start: 21, end: 30, category: 'Speaking', subCategory: 'Long conversations' },
  { start: 31, end: 45, category: 'Reading', subCategory: 'Text completion' },
  { start: 46, end: 60, category: 'Reading', subCategory: 'Reading comprehension' },
];

export default function AnalysisPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [statistics, setStatistics] = useState<ExamStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculated results
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [percentile, setPercentile] = useState(0);
  const [standardScore, setStandardScore] = useState(0);
  const [nationalRank, setNationalRank] = useState(0);
  const [categoryPerformance, setCategoryPerformance] = useState<CategoryPerformance[]>([]);
  const [weakPoints, setWeakPoints] = useState<string[]>([]);
  const [strongPoints, setStrongPoints] = useState<string[]>([]);
  const [advancedStatistics, setAdvancedStatistics] = useState<AdvancedStatistics | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    async function initialize() {
      // Load form data from localStorage
      const savedData = localStorage.getItem('examFormData');
      if (!savedData) {
        router.push('/');
        return;
      }

      const parsed: FormData = JSON.parse(savedData);
      setFormData(parsed);

      // Load reference data for comparison
      try {
        const data = await loadExamData();
        setStudents(data);
        const stats = calculateStatistics(data);
        setStatistics(stats);

        // Calculate student's results (this will trigger AI analysis after weak/strong points are set)
        calculateResults(parsed, data, stats, parsed);

        // Calculate advanced statistics
        const advStats = calculateAdvancedStatistics(data, parsed.studentAnswers);
        setAdvancedStatistics(advStats);
      } catch (error) {
        console.error('Failed to load reference data:', error);
        // Calculate without reference data
        calculateResultsWithoutReference(parsed);
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [router]);

  const calculateResults = (data: FormData, refStudents: StudentResult[], stats: ExamStatistics, parsed: FormData) => {
    // Count correct answers
    let correct = 0;
    for (let i = 0; i < 60; i++) {
      if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
        correct++;
      }
    }
    setCorrectCount(correct);

    // Calculate score (assuming each question is worth equal points)
    const calculatedScore = (correct / 60) * 100;
    setScore(calculatedScore);

    // Calculate percentile based on reference data
    const scores = refStudents.map(s => s.point).sort((a, b) => b - a);
    const betterCount = scores.filter(s => s < calculatedScore).length;
    const calcPercentile = (betterCount / scores.length) * 100;
    setPercentile(calcPercentile);

    // Calculate standard score
    const calcStandardScore = 50 + ((calculatedScore - stats.averageScore) / stats.standardDeviation) * 10;
    setStandardScore(calcStandardScore);

    // Calculate national rank
    const rank = scores.filter(s => s > calculatedScore).length + 1;
    setNationalRank(rank);

    // Calculate category performance
    const catPerf: CategoryPerformance[] = QUESTION_CATEGORIES.map(cat => {
      let catCorrect = 0;
      let catTotal = cat.end - cat.start + 1;

      for (let i = cat.start - 1; i < cat.end; i++) {
        if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
          catCorrect++;
        }
      }

      const correctRate = (catCorrect / catTotal) * 100;

      // Get average rate from statistics
      const statCat = stats.categoryStats.find(
        s => s.category === cat.category && s.subCategory === cat.subCategory
      );
      const avgRate = statCat?.averageCorrectRate || 50;

      return {
        category: cat.category,
        subCategory: cat.subCategory,
        correctCount: catCorrect,
        totalCount: catTotal,
        correctRate,
        averageRate: avgRate,
        difference: correctRate - avgRate,
      };
    });

    setCategoryPerformance(catPerf);

    // Identify weak and strong points
    const weak = catPerf.filter(c => c.difference < -10).map(c => `${c.category} - ${c.subCategory}`);
    const strong = catPerf.filter(c => c.difference > 10).map(c => `${c.category} - ${c.subCategory}`);
    setWeakPoints(weak);
    setStrongPoints(strong);

    // Generate AI analysis after all data is ready (will be called after advancedStatistics is set)
    // Using setTimeout to ensure state updates are complete
    setTimeout(() => {
      generateAIAnalysis(data, refStudents, stats, weak, strong);
    }, 1000);
  };

  const generateAIAnalysis = async (
    data: FormData,
    refStudents: StudentResult[],
    stats: ExamStatistics,
    weakPointsList: string[],
    strongPointsList: string[]
  ) => {
    setLoadingAnalysis(true);
    try {
      // Calculate current score and percentile
      let correct = 0;
      for (let i = 0; i < 60; i++) {
        if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
          correct++;
        }
      }
      const currentScore = (correct / 60) * 100;
      const scores = refStudents.map(s => s.point).sort((a, b) => b - a);
      const betterCount = scores.filter(s => s < currentScore).length;
      const calcPercentile = (betterCount / scores.length) * 100;
      const rank = scores.filter(s => s > currentScore).length + 1;

      // Build category performance
      const catPerf = QUESTION_CATEGORIES.map(cat => {
        let catCorrect = 0;
        let catTotal = cat.end - cat.start + 1;
        for (let i = cat.start - 1; i < cat.end; i++) {
          if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
            catCorrect++;
          }
        }
        const correctRate = (catCorrect / catTotal) * 100;
        const statCat = stats.categoryStats.find(
          s => s.category === cat.category && s.subCategory === cat.subCategory
        );
        const avgRate = statCat?.averageCorrectRate || 50;
        return {
          category: cat.category,
          subCategory: cat.subCategory,
          correctCount: catCorrect,
          totalCount: catTotal,
          correctRate,
          averageRate: avgRate,
          difference: correctRate - avgRate,
        };
      });

      // Calculate incorrect questions with their categories
      const incorrectQuestions: Array<{ questionNumber: number; category: string; subCategory: string }> = [];
      for (let i = 0; i < 60; i++) {
        const questionNum = i + 1;
        // Check if answered incorrectly (answered but wrong) or not answered
        if (data.studentAnswers[i] !== 0 && data.correctAnswers[i] !== data.studentAnswers[i]) {
          // Find category for this question
          const categoryInfo = QUESTION_CATEGORIES.find(
            cat => questionNum >= cat.start && questionNum <= cat.end
          );
          if (categoryInfo) {
            incorrectQuestions.push({
              questionNumber: questionNum,
              category: categoryInfo.category,
              subCategory: categoryInfo.subCategory,
            });
          }
        }
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentName: data.name,
          score: currentScore,
          correctCount: correct,
          percentile: calcPercentile,
          nationalRank: rank,
          totalStudents: refStudents.length,
          categoryPerformance: catPerf,
          weakPoints: weakPointsList,
          strongPoints: strongPointsList,
          difficultyPerformance: (advancedStatistics && advancedStatistics.studentDifficultyPerformance.length > 0) 
            ? advancedStatistics.studentDifficultyPerformance 
            : [],
          statistics: stats,
          advancedStatistics: advancedStatistics,
          standardScore: standardScore,
          incorrectQuestions: incorrectQuestions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // 429 에러 (할당량 초과) 처리
        if (response.status === 429) {
          setAiAnalysis(`AI 분석을 생성할 수 없습니다.\n\nOpenAI API 할당량이 초과되었습니다. 관리자에게 문의하거나 잠시 후 다시 시도해주세요.\n\n통계 분석 결과는 아래에서 확인하실 수 있습니다.`);
          return;
        }
        
        throw new Error(errorData.error || `Failed to generate analysis: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      setAiAnalysis(result.analysis);
    } catch (error: any) {
      console.error('Failed to generate AI analysis:', error);
      
      // 에러 메시지를 사용자에게 표시
      if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('할당량')) {
        setAiAnalysis(`AI 분석을 생성할 수 없습니다.\n\nOpenAI API 할당량이 초과되었습니다. 관리자에게 문의하거나 잠시 후 다시 시도해주세요.\n\n통계 분석 결과는 아래에서 확인하실 수 있습니다.`);
      } else {
        setAiAnalysis(`AI 분석 생성 중 오류가 발생했습니다.\n\n${error.message || '알 수 없는 오류가 발생했습니다.'}\n\n통계 분석 결과는 아래에서 확인하실 수 있습니다.`);
      }
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const calculateResultsWithoutReference = (data: FormData) => {
    let correct = 0;
    for (let i = 0; i < 60; i++) {
      if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
        correct++;
      }
    }
    setCorrectCount(correct);
    const calculatedScore = (correct / 60) * 100;
    setScore(calculatedScore);
    setPercentile(50); // Default
    setStandardScore(50);
    setNationalRank(1);

    const catPerf: CategoryPerformance[] = QUESTION_CATEGORIES.map(cat => {
      let catCorrect = 0;
      let catTotal = cat.end - cat.start + 1;

      for (let i = cat.start - 1; i < cat.end; i++) {
        if (data.correctAnswers[i] === data.studentAnswers[i] && data.studentAnswers[i] !== 0) {
          catCorrect++;
        }
      }

      return {
        category: cat.category,
        subCategory: cat.subCategory,
        correctCount: catCorrect,
        totalCount: catTotal,
        correctRate: (catCorrect / catTotal) * 100,
        averageRate: 50,
        difference: 0,
      };
    });

    setCategoryPerformance(catPerf);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">결과를 분석하고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  const scatterData = getScatterData(students);
  const percentileDisplay = Math.round(100 - percentile);

  // Add current student to scatter data
  const studentPoint = {
    x: students.length + 1,
    y: score,
    id: 'current-student',
    rank: nationalRank,
  };

  // University recommendations based on percentile
  const getUniversityRecommendations = () => {
    if (percentileDisplay <= 10) {
      return [
        {
          tier: 'A Tier - 도전',
          tierLabel: '합격 확률 30-50%',
          tierColor: 'red',
          universities: [
            { name: '서울대학교', department: '자연과학대학', change: -5 },
            { name: '연세대학교', department: '공과대학', change: -3 },
            { name: '고려대학교', department: '이과대학', change: -2 },
          ],
        },
        {
          tier: 'B Tier - 적정',
          tierLabel: '합격 확률 50-80%',
          tierColor: 'orange',
          universities: [
            { name: '성균관대학교', department: '자연과학대학', change: 2 },
            { name: '한양대학교', department: '공과대학', change: 4 },
            { name: '중앙대학교', department: '이과대학', change: 5 },
          ],
        },
        {
          tier: 'C Tier - 안정',
          tierLabel: '합격 확률 80%+',
          tierColor: 'green',
          universities: [
            { name: '경희대학교', department: '자연과학대학', change: 8 },
            { name: '건국대학교', department: '공과대학', change: 10 },
            { name: '동국대학교', department: '이과대학', change: 12 },
          ],
        },
      ];
    } else if (percentileDisplay <= 30) {
      return [
        {
          tier: 'A Tier - 도전',
          tierLabel: '합격 확률 30-50%',
          tierColor: 'red',
          universities: [
            { name: '성균관대학교', department: '자연과학대학', change: -8 },
            { name: '한양대학교', department: '공과대학', change: -6 },
            { name: '중앙대학교', department: '이과대학', change: -4 },
          ],
        },
        {
          tier: 'B Tier - 적정',
          tierLabel: '합격 확률 50-80%',
          tierColor: 'orange',
          universities: [
            { name: '경희대학교', department: '자연과학대학', change: 2 },
            { name: '건국대학교', department: '공과대학', change: 4 },
            { name: '동국대학교', department: '이과대학', change: 5 },
          ],
        },
        {
          tier: 'C Tier - 안정',
          tierLabel: '합격 확률 80%+',
          tierColor: 'green',
          universities: [
            { name: '홍익대학교', department: '자연과학대학', change: 10 },
            { name: '숭실대학교', department: '공과대학', change: 12 },
            { name: '세종대학교', department: '이과대학', change: 15 },
          ],
        },
      ];
    } else {
      return [
        {
          tier: 'A Tier - 도전',
          tierLabel: '합격 확률 30-50%',
          tierColor: 'red',
          universities: [
            { name: '경희대학교', department: '자연과학대학', change: -10 },
            { name: '건국대학교', department: '공과대학', change: -8 },
            { name: '동국대학교', department: '이과대학', change: -6 },
          ],
        },
        {
          tier: 'B Tier - 적정',
          tierLabel: '합격 확률 50-80%',
          tierColor: 'orange',
          universities: [
            { name: '홍익대학교', department: '자연과학대학', change: 2 },
            { name: '숭실대학교', department: '공과대학', change: 4 },
            { name: '세종대학교', department: '이과대학', change: 5 },
          ],
        },
        {
          tier: 'C Tier - 안정',
          tierLabel: '합격 확률 80%+',
          tierColor: 'green',
          universities: [
            { name: '광운대학교', department: '자연과학대학', change: 10 },
            { name: '명지대학교', department: '공과대학', change: 12 },
            { name: '상명대학교', department: '이과대학', change: 15 },
          ],
        },
      ];
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">점수 분석 결과</h1>
          <div className="text-sm text-gray-500">
            학생: <span className="font-medium text-gray-900">{formData.name}</span>
          </div>
        </div>

        {/* ========== 1. 시험 결과 분석 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">1</span>
            시험 결과 분석
          </h2>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              value={score.toFixed(1)}
              label="원점수"
              sublabel={`${correctCount}/60 정답`}
              highlight
            />
            <StatCard
              value={`상위 ${percentileDisplay}%`}
              label="백분위"
              sublabel="전국 기준"
              highlight
            />
            <StatCard
              value={nationalRank.toLocaleString()}
              label="전국 순위"
              sublabel={`/${(students.length + 1).toLocaleString()}명`}
            />
            <StatCard
              value={standardScore.toFixed(0)}
              label="표준 점수"
              sublabel="T-Score"
            />
          </div>

          {/* 시험 품질 & 난이도 특성 */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">시험 품질</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  문항 수: 60문항
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  평균 점수: {statistics?.averageScore.toFixed(1) || '-'}점
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  표준편차: {statistics?.standardDeviation.toFixed(2) || '-'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  상위 10% 평균: {statistics?.top10PercentAverage.toFixed(1) || '-'}점
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">난이도 특성</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                이번 시험은 전반적으로 {statistics && statistics.averageScore < 50 ? '어려운' : statistics && statistics.averageScore < 70 ? '보통' : '쉬운'} 수준으로 출제되었습니다.
                {' '}귀하의 점수는 난이도를 고려했을 때 실질적으로{' '}
                <strong className="text-blue-600">상위 {percentileDisplay}%</strong> 수준에 해당합니다.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-blue-500" />
                <span className="text-xs text-gray-500">
                  {students.length}명의 응시자 데이터 기준
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ========== 2. 한눈에 보는 나의 위치 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">2</span>
            한눈에 보는 나의 위치
          </h2>

          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex-shrink-0">
              <ProgressCircle
                percentage={percentile}
                label={`상위 ${percentileDisplay}%`}
                sublabel="전국 단위"
                size={180}
              />
            </div>

            <div className="flex-1 w-full">
              <ScatterChart
                data={[...scatterData, studentPoint]}
                highlightId="current-student"
                averageScore={statistics?.averageScore}
              />
              <p className="text-xs text-gray-500 text-center mt-2">
                파란 점: 전체 응시자 / 빨간 별: 나의 위치
              </p>
            </div>
          </div>
        </section>

        {/* ========== 3. AI 종합 분석 보고서 ========== */}
        {aiAnalysis && (
        <section className="bg-white rounded-xl p-6 card-shadow mb-6">
            <h2 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">3</span>
              AI 종합 분석 보고서
            </h2>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-8 border-2 border-blue-200 shadow-sm">
                <div className="text-sm leading-7 space-y-4">
                  {aiAnalysis.split('\n').map((line, idx) => {
                    // 제목 스타일링
                    if (line.startsWith('##') || line.startsWith('###')) {
                      const level = line.startsWith('###') ? 3 : 2;
                      const text = line.replace(/^#+\s*/, '');
                      return (
                        <h3 
                          key={idx} 
                          className={`font-bold text-gray-900 mt-6 mb-3 ${level === 2 ? 'text-lg' : 'text-base'}`}
                        >
                          {text}
                        </h3>
                      );
                    }
                    // 번호 목록 스타일링
                    if (/^\d+\./.test(line.trim())) {
                      return (
                        <p key={idx} className="ml-4 pl-2 border-l-2 border-blue-300">
                          {line}
                        </p>
                      );
                    }
                    // 일반 텍스트
                    if (line.trim()) {
                      return <p key={idx}>{line}</p>;
                    }
                    return <br key={idx} />;
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {loadingAnalysis && (
          <section className="bg-white rounded-xl p-6 card-shadow mb-6">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium mb-2">AI가 종합 분석 보고서를 생성하고 있습니다...</p>
                <p className="text-sm text-gray-500">모든 통계 데이터를 종합하여 상세한 보고서를 작성 중입니다.</p>
              </div>
            </div>
          </section>
        )}

        {/* ========== 4. 시험 해석 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">4</span>
            시험 해석
          </h2>

          <div className="text-center py-6 border-b border-gray-100 mb-6">
            <div className="text-4xl font-bold text-blue-600 mb-2">상위 {percentileDisplay}%</div>
            <div className="text-sm text-gray-500">전국 단위 ({students.length + 1}명 중 {nationalRank}위)</div>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">점수 해석</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 원점수 {score.toFixed(1)}점으로 60문제 중 {correctCount}문제를 맞추셨습니다.</li>
                <li>• 표준점수 {standardScore.toFixed(0)}점은 난이도를 보정한 점수입니다.</li>
                <li>• 전국 {students.length + 1}명 중 {nationalRank}위에 해당합니다.</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">등급 환산</h3>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{Math.ceil(percentileDisplay / 11)}등급</div>
                  <div className="text-xs text-gray-500">예상 등급</div>
                </div>
                <div className="flex-1 text-sm text-gray-600">
                  {percentileDisplay <= 4 && '최상위권으로 SKY 대학 지원이 가능합니다.'}
                  {percentileDisplay > 4 && percentileDisplay <= 11 && '상위권으로 주요 대학 지원이 가능합니다.'}
                  {percentileDisplay > 11 && percentileDisplay <= 23 && '중상위권으로 중위권 대학 지원을 고려해보세요.'}
                  {percentileDisplay > 23 && percentileDisplay <= 40 && '중위권으로 안정적인 대학 선택을 추천드립니다.'}
                  {percentileDisplay > 40 && '기초 학습 보강이 필요합니다. 약점 영역을 집중 공략하세요.'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== 5. 지원 가능 대학 그룹 추천 ========== */}
        <section className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">5</span>
            지원 가능 대학 그룹 추천
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {getUniversityRecommendations().map((rec, index) => (
              <UniversityCard
                key={index}
                tier={rec.tier}
                tierLabel={rec.tierLabel}
                tierColor={rec.tierColor}
                universities={rec.universities}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            * 대학 추천은 참고용이며, 실제 입시 결과와 다를 수 있습니다.
          </p>
        </section>

        {/* ========== 6. 고급 통계 분석 ========== */}
        {advancedStatistics && statistics && (
          <section className="bg-white rounded-xl p-6 card-shadow mb-8">
            <h2 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">6</span>
              고급 통계 분석
            </h2>

            {/* KR-20 신뢰도 */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">KR-20 신뢰도</h3>
                  <p className="text-sm text-gray-600">
                    시험 점수의 일관성·안정성을 평가하는 지표입니다. 0.8 이상이면 매우 안정적인 시험입니다.
                  </p>
                </div>
                <div className="text-3xl font-bold text-blue-600">
                  {advancedStatistics.kr20.toFixed(3)}
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {advancedStatistics.kr20 >= 0.8
                  ? '매우 안정적인 시험입니다.'
                  : advancedStatistics.kr20 >= 0.6
                  ? '보통 수준의 신뢰도입니다.'
                  : '신뢰도가 낮아 문항 개선이 필요합니다.'}
              </div>
              <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">상세 설명</h4>
                <p className="text-xs text-gray-700 leading-relaxed">
                  <strong>KR-20 (Kuder-Richardson Formula 20)</strong>은 객관식 시험에서 가장 널리 사용되는 신뢰도 계수입니다. 
                  이 값은 0에서 1 사이이며, <strong>시험이 얼마나 일관되게 학생들의 능력을 측정하는지</strong>를 나타냅니다.
                </p>
                <ul className="text-xs text-gray-700 mt-2 space-y-1 list-disc list-inside">
                  <li><strong>0.8 이상:</strong> 매우 안정적인 시험. 동일한 학생이 다시 시험을 보면 비슷한 점수를 얻을 가능성이 높습니다.</li>
                  <li><strong>0.6-0.8:</strong> 보통 수준. 대부분의 시험에서 허용 가능한 수준입니다.</li>
                  <li><strong>0.6 미만:</strong> 신뢰도가 낮음. 문항의 난이도 균형이나 문항 수, 점수 분산 등이 영향을 줄 수 있습니다.</li>
                </ul>
                <p className="text-xs text-gray-700 mt-2">
                  높은 신뢰도는 <strong>문항 난이도가 적절하게 분산</strong>되어 있고, <strong>충분한 문항 수</strong>가 있으며, 
                  <strong>학생들의 점수 분산</strong>이 클 때 달성됩니다.
                </p>
              </div>
            </div>

            {/* 점수 분포 히스토그램 */}
            <div className="mb-8">
              <h3 className="font-medium text-gray-900 mb-4">점수 분포 (히스토그램)</h3>
              <p className="text-sm text-gray-600 mb-4">
                전체 집단의 점수 분포를 시각화하여 시험 난이도 및 점수 편향을 판단할 수 있습니다.
              </p>
              <HistogramChart data={statistics.scoreDistribution} />
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">그래프 해석 가이드</h4>
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  이 히스토그램은 <strong>전체 응시 학생들의 점수가 어떻게 분포되어 있는지</strong> 보여줍니다.
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside mb-2">
                  <li><strong>정규분포 형태:</strong> 좌우 대칭에 가까운 종 모양이면 이상적입니다. 이는 시험이 적절한 난이도를 가지고 있다는 의미입니다.</li>
                  <li><strong>왼쪽으로 치우침 (음의 왜도):</strong> 고점수대에 많은 학생이 몰려 있으면 시험이 쉬웠을 가능성이 있습니다.</li>
                  <li><strong>오른쪽으로 치우침 (양의 왜도):</strong> 저점수대에 많은 학생이 몰려 있으면 시험이 어려웠을 가능성이 있습니다.</li>
                  <li><strong>이중봉 형태:</strong> 두 개의 봉우리가 보이면 학생들의 실력이 두 집단으로 나뉘어 있거나, 일부 문항이 특정 집단에 유리했을 수 있습니다.</li>
                </ul>
                <p className="text-xs text-gray-700">
                  <strong>활용:</strong> 시험 난이도 조정 및 다음 시험 문제 출제 시 참고 자료로 활용할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 난이도 분포 */}
            <div className="mb-8">
              <h3 className="font-medium text-gray-900 mb-4">난이도 분포</h3>
              <p className="text-sm text-gray-600 mb-4">
                모든 문항의 p-value를 기준으로 쉬움(p≥0.7), 중간(0.3&lt;p&lt;0.7), 어려움(p≤0.3)으로 구분한 문항 수입니다.
              </p>
              <DifficultyDistributionChart
                easy={advancedStatistics.difficultyDistribution.easy}
                medium={advancedStatistics.difficultyDistribution.medium}
                hard={advancedStatistics.difficultyDistribution.hard}
              />
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="font-semibold text-green-700">
                    쉬움: {advancedStatistics.difficultyDistribution.easy}개
                  </div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="font-semibold text-yellow-700">
                    중간: {advancedStatistics.difficultyDistribution.medium}개
                  </div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="font-semibold text-red-700">
                    어려움: {advancedStatistics.difficultyDistribution.hard}개
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">난이도 분포의 의미</h4>
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  <strong>p-value (난이도 지수)</strong>는 전체 학생 중 정답을 맞힌 학생의 비율입니다. 
                  이 값을 기준으로 문항을 쉬움, 중간, 어려움으로 분류합니다.
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside mb-2">
                  <li><strong>쉬움 (p≥0.7):</strong> 70% 이상의 학생이 맞힌 문제. 기초 지식을 확인하는 문항에 적합합니다.</li>
                  <li><strong>중간 (0.3&lt;p&lt;0.7):</strong> 30-70%의 학생이 맞힌 문제. 표준적인 난이도로 대부분의 문항이 이 범위에 있어야 합니다.</li>
                  <li><strong>어려움 (p≤0.3):</strong> 30% 이하의 학생만 맞힌 문제. 변별력을 높이는 핵심 문항입니다.</li>
                </ul>
                <p className="text-xs text-gray-700 mb-2">
                  <strong>이상적인 분포:</strong> 중간 난이도 문항이 전체의 약 50-60%를 차지하고, 
                  쉬움과 어려움 문항이 각각 20-25% 정도인 것이 좋습니다. 이렇게 하면 시험이 적절한 변별력을 가지면서도 
                  대부분의 학생이 기본 점수를 얻을 수 있습니다.
                </p>
                <p className="text-xs text-gray-700">
                  <strong>현재 시험 평가:</strong> 중간 난이도 문항이 많으면 균형 잡힌 시험이며, 
                  쉬운 문항이 너무 많으면 변별력이 부족하고, 어려운 문항이 너무 많으면 학생들의 학습 동기 저하를 유발할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 난이도-변별도 산점도 */}
            <div className="mb-8">
              <h3 className="font-medium text-gray-900 mb-4">난이도-변별도 산점도</h3>
              <p className="text-sm text-gray-600 mb-4">
                각 문항의 난이도(가로축)와 변별도(세로축)를 조합해 문항 품질을 평가합니다. 
                변별도가 0.3 이상이면 좋은 문항, 0.1 이하이면 개선이 필요한 문항입니다.
              </p>
              <DifficultyDiscriminationChart
                data={advancedStatistics.questionDiscriminations.map((q: any) => ({
                  pValue: q.pValue,
                  dIndex: q.dIndex,
                  questionNumber: q.questionNumber,
                }))}
              />
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">산점도 읽는 방법</h4>
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  이 그래프는 각 문항의 <strong>난이도(p-value, 가로축)</strong>와 
                  <strong>변별도(D-index, 세로축)</strong>를 함께 보여줍니다. 
                  각 점은 하나의 문항을 나타내며, 점의 색깔은 변별도 수준을 나타냅니다.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div className="p-2 bg-white rounded border border-green-200">
                    <h5 className="text-xs font-semibold text-green-700 mb-1">🟢 좋은 문항 (녹색, D≥0.3)</h5>
                    <p className="text-xs text-gray-700">
                      상위 학생과 하위 학생을 잘 구분합니다. 시험에서 변별력이 높은 핵심 문항입니다.
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-yellow-200">
                    <h5 className="text-xs font-semibold text-yellow-700 mb-1">🟡 보통 문항 (노란색, 0.1≤D&lt;0.3)</h5>
                    <p className="text-xs text-gray-700">
                      어느 정도 변별력이 있으나 개선 여지가 있습니다. 대부분의 문항이 이 범위에 있습니다.
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-red-200">
                    <h5 className="text-xs font-semibold text-red-700 mb-1">🔴 개선 필요 (빨간색, D&lt;0.1)</h5>
                    <p className="text-xs text-gray-700">
                      상위와 하위 학생을 구분하지 못합니다. 문항 수정이나 삭제를 고려해야 합니다.
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-blue-200">
                      <h5 className="text-xs font-semibold text-blue-700 mb-1">이상적인 위치</h5>
                    <p className="text-xs text-gray-700">
                      난이도 0.3-0.7 사이, 변별도 0.3 이상인 문항이 가장 좋습니다. 
                      너무 쉽거나 어려운 문항은 변별도가 낮을 수 있습니다.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-700 mt-3">
                  <strong>활용:</strong> 다음 시험 출제 시 개선이 필요한 문항(빨간색)을 수정하거나 제거하고, 
                  좋은 문항(녹색)의 패턴을 참고하여 유사한 문항을 출제할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 상위 10% vs 하위 10% 비교 */}
            <div className="mb-8">
              <h3 className="font-medium text-gray-900 mb-4">상위 10% vs 하위 10% 비교</h3>
              <p className="text-sm text-gray-600 mb-4">
                두 집단의 문항별 정답률을 비교해 시험이 능력을 구분하는 정도를 확인합니다. 
                Gap(상위 정답률 - 하위 정답률)이 클수록 변별력이 좋은 문항입니다.
              </p>
              <TopBottomComparisonChart
                data={advancedStatistics.questionDiscriminations.map((q: any) => ({
                  questionNumber: q.questionNumber,
                  top10Rate: q.top10Rate,
                  bottom10Rate: q.bottom10Rate,
                  gap: q.gap,
                }))}
              />
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">비교 그래프 해석</h4>
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  이 그래프는 <strong>상위 10% 학생</strong>과 <strong>하위 10% 학생</strong>의 문항별 정답률을 비교합니다. 
                  파란색 막대는 상위 10%, 빨간색 막대는 하위 10%의 정답률을 나타냅니다.
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside mb-2">
                  <li><strong>Gap이 큰 문항:</strong> 상위 학생은 많이 맞히고 하위 학생은 많이 틀린 문제입니다. 
                  이는 문항이 학생의 실력을 잘 구분한다는 의미로, <strong>변별력이 높은 좋은 문항</strong>입니다.</li>
                  <li><strong>Gap이 작은 문항:</strong> 상위와 하위 학생 모두 비슷한 정답률을 보입니다. 
                  실력을 구분하지 못하므로 <strong>개선이 필요한 문항</strong>입니다.</li>
                  <li><strong>역전 현상:</strong> 하위 학생의 정답률이 상위 학생보다 높으면 문항에 문제가 있을 수 있습니다.</li>
                </ul>
                <p className="text-xs text-gray-700 mb-2">
                  <strong>변별도 평가 기준:</strong>
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside mb-2">
                  <li>Gap ≥ 0.3 (30%p 이상): 매우 좋음 - 상위와 하위를 명확히 구분</li>
                  <li>0.2 ≤ Gap &lt; 0.3: 좋음 - 적절한 변별력</li>
                  <li>0.1 ≤ Gap &lt; 0.2: 보통 - 어느 정도 구분 가능</li>
                  <li>Gap &lt; 0.1: 부족 - 실력 구분이 어려움</li>
                </ul>
                <p className="text-xs text-gray-700">
                  <strong>활용:</strong> Gap이 작은 문항들은 다음 시험에서 수정하거나 제거를 고려하고, 
                  Gap이 큰 문항들은 좋은 문항으로 판단하여 유사한 난이도와 형식의 문항을 출제할 때 참고합니다.
                </p>
              </div>
            </div>

            {/* 난이도 구간별 학생 정답률 */}
            {advancedStatistics.studentDifficultyPerformance &&
              advancedStatistics.studentDifficultyPerformance.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-medium text-gray-900 mb-4">난이도 구간별 나의 정답률</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    쉬운 문제를 틀리면 기초 부족, 어려운 문제를 맞추면 상위권 잠재력 등 학생의 실력 구조를 해석할 수 있습니다.
                  </p>
                  <DifficultyPerformanceChart data={advancedStatistics.studentDifficultyPerformance} />
                  <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-900 mb-2">나의 성취도 분석</h4>
                    <p className="text-xs text-gray-700 leading-relaxed mb-2">
                      이 그래프는 <strong>쉬움, 중간, 어려움</strong> 각 난이도 구간에서 
                      나의 정답률(파란색)과 전체 평균 정답률(연한 파란색)을 비교합니다.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                      <div className="p-2 bg-green-50 rounded border border-green-200">
                        <h5 className="text-xs font-semibold text-green-700 mb-1">🟢 쉬운 문항 분석</h5>
                        <p className="text-xs text-gray-700">
                          <strong>평균 이상:</strong> 기초가 탄탄합니다. <br/>
                          <strong>평균 이하:</strong> 기초 학습이 필요합니다. 기본 개념을 다시 정리하세요.
                        </p>
                      </div>
                      <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                        <h5 className="text-xs font-semibold text-yellow-700 mb-1">🟡 중간 문항 분석</h5>
                        <p className="text-xs text-gray-700">
                          <strong>평균 이상:</strong> 표준 실력을 가지고 있습니다. <br/>
                          <strong>평균 이하:</strong> 추가 학습과 연습이 필요합니다.
                        </p>
                      </div>
                      <div className="p-2 bg-red-50 rounded border border-red-200">
                        <h5 className="text-xs font-semibold text-red-700 mb-1">🔴 어려운 문항 분석</h5>
                        <p className="text-xs text-gray-700">
                          <strong>평균 이상:</strong> 상위권 잠재력이 있습니다. <br/>
                          <strong>평균 이하:</strong> 고난도 문제 연습이 필요합니다.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                      <h5 className="text-xs font-semibold text-blue-700 mb-1">학습 전략 제안</h5>
                      <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                        <li><strong>쉬운 문항 정답률이 낮다면:</strong> 기본 개념을 확실히 이해하고 기초 문제를 반복 학습하세요.</li>
                        <li><strong>중간 문항이 부족하다면:</strong> 표준 수준의 문제를 풀며 실전 감각을 기르세요.</li>
                        <li><strong>어려운 문항을 잘 맞힌다면:</strong> 상위권을 목표로 고난도 문제 풀이와 심화 학습을 진행하세요.</li>
                        <li><strong>모든 구간에서 평균 이상:</strong> 전반적으로 우수한 실력을 보유하고 있습니다. 유지와 더 높은 목표 설정을 권장합니다.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

            {/* 문항별 난이도 표 (상위 10개) */}
            <div className="mb-8">
              <h3 className="font-medium text-gray-900 mb-4">문항별 난이도 (p-value) 상위 10개</h3>
              <p className="text-sm text-gray-600 mb-4">
                p-value가 높을수록 쉬운 문항이고, 낮을수록 어려운 문항입니다. 
                아래 표는 가장 쉬운 10개 문항을 보여줍니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-4">문제</th>
                      <th className="text-right py-2 px-4">p-value</th>
                      <th className="text-left py-2 px-4">난이도</th>
                      <th className="text-left py-2 px-4">카테고리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...advancedStatistics.questionDifficulties]
                      .sort((a: any, b: any) => b.pValue - a.pValue)
                      .slice(0, 10)
                      .map((q: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2 px-4 font-medium">Q{q.questionNumber}</td>
                          <td className="py-2 px-4 text-right">
                            {(q.pValue * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                q.pValue >= 0.7
                                  ? 'bg-green-100 text-green-700'
                                  : q.pValue > 0.3
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {q.pValue >= 0.7 ? '쉬움' : q.pValue > 0.3 ? '중간' : '어려움'}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-gray-600">
                            {q.category} - {q.subCategory}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-900 mb-2">p-value 이해하기</h4>
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  <strong>p-value (난이도 지수)</strong>는 전체 응시 학생 중 해당 문항을 정답으로 맞힌 학생의 비율입니다. 
                  이 값은 0에서 1 사이이며, 1에 가까울수록 쉬운 문항, 0에 가까울수록 어려운 문항입니다.
                </p>
                <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside mb-2">
                  <li><strong>p-value = 1.0:</strong> 모든 학생이 맞힌 문항 (100%)</li>
                  <li><strong>p-value = 0.8:</strong> 80%의 학생이 맞힌 문항 (매우 쉬움)</li>
                  <li><strong>p-value = 0.5:</strong> 50%의 학생이 맞힌 문항 (중간 난이도, 이상적)</li>
                  <li><strong>p-value = 0.3:</strong> 30%의 학생만 맞힌 문항 (어려움)</li>
                  <li><strong>p-value = 0.0:</strong> 아무도 맞히지 못한 문항 (매우 어려움)</li>
                </ul>
                <p className="text-xs text-gray-700">
                  <strong>활용:</strong> 자신이 틀린 문제의 p-value를 확인하여, 
                  쉬운 문제를 틀렸다면 기초 학습이, 어려운 문제를 틀렸다면 심화 학습이 필요합니다. 
                  또한 시험 제작자는 p-value가 0.2 이하이거나 0.9 이상인 문항은 개선을 고려해야 합니다.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ========== 7. 과목별 약점 분석 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-8">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">7</span>
            과목별 약점 분석
          </h2>

          {/* Category Performance Bars */}
          <div className="space-y-4 mb-6">
            {categoryPerformance.map((cat, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {cat.category} - {cat.subCategory}
                    </span>
                    {cat.difference > 5 ? (
                      <TrendingUp className="text-green-500" size={14} />
                    ) : cat.difference < -5 ? (
                      <TrendingDown className="text-red-500" size={14} />
                    ) : (
                      <Minus className="text-gray-400" size={14} />
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold text-gray-900">{cat.correctCount}/{cat.totalCount}</span>
                    <span className="text-gray-500 ml-1">({cat.correctRate.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      cat.correctRate >= 80
                        ? 'bg-green-500'
                        : cat.correctRate >= 60
                        ? 'bg-blue-500'
                        : cat.correctRate >= 40
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${cat.correctRate}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  평균 대비: {cat.difference > 0 ? '+' : ''}{cat.difference.toFixed(1)}%p
                </div>
              </div>
            ))}
          </div>

          {/* Weak/Strong Points Summary */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-red-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-900 mb-2 flex items-center gap-2">
                <TrendingDown size={16} />
                보완이 필요한 영역
              </h3>
              {weakPoints.length > 0 ? (
                <ul className="text-sm text-red-800 space-y-1">
                  {weakPoints.map((point, i) => (
                    <li key={i}>• {point}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-red-700">모든 영역에서 평균 이상의 성적을 보이고 있습니다.</p>
              )}
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-900 mb-2 flex items-center gap-2">
                <TrendingUp size={16} />
                강점 영역
              </h3>
              {strongPoints.length > 0 ? (
                <ul className="text-sm text-green-800 space-y-1">
                  {strongPoints.map((point, i) => (
                    <li key={i}>• {point}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-green-700">특별히 두드러지는 강점 영역이 없습니다. 전반적인 실력 향상이 필요합니다.</p>
              )}
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <button className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
            <Download size={18} />
            리포트 다운로드
          </button>
          <button className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            <Share2 size={18} />
            결과 공유
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="text-xl font-bold mb-2">megastudy</div>
          <p className="text-gray-400 text-sm">AI 기반 점수 분석 서비스</p>
          <p className="text-gray-500 text-xs mt-4">
            © 2024 Megastudy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
