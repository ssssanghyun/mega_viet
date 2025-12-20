'use client';

import Header from '@/components/Header';
import ProgressCircle from '@/components/ProgressCircle';
import AnalysisForm from '@/components/AnalysisForm';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Hero Section */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="fade-in">
              <div className="inline-block bg-gray-100 px-4 py-2 rounded-full text-sm text-gray-600 mb-6">
                가장 정확한 AI 분석 시스템
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                나의 <span className="text-blue-500">진짜</span> 위치
                <br />
                알아보기
              </h1>
              <p className="text-gray-600 mb-8">
                또래 학생들의 성취도와 나의 보완 부분을 알아보세요.
              </p>
              <Link
                href="/analysis"
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                무료로 점수 분석하기
                <ArrowRight size={18} />
              </Link>

              {/* Stats */}
              <div className="flex gap-12 mt-12">
                <div>
                  <div className="text-2xl font-bold text-gray-900">5만+</div>
                  <div className="text-sm text-gray-500">학생들이 사용합니다</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">4.8</div>
                  <div className="text-sm text-gray-500">후기가 입증합니다</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">98%</div>
                  <div className="text-sm text-gray-500">정확도가 보장됩니다</div>
                </div>
              </div>
            </div>

            {/* Right Content - Preview Card */}
            <div className="fade-in stagger-2">
              <div className="bg-white rounded-2xl p-6 card-shadow border border-gray-100">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-700">
                    귀하의 분석 결과
                  </span>
                </div>

                <div className="flex justify-center mb-6">
                  <ProgressCircle
                    percentage={85}
                    label="상위 15%"
                    sublabel="전국 단위"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-gray-600">표준 점수</span>
                    <span className="font-semibold text-gray-900">285</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-gray-600">전국 단위 위치</span>
                    <span className="font-semibold text-gray-900">850/5,420</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analysis Form Section */}
      <section id="analysis-form" className="py-16">
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-blue-600 mb-3 underline underline-offset-4">
              점수 분석
            </h2>
            <p className="text-gray-600">
              AI로 시험 점수를 분석하고 개인 맞춤형 학습 계획을 받아보세요.
            </p>
          </div>
          <AnalysisForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="text-xl font-bold mb-2">megastudy</div>
          <p className="text-gray-400 text-sm">
            AI 기반 점수 분석 서비스
          </p>
          <p className="text-gray-500 text-xs mt-4">
            © 2024 Megastudy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
