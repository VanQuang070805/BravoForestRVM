'use client';

import React, { isValidElement, useLayoutEffect, useRef, useState } from 'react';
import './BranchedMenu.css';

export interface BranchedMenuItemChild {
  value: string;
  label: string;
  icon?: React.ReactNode | React.ComponentType<any>;
}

export interface BranchedMenuItem {
  label: string;
  value?: string;
  children?: BranchedMenuItemChild[];
}

export interface BranchedMenuProps {
  items?: BranchedMenuItem[];
  defaultOpen?: number | number[];
  defaultActive?: string;
  active?: string;
  onSelect?: (value: string, item: any) => void;
  onToggle?: (index: number, isOpen: boolean) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
}

const PAD = 6;
const MARK = 20;

const renderIcon = (icon: any) => {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  const IconComp = icon;
  return <IconComp size={16} strokeWidth={1.8} />;
};

const toSet = (open: any) => new Set<number>(Array.isArray(open) ? open : open >= 0 ? [open] : []);

export const BranchedMenu: React.FC<BranchedMenuProps> = ({
  items = [],
  defaultOpen = 0,
  defaultActive = '',
  active: controlledActive,
  onSelect,
  onToggle,
  color = '#1e293b',
  accentColor = '#15803d',
  lineColor = '#cbd5e1',
  width = 240,
  rowHeight = 38,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.8,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
  className = ''
}) => {
  const [open, setOpen] = useState(() => toSet(defaultOpen));
  const [internalActive, setInternalActive] = useState(() => {
    if (defaultActive) return defaultActive;
    const first = items.find((it, i) => it.children && toSet(defaultOpen).has(i));
    return first?.children?.[0]?.value ?? '';
  });

  const active = controlledActive !== undefined ? controlledActive : internalActive;

  const navRef = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const markerRef = useRef<HTMLSpanElement>(null);
  const latest = useRef<any>({});
  latest.current = { onSelect, onToggle };

  const activeSection = items.findIndex(it => it.children?.some(kid => kid.value === active));
  const markerShown = activeSection >= 0 && open.has(activeSection);

  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const m = markerRef.current;
      const el = heads.current[activeSection];
      if (!m) return;
      const on = markerShown && el;
      if (!glide) m.style.transition = 'none';
      if (on && el) m.style.top = `${el.offsetTop + (el.offsetHeight - MARK) / 2}px`;
      m.toggleAttribute('data-on', Boolean(on));
      if (!glide) {
        void m.offsetHeight;
        m.style.transition = '';
      }
    };
    place(true);
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const select = (value: string, item: any) => {
    if (controlledActive === undefined) {
      setInternalActive(value);
    }
    latest.current.onSelect?.(value, item);
  };

  const toggle = (i: number) => {
    setOpen(prev => {
      const next = new Set(prev);
      const isOpen = !next.has(i);
      if (isOpen) next.add(i);
      else next.delete(i);
      latest.current.onToggle?.(i, isOpen);
      return next;
    });
  };

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (k: number) => PAD + k * rowHeight + rowHeight / 2;
  const branch = (k: number) => `M ${trunk} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const reach = (k: number) => `M ${trunk} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const length = (k: number) => rowY(k) - r + (Math.PI * r) / 2 + (endX - trunk - r);

  return (
    <nav
      ref={navRef}
      className={`branched-menu${className ? ` ${className}` : ''}`}
      style={{
        ['--bm-w' as any]: `${width}px`,
        ['--bm-ink' as any]: color,
        ['--bm-accent' as any]: accentColor,
        ['--bm-line' as any]: lineColor,
        ['--bm-font' as any]: `${fontSize}px`,
        ['--bm-row' as any]: `${rowHeight}px`,
        ['--bm-indent' as any]: `${indent}px`,
        ['--bm-line-w' as any]: lineWidth,
        ['--bm-draw' as any]: `${drawDuration}ms`,
        ['--bm-fold' as any]: `${foldDuration}ms`
      }}
    >
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      {items.map((item, i) => {
        const kids = item.children;
        const isOpen = kids ? open.has(i) : false;
        const leafValue = item.value ?? item.label;
        const leafActive = !kids && leafValue === active;
        const bodyH = kids ? PAD * 2 + kids.length * rowHeight : 0;
        return (
          <div key={item.value ?? item.label} className="branched-menu__section" data-open={isOpen ? '' : undefined}>
            <button
              ref={el => {
                heads.current[i] = el;
              }}
              type="button"
              className="branched-menu__head"
              aria-expanded={kids ? isOpen : undefined}
              aria-current={leafActive ? 'true' : undefined}
              data-active={leafActive ? '' : undefined}
              onClick={() => (kids ? toggle(i) : select(leafValue, item))}
            >
              {item.label}
            </button>
            {kids ? (
              <div className="branched-menu__body">
                <div className="branched-menu__fold">
                  <div className="branched-menu__tree" style={{ height: bodyH }}>
                    <svg className="branched-menu__lines" width={indent} height={bodyH} aria-hidden="true">
                      <path className="branched-menu__base" d={`M ${trunk} 0 V ${rowY(kids.length - 1) - r}`} />
                      {kids.map((kid, k) => (
                        <path key={kid.value} className="branched-menu__base" d={branch(k)} />
                      ))}
                      {kids.map((kid, k) => (
                        <path
                          key={kid.value}
                          className="branched-menu__reach"
                          d={reach(k)}
                          style={{
                            strokeDasharray: length(k),
                            strokeDashoffset: kid.value === active ? 0 : length(k)
                          }}
                        />
                      ))}
                    </svg>
                    {kids.map(kid => (
                      <button
                        key={kid.value}
                        type="button"
                        className="branched-menu__item"
                        aria-current={kid.value === active ? 'true' : undefined}
                        data-active={kid.value === active ? '' : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => select(kid.value, kid)}
                      >
                        {kid.icon ? (
                          <span className="branched-menu__icon" aria-hidden="true">
                            {renderIcon(kid.icon)}
                          </span>
                        ) : null}
                        <span className="branched-menu__label">{kid.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
};

export default BranchedMenu;
