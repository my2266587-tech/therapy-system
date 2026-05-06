interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  accent?: boolean;
  href?: string;
}

export default function StatCard({ title, value, description, accent }: StatCardProps) {
  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{
        border: '1px solid #e5ddd4',
        boxShadow: '0 1px 4px 0 rgba(26,38,32,0.06)',
        borderRight: accent ? '3px solid #c49438' : '1px solid #e5ddd4',
      }}
    >
      <div className="p-5">
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: '#6b7b6e', letterSpacing: '0.06em' }}
        >
          {title}
        </p>
        <p
          className="text-3xl font-bold leading-none mb-2"
          style={{ color: accent ? '#1f623e' : '#1a2620' }}
        >
          {value}
        </p>
        {description && (
          <p className="text-xs" style={{ color: '#8fa49a' }}>
            {description}
          </p>
        )}
      </div>
      {accent && (
        <div
          className="h-0.5 w-full"
          style={{ background: 'linear-gradient(90deg, #c49438, transparent)' }}
        />
      )}
    </div>
  );
}
