'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const QUESTION_CATEGORIES = [
  { start: 1, end: 10, category: 'Speaking', subCategory: 'Question and Response' },
  { start: 11, end: 20, category: 'Speaking', subCategory: 'Short conversations' },
  { start: 21, end: 30, category: 'Speaking', subCategory: 'Long conversations' },
  { start: 31, end: 45, category: 'Reading', subCategory: 'Text completion' },
  { start: 46, end: 60, category: 'Reading', subCategory: 'Reading comprehension' },
];

export default function AnalysisForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState<string[]>(Array(60).fill(''));
  const [studentAnswers, setStudentAnswers] = useState<string[]>(Array(60).fill(''));
  const [activeTab, setActiveTab] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    const formData = {
      name,
      correctAnswers: correctAnswers.map(a => parseInt(a) || 0),
      studentAnswers: studentAnswers.map(a => parseInt(a) || 0),
    };

    localStorage.setItem('examFormData', JSON.stringify(formData));
    router.push('/analysis');
  };

  const handleCorrectAnswerChange = (index: number, value: string) => {
    const newAnswers = [...correctAnswers];
    newAnswers[index] = value;
    setCorrectAnswers(newAnswers);
  };

  const handleStudentAnswerChange = (index: number, value: string) => {
    const newAnswers = [...studentAnswers];
    newAnswers[index] = value;
    setStudentAnswers(newAnswers);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 card-shadow">
      {/* 이름 입력 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 bg-blue-600 rounded"></div>
          <span className="font-medium text-gray-900">학생 정보</span>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력하세요"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      </div>

      {/* 문제 카테고리 탭 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 bg-blue-600 rounded"></div>
          <span className="font-medium text-gray-900">답안 입력 (60문제)</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {QUESTION_CATEGORIES.map((cat, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveTab(index)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                activeTab === index
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.subCategory} ({cat.start}-{cat.end})
            </button>
          ))}
        </div>

        {/* 현재 탭의 문제들 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-3">
            {QUESTION_CATEGORIES[activeTab].category} - {QUESTION_CATEGORIES[activeTab].subCategory}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium pb-2 border-b">
              <div className="col-span-2">문제</div>
              <div className="col-span-5">정답</div>
              <div className="col-span-5">내 답안</div>
            </div>

            {Array.from(
              { length: QUESTION_CATEGORIES[activeTab].end - QUESTION_CATEGORIES[activeTab].start + 1 },
              (_, i) => QUESTION_CATEGORIES[activeTab].start + i
            ).map((questionNum) => (
              <div key={questionNum} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2 text-sm font-medium text-gray-700">
                  Q{questionNum}
                </div>
                <div className="col-span-5">
                  <select
                    value={correctAnswers[questionNum - 1]}
                    onChange={(e) => handleCorrectAnswerChange(questionNum - 1, e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">선택</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div className="col-span-5">
                  <select
                    value={studentAnswers[questionNum - 1]}
                    onChange={(e) => handleStudentAnswerChange(questionNum - 1, e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">선택</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 입력 현황 */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="text-gray-500">
            정답 입력: <span className="font-medium text-blue-600">{correctAnswers.filter(a => a).length}/60</span>
          </div>
          <div className="text-gray-500">
            내 답안 입력: <span className="font-medium text-blue-600">{studentAnswers.filter(a => a).length}/60</span>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
      >
        결과 분석하기
      </button>
    </form>
  );
}
