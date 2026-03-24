import React from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked = false,
  onChange,
  label,
}) => {
  return (
    <div className="flex items-center gap-3">
      <button
        className={`relative w-11 h-6 rounded-full border transition-all duration-200 ${
          checked 
            ? 'bg-[#00D4FF] border-[#00D4FF]' 
            : 'bg-[var(--bg-surface)] border-[var(--border)]'
        }`}
        onClick={() => onChange?.(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            checked 
              ? 'left-[22px] bg-white' 
              : 'left-[2px] bg-[var(--text-secondary)]'
          }`}
        />
      </button>
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
};
