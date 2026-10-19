'use client';

import React, { useRef, useState, useCallback } from 'react';

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

export function MagneticButton({
  children,
  className = '',
  ...props
}: MagneticButtonProps) {
  return (
    <button
      className={`studio-smooth-button ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
