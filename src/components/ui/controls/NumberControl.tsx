'use client';

import { useRef } from 'react';
import styles from './NumberControl.module.css';

interface NumberControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Visual placeholder (used by consumers to indicate "Mixed" multi-select state). */
  placeholder?: string;
  onChange: (value: number) => void;
}

export function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  placeholder,
  onChange,
}: NumberControlProps) {
  const startRef = useRef<{ x: number; val: number }>({ x: 0, val: 0 });

  const clamp = (n: number): number => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };

  const onScrubStart = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={styles.num}>
      <span className={styles.numLabel} onPointerDown={onScrubStart}>
        {label}
      </span>
      <input
        type="number"
        value={placeholder ? '' : value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      {unit && <span className={styles.numUnit}>{unit}</span>}
    </div>
  );
}
