const base: React.CSSProperties = {
  border:          '1px solid #E2E8F0',
  borderRadius:    8,
  padding:         '9px 12px',
  fontSize:        14,
  backgroundColor: '#FFFFFF',
  color:           '#0F172A',
  width:           '100%',
  outline:         'none',
  transition:      'border-color 0.12s, box-shadow 0.12s',
  fontFamily:      'inherit',
};

const focused: React.CSSProperties = {
  borderColor: '#0F766E',
  boxShadow:   '0 0 0 3px rgba(15,118,110,0.10)',
};

const label: React.CSSProperties = {
  display:     'block',
  fontSize:    12,
  fontWeight:  600,
  color:       '#374151',
  marginBottom: 6,
  letterSpacing: '0.01em',
};

function Required() {
  return <span style={{ color: '#DC2626', marginRight: 2 }}>*</span>;
}

/* ── Input field ── */
function InputField({
  label: labelText, type = 'text', value, onChange, required, placeholder,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <label style={label}>
        {labelText}{required && <Required />}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={base}
        onFocus={e => Object.assign(e.target.style, focused)}
        onBlur={e => {
          e.target.style.borderColor = '#E2E8F0';
          e.target.style.boxShadow = '';
        }}
      />
    </div>
  );
}

/* ── Select field ── */
function SelectField({
  label: labelText, value, onChange, options, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string; required?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <label style={label}>
        {labelText}{required && <Required />}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{ ...base, cursor: 'pointer' }}
        onFocus={e => Object.assign(e.target.style, focused)}
        onBlur={e => {
          e.target.style.borderColor = '#E2E8F0';
          e.target.style.boxShadow = '';
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

/* ── Textarea field ── */
function TextareaField({
  label: labelText, value, onChange, rows = 3, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {labelText && <label style={label}>{labelText}</label>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{ ...base, resize: 'none' }}
        onFocus={e => Object.assign(e.target.style, focused)}
        onBlur={e => {
          e.target.style.borderColor = '#E2E8F0';
          e.target.style.boxShadow = '';
        }}
      />
    </div>
  );
}

export { InputField as Field, SelectField, TextareaField };
