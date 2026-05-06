interface PageHeaderProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  onAdd?: () => void;
  showButton?: boolean;
}

export default function PageHeader({
  title,
  description,
  buttonLabel = 'הוסף חדש',
  onAdd,
  showButton = true,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <h1
          className="text-2xl font-bold leading-tight"
          style={{ color: '#1a2620' }}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: '#6b7b6e' }}>
            {description}
          </p>
        )}
      </div>
      {showButton && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap transition-all duration-150"
          style={{
            backgroundColor: '#1f623e',
            boxShadow: '0 1px 4px rgba(31,98,62,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#184f31';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(31,98,62,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1f623e';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(31,98,62,0.3)';
          }}
        >
          <span className="text-base leading-none">+</span>
          {buttonLabel}
        </button>
      )}
    </div>
  );
}
