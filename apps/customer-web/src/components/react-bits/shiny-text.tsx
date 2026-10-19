'use client';

import React from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  shimmerColor?: string;
}

export function ShinyText({
  text,
  disabled = false,
  speed = 4,
  className = '',
  shimmerColor = 'rgba(255, 255, 255, 0.9)'
}: ShinyTextProps) {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`inline-block font-semibold text-emerald-800 dark:text-emerald-300 ${
        disabled ? '' : 'animate-pulse'
      } ${className}`}
    >
      {text}
    </span>
  );
}
