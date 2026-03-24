import React from 'react';

export interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const Input: React.FC<InputProps> = ({
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  style,
}) => {
  const baseStyles = 'w-full h-10 px-4 bg-[var(--bg-surface)] border rounded-xl text-sm font-medium text-[var(--text-primary)] outline-none transition-all duration-200';
  const focusStyles = 'focus:border-[#00D4FF] focus:shadow-[0_0_0_3px_rgba(0,212,255,0.15)]';
  const errorStyles = error ? 'border-[#FF6B9D] focus:shadow-[0_0_0_3px_rgba(255,107,157,0.15)]' : 'border-[var(--border)]';
  
  return (
    <div style={style}>
      <input
        type={type}
        className={`${baseStyles} ${focusStyles} ${errorStyles} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
      />
      {hint && !error && <div className="text-xs text-[var(--text-tertiary)] mt-1.5">{hint}</div>}
      {error && <div className="text-xs text-[#FF6B9D] mt-1.5">{error}</div>}
    </div>
  );
};

export interface TextAreaProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  rows?: number;
}

export const TextArea: React.FC<TextAreaProps> = ({
  placeholder,
  value,
  onChange,
  rows = 4,
}) => (
  <textarea
    className="w-full min-h-[100px] p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--text-primary)] outline-none resize-y transition-all duration-200 focus:border-[#00D4FF]"
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange?.(e.target.value)}
    rows={rows}
  />
);

export interface SelectProps {
  options: { value: string; label: string }[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export const Select: React.FC<SelectProps> = ({
  options,
  placeholder,
  value,
  onChange,
}) => {
  return (
    <select
      className="w-full h-10 px-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-sm font-medium text-[var(--text-primary)] outline-none cursor-pointer appearance-none focus:border-[#00D4FF]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: '32px',
      }}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
};
