'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DifficultyPerformance {
  level: 'easy' | 'medium' | 'hard';
  studentCorrectRate: number;
  averageCorrectRate: number;
  questionCount: number;
  correctCount: number;
}

interface DifficultyPerformanceChartProps {
  data: DifficultyPerformance[];
}

export default function DifficultyPerformanceChart({
  data,
}: DifficultyPerformanceChartProps) {
  const chartData = data.map((d) => ({
    name: d.level === 'easy' ? '쉬움' : d.level === 'medium' ? '중간' : '어려움',
    '나의 정답률': d.studentCorrectRate,
    '평균 정답률': d.averageCorrectRate,
    questionCount: d.questionCount,
    correctCount: d.correctCount,
  }));

  return (
    <div className="w-full">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{
                value: '정답률 (%)',
                angle: -90,
                position: 'insideLeft',
                fontSize: 12,
                fill: '#6b7280',
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white p-2 rounded shadow-lg border text-xs">
                      <p>{data.name}</p>
                      <p>나의 정답률: {data['나의 정답률'].toFixed(1)}%</p>
                      <p>평균 정답률: {data['평균 정답률'].toFixed(1)}%</p>
                      <p>문항 수: {data.questionCount}개</p>
                      <p>맞춘 문제: {data.correctCount}개</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Bar dataKey="나의 정답률" fill="#3b82f6" fillOpacity={0.8} />
            <Bar dataKey="평균 정답률" fill="#93c5fd" fillOpacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

