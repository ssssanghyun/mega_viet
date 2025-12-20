'use client';

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  x: number;
  y: number;
  id?: string;
  rank?: number;
}

interface ScatterChartProps {
  data: DataPoint[];
  highlightId?: string;
  averageScore?: number;
}

export default function ScatterChart({
  data,
  highlightId,
  averageScore,
}: ScatterChartProps) {
  const highlightedPoint = highlightId
    ? data.find((d) => d.id === highlightId)
    : null;

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsScatterChart
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="x"
            name="순위"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            label={{
              value: '응시 번호',
              position: 'bottom',
              offset: 0,
              fontSize: 12,
              fill: '#6b7280',
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="점수"
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            label={{
              value: '점수',
              angle: -90,
              position: 'insideLeft',
              fontSize: 12,
              fill: '#6b7280',
            }}
          />
          {averageScore && (
            <ReferenceLine
              y={averageScore}
              stroke="#3b82f6"
              strokeDasharray="5 5"
              label={{
                value: `평균 ${averageScore.toFixed(1)}점`,
                position: 'right',
                fontSize: 10,
                fill: '#3b82f6',
              }}
            />
          )}
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as DataPoint;
                return (
                  <div className="bg-white p-2 rounded shadow-lg border text-xs">
                    <p>점수: {data.y.toFixed(1)}점</p>
                    {data.rank && <p>순위: {data.rank}위</p>}
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter
            name="학생들"
            data={data}
            fill="#93c5fd"
            fillOpacity={0.6}
          />
          {highlightedPoint && (
            <Scatter
              name="나의 위치"
              data={[highlightedPoint]}
              fill="#ef4444"
              shape="star"
            />
          )}
        </RechartsScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
