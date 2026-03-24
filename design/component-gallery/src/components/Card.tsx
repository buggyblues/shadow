import React from 'react';

export interface CardProps {
  variant?: 'default' | 'cyan' | 'pink' | 'green' | 'yellow' | 'purple';
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const variantStyles = {
  default: 'border-[var(--border)]',
  cyan: 'border-[rgba(0,212,255,0.3)] shadow-[0_0_20px_rgba(0,212,255,0.1)]',
  pink: 'border-[rgba(255,107,157,0.3)] shadow-[0_0_20px_rgba(255,107,157,0.1)]',
  green: 'border-[rgba(74,222,128,0.3)] shadow-[0_0_20px_rgba(74,222,128,0.1)]',
  yellow: 'border-[rgba(252,211,77,0.3)] shadow-[0_0_20px_rgba(252,211,77,0.1)]',
  purple: 'border-[rgba(167,139,250,0.3)] shadow-[0_0_20px_rgba(167,139,250,0.1)]',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  children,
  onClick,
  style,
}) => {
  const baseStyles = 'bg-[var(--bg-elevated)] border rounded-2xl p-4 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5';
  
  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
};

export interface CardHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-3">
    {icon && (
      <div className="w-12 h-12 bg-[rgba(0,212,255,0.1)] rounded-xl flex items-center justify-center text-[#00D4FF]">
        {icon}
      </div>
    )}
    <div>
      <div className="text-lg font-bold">{title}</div>
      {subtitle && <div className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</div>}
    </div>
  </div>
);
