import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'w-6 h-6 border-2',
  md: 'w-10 h-10 border-[3px]',
  lg: 'w-14 h-14 border-4',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md' }) => {
  return (
    <div className={sizeStyles[size]}>
      <div
        className="w-full h-full rounded-full animate-spin"
        style={{
          border: 'inherit',
          borderColor: 'transparent',
          borderTopColor: '#00D4FF',
          borderRightColor: '#FF6B9D',
          borderBottomColor: '#4ADE80',
          borderLeftColor: '#FCD34D',
        }}
      />
    </div>
  );
};
