interface FormGroupProps {
  title: string;
  children: React.ReactNode;
}

export default function FormGroup({ title, children }: FormGroupProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: '#c49438' }} />
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b7b6e', letterSpacing: '0.07em' }}>
          {title}
        </h3>
        <div className="flex-1 h-px" style={{ backgroundColor: '#f0ece5' }} />
      </div>
      {children}
    </div>
  );
}
