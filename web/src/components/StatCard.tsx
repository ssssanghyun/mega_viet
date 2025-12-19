interface StatCardProps {
  value: string | number;
  label: string;
  sublabel?: string;
  highlight?: boolean;
  className?: string;
}

export default function StatCard({
  value,
  label,
  sublabel,
  highlight = false,
  className = '',
}: StatCardProps) {
  return (
    <div
      className={`bg-white rounded-xl p-6 card-shadow hover-card ${className}`}
    >
      <div
        className={`text-3xl font-bold mb-2 ${
          highlight ? 'text-blue-600' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
      <div className="text-sm text-gray-600">{label}</div>
      {sublabel && (
        <div className="text-xs text-gray-400 mt-1">{sublabel}</div>
      )}
    </div>
  );
}
