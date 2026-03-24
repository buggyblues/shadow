import React from 'react';

export interface BadgeProps {
  variant?: 'cyan' | 'pink' | 'green' | 'yellow' | 'purple';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const variantStyles = {
  cyan: 'bg-[rgba(0,212,255,0.15)] text-[#00D4FF]',
  pink: 'bg-[rgba(255,107,157,0.15)] text-[#FF6B9D]',
  green: 'bg-[rgba(74,222,128,0.15)] text-[#4ADE80]',
  yellow: 'bg-[rgba(252,211,77,0.15)] text-[#FCD34D]',
  purple: 'bg-[rgba(167,139,250,0.15)] text-[#A78BFA]',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'cyan',
  children,
  style,
}) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${variantStyles[variant]}`} style={style}>
      {children}
    </span>
  );
};
