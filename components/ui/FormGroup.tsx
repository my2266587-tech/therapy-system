interface FormGroupProps {
  title: string;
  children: React.ReactNode;
}

export default function FormGroup({ title, children }: FormGroupProps) {
  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200 px-5 pt-4 pb-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-600 pb-3 border-b border-slate-200">
        {title}
      </h3>
      {children}
    </div>
  );
}
