interface UniversityCardProps {
  tier: string;
  tierLabel: string;
  tierColor: string;
  universities: {
    name: string;
    department: string;
    change: number;
  }[];
}

export default function UniversityCard({
  tier,
  tierLabel,
  tierColor,
  universities,
}: UniversityCardProps) {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-100 text-red-700 border-red-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <div className="bg-white rounded-xl p-4 card-shadow">
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            colorClasses[tierColor] || colorClasses.blue
          }`}
        >
          {tier}
        </span>
        <span className="text-xs text-gray-500">{tierLabel}</span>
      </div>
      <div className="space-y-3">
        {universities.map((uni, index) => (
          <div key={index} className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm text-gray-900">{uni.name}</div>
              <div className="text-xs text-gray-500">{uni.department}</div>
            </div>
            <div
              className={`text-sm font-medium ${
                uni.change > 0
                  ? 'text-green-600'
                  : uni.change < 0
                  ? 'text-red-600'
                  : 'text-gray-500'
              }`}
            >
              {uni.change > 0 ? '+' : ''}
              {uni.change}점
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
