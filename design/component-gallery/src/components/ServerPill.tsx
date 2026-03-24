import React from 'react';

export interface ServerPillProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const ServerPill: React.FC<ServerPillProps> = ({
  label,
  active = false,
  onClick,
}) => {
  return (
    <button
      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold overflow-hidden transition-all duration-200 ${
        active
          ? 'bg-[#00D4FF] text-[#0B0B0F] shadow-[0_0_12px_rgba(0,212,255,0.5)]'
          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]'
      }`}
      onClick={onClick}
    >
      <span 
        className="absolute inset-0 opacity-50" 
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }} 
      />
      <span className="relative z-10">{label}</span>
    </button>
  );
};
