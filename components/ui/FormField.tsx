const inputBase: React.CSSProperties = {
  border: '1px solid #e5ddd4',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  backgroundColor: '#faf7f2',
  color: '#1a2620',
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const inputFocusStyle = {
  borderColor: '#1f623e',
  boxShadow: '0 0 0 3px rgba(31,98,62,0.12)',
  backgroundColor: '#ffffff',
};

function InputField({ label, type = 'text', value, onChange, required, placeholder }: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#4a5e52' }}>
        {label}{required && <span style={{ color: '#b91c1c', marginRight: '2px' }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={inputBase}
        onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
        onBlur={e => {
          e.target.style.borderColor = '#e5ddd4';
          e.target.style.boxShadow = '';
          e.target.style.backgroundColor = '#faf7f2';
        }}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#4a5e52' }}>
        {label}{required && <span style={{ color: '#b91c1c', marginRight: '2px' }}>*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{ ...inputBase, cursor: 'pointer' }}
        onFocus={e => Object.assign(e.target.style, { ...inputFocusStyle })}
        onBlur={e => {
          e.target.style.borderColor = '#e5ddd4';
          e.target.style.boxShadow = '';
          e.target.style.backgroundColor = '#faf7f2';
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextareaField({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#4a5e52' }}>
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{ ...inputBase, resize: 'none' }}
        onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
        onBlur={e => {
          e.target.style.borderColor = '#e5ddd4';
          e.target.style.boxShadow = '';
          e.target.style.backgroundColor = '#faf7f2';
        }}
      />
    </div>
  );
}

export { InputField as Field, SelectField, TextareaField };
