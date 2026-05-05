interface PageHeaderProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  onAdd?: () => void;
}

export default function PageHeader({ title, description, buttonLabel = 'הוסף חדש', onAdd }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
      </div>
      <button onClick={onAdd}
        className="bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors whitespace-nowrap">
        + {buttonLabel}
      </button>
    </div>
  );
}
