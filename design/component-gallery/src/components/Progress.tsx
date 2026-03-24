import React from 'react';

export interface ProgressProps {
  value: number;
  max?: number;
  variant?: 'cyan' | 'pink' | 'green' | 'yellow' | 'purple';
  size?: 'sm' | 'md';
}

const variantStyles = {
  cyan: 'bg-[#00D4FF]',
  pink: 'bg-[#FF6B9D]',
  green: 'bg-[#4ADE80]',
  yellow: 'bg-[#FCD34D]',
  purple: 'bg-[#A78BFA]',
};

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2',
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  variant = 'cyan',
  size = 'md',
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div className={`w-full bg-[var(--bg-surface)] rounded-full overflow-hidden ${sizeStyles[size]}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${variantStyles[variant]}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};
