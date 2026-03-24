import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ButtonProps {
  variant?: 'cyan' | 'pink' | 'green' | 'yellow' | 'purple' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

const variantStyles = {
  cyan: 'bg-[#00D4FF] text-[#0B0B0F] shadow-[0_3px_0_#00A8CC] hover:shadow-[0_5px_0_#00A8CC]',
  pink: 'bg-[#FF6B9D] text-white shadow-[0_3px_0_#E85A8C] hover:shadow-[0_5px_0_#E85A8C]',
  green: 'bg-[#4ADE80] text-[#0B0B0F] shadow-[0_3px_0_#22C55E] hover:shadow-[0_5px_0_#22C55E]',
  yellow: 'bg-[#FCD34D] text-[#0B0B0F] shadow-[0_3px_0_#F59E0B] hover:shadow-[0_5px_0_#F59E0B]',
  purple: 'bg-[#A78BFA] text-white shadow-[0_3px_0_#8B5CF6] hover:shadow-[0_5px_0_#8B5CF6]',
  secondary: 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-[0_2px_0_var(--border)] hover:border-[#00D4FF] hover:text-[#00D4FF]',
};

const sizeStyles = {
  sm: 'h-8 px-4 text-sm rounded-lg',
  md: 'h-10 px-5 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'cyan',
  size = 'md',
  icon: Icon,
  children,
  onClick,
  disabled = false,
}) => {
  const baseStyles = 'inline-flex items-center gap-2 font-bold border-none cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed';
  
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
};
