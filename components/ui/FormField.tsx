const base =
  'border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white w-full ' +
  'placeholder:text-slate-300 text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400 ' +
  'hover:border-slate-300 transition-colors';

interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}

export function Field({ label, type = 'text', value, onChange, required, placeholder }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-slate-500 tracking-wide">
          {label}
          {required && <span className="text-red-400 mr-0.5">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={base}
      />
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}

export function SelectField({ label, value, onChange, options, placeholder, required }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-slate-500 tracking-wide">
          {label}
          {required && <span className="text-red-400 mr-0.5">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className={`${base} cursor-pointer`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface TextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

export function TextareaField({ label, value, onChange, rows = 3, placeholder }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-slate-500 tracking-wide">{label}</label>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${base} resize-none`}
      />
    </div>
  );
}
