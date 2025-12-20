'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface DifficultyDistributionChartProps {
  easy: number;
  medium: number;
  hard: number;
}

export default function DifficultyDistributionChart({
  easy,
  medium,
  hard,
}: DifficultyDistributionChartProps) {
  const data = [
    { name: '쉬움 (p≥0.7)', value: easy, color: '#10b981' },
    { name: '중간 (0.3<p<0.7)', value: medium, color: '#f59e0b' },
    { name: '어려움 (p≤0.3)', value: hard, color: '#ef4444' },
  ];

  return (
    <div className="w-full">
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-2 rounded shadow-lg border text-xs">
                      <p>{payload[0].payload.name}</p>
                      <p>문항 수: {payload[0].value}개</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

