'use client';

import React, { useEffect, useState, useRef } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  className?: string;
  characters?: string;
  sequential?: boolean;
}

export function DecryptedText({
  text,
  speed = 45,
  maxIterations = 10,
  className = '',
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?',
  sequential = true
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovered, setIsHovered] = useState(false);
  const [hasAnimatedOnce, setHasAnimatedOnce] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '\n') return char;
            if (sequential) {
              if (index < iteration / (maxIterations / text.length)) {
                return text[index];
              }
            } else {
              if (iteration >= maxIterations) {
                return text[index];
              }
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );

      iteration += 1;
      if (iteration > maxIterations + text.length) {
        clearInterval(interval);
        setDisplayText(text);
        setHasAnimatedOnce(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, maxIterations, characters, sequential]);

  const handleMouseEnter = () => {
    if (!hasAnimatedOnce) return;
    setIsHovered(true);
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '\n') return char;
            if (index < iteration) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );
      iteration += 1;
      if (iteration > text.length) {
        clearInterval(interval);
        setDisplayText(text);
        setIsHovered(false);
      }
    }, speed * 0.7);
  };

  return (
    <span
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      className={`inline-block select-none cursor-default font-mono ${className}`}
    >
      {displayText}
    </span>
  );
}
