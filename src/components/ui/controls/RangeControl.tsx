'use client';

import { ControlRow } from './ControlRow';
import styles from './RangeControl.module.css';

interface RangeControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function RangeControl({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
}: RangeControlProps) {
  return (
    <ControlRow label={label} value={`${value}${unit}`}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </ControlRow>
  );
}
