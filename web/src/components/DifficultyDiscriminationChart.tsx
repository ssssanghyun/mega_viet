'use client';

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface QuestionPoint {
  pValue: number; // 난이도 (가로축)
  dIndex: number; // 변별도 (세로축)
  questionNumber: number;
}

interface DifficultyDiscriminationChartProps {
  data: QuestionPoint[];
}

export default function DifficultyDiscriminationChart({
  data,
}: DifficultyDiscriminationChartProps) {
  // Color code by discrimination level
  const getColor = (dIndex: number) => {
    if (dIndex >= 0.3) return '#10b981'; // Good discrimination
    if (dIndex >= 0.1) return '#f59e0b'; // Fair discrimination
    return '#ef4444'; // Poor discrimination
  };

  return (
    <div className="w-full">
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsScatterChart
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              dataKey="pValue"
              name="난이도 (p-value)"
              domain={[0, 1]}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{
                value: '난이도 (p-value)',
                position: 'bottom',
                offset: 0,
                fontSize: 12,
                fill: '#6b7280',
              }}
            />
            <YAxis
              type="number"
              dataKey="dIndex"
              name="변별도 (D-index)"
              domain={[-0.1, 1]}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{
                value: '변별도 (D-index)',
                angle: -90,
                position: 'insideLeft',
                fontSize: 12,
                fill: '#6b7280',
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const point = payload[0].payload as QuestionPoint;
                  return (
                    <div className="bg-white p-2 rounded shadow-lg border text-xs">
                      <p>문제 {point.questionNumber}번</p>
                      <p>난이도: {(point.pValue * 100).toFixed(1)}%</p>
                      <p>변별도: {point.dIndex.toFixed(3)}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter name="문항" data={data} fill="#3b82f6" fillOpacity={0.6}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.dIndex)} />
              ))}
            </Scatter>
          </RechartsScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex gap-4 justify-center text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>좋음 (≥0.3)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
          <span>보통 (0.1-0.3)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>부족 (&lt;0.1)</span>
        </div>
      </div>
    </div>
  );
}

