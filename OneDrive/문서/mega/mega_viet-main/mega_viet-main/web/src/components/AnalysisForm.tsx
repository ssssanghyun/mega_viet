'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCorrectAnswers } from '@/lib/data';

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
  const [correctAnswers, setCorrectAnswers] = useState<number[]>(Array(60).fill(0));
  const [studentAnswers, setStudentAnswers] = useState<string[]>(Array(60).fill(''));
  const [activeTab, setActiveTab] = useState(0);

  // Load correct answers from exam data
  useEffect(() => {
    const correct = getCorrectAnswers();
    setCorrectAnswers(correct);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    const formData = {
      name,
      correctAnswers: correctAnswers,
      studentAnswers: studentAnswers.map(a => parseInt(a) || 0),
    };

    localStorage.setItem('examFormData', JSON.stringify(formData));
    router.push('/analysis');
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
              <div className="col-span-3">정답</div>
              <div className="col-span-7">내 답안</div>
            </div>

            {Array.from(
              { length: QUESTION_CATEGORIES[activeTab].end - QUESTION_CATEGORIES[activeTab].start + 1 },
              (_, i) => QUESTION_CATEGORIES[activeTab].start + i
            ).map((questionNum) => (
              <div key={questionNum} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2 text-sm font-medium text-gray-700">
                  Q{questionNum}
                </div>
                <div className="col-span-3">
                  <div className="w-full px-2 py-1.5 bg-gray-100 border border-gray-200 rounded text-sm text-center text-gray-700 font-medium">
                    {correctAnswers[questionNum - 1] || '-'}
                  </div>
                </div>
                <div className="col-span-7">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={studentAnswers[questionNum - 1]}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Only allow 1-4 or empty string
                      if (value === '' || /^[1-4]$/.test(value)) {
                        handleStudentAnswerChange(questionNum - 1, value);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow control keys (backspace, delete, tab, escape, enter, arrow keys)
                      const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
                      if (allowedKeys.includes(e.key)) {
                        return;
                      }
                      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                      if ((e.key === 'a' || e.key === 'c' || e.key === 'v' || e.key === 'x') && e.ctrlKey) {
                        return;
                      }
                      // Only allow digits 1-4
                      if (!/^[1-4]$/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="1-4"
                    maxLength={1}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 입력 현황 */}
        <div className="mt-4 flex items-center justify-center text-sm">
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
