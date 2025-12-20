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

interface QuestionComparison {
  questionNumber: number;
  top10Rate: number;
  bottom10Rate: number;
  gap: number;
}

interface TopBottomComparisonChartProps {
  data: QuestionComparison[];
  maxQuestions?: number; // Show only first N questions for readability
}

export default function TopBottomComparisonChart({
  data,
  maxQuestions = 20,
}: TopBottomComparisonChartProps) {
  const displayData = data.slice(0, maxQuestions).map((q) => ({
    question: `Q${q.questionNumber}`,
    '상위 10%': (q.top10Rate * 100).toFixed(1),
    '하위 10%': (q.bottom10Rate * 100).toFixed(1),
    gap: (q.gap * 100).toFixed(1),
  }));

  return (
    <div className="w-full">
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="question"
              tick={{ fontSize: 10, fill: '#6b7280' }}
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
                  return (
                    <div className="bg-white p-2 rounded shadow-lg border text-xs">
                      <p>{payload[0].payload.question}</p>
                      <p>상위 10%: {payload[0].payload['상위 10%']}%</p>
                      <p>하위 10%: {payload[0].payload['하위 10%']}%</p>
                      <p>Gap: {payload[0].payload.gap}%</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Bar dataKey="상위 10%" fill="#3b82f6" fillOpacity={0.7} />
            <Bar dataKey="하위 10%" fill="#ef4444" fillOpacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > maxQuestions && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          처음 {maxQuestions}개 문항만 표시 (전체 {data.length}개)
        </p>
      )}
    </div>
  );
}

