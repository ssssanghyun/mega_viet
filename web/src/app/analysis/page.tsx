'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import ProgressCircle from '@/components/ProgressCircle';
import ScatterChart from '@/components/ScatterChart';
import UniversityCard from '@/components/UniversityCard';
import {
  loadExamData,
  calculateStatistics,
  getScatterData,
} from '@/lib/data';
import { StudentResult, ExamStatistics } from '@/lib/types';
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

        // Calculate student's results
        calculateResults(parsed, data, stats);
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

  const calculateResults = (data: FormData, refStudents: StudentResult[], stats: ExamStatistics) => {
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
    setWeakPoints(catPerf.filter(c => c.difference < -10).map(c => `${c.category} - ${c.subCategory}`));
    setStrongPoints(catPerf.filter(c => c.difference > 10).map(c => `${c.category} - ${c.subCategory}`));
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

        {/* ========== 3. 시험 해석 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">3</span>
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

        {/* ========== 4. 지원 가능 대학 그룹 추천 ========== */}
        <section className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">4</span>
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

        {/* ========== 5. 과목별 약점 분석 ========== */}
        <section className="bg-white rounded-xl p-6 card-shadow mb-8">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">5</span>
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
