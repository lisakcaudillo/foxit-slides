'use client';

import styles from './ColorControl.module.css';

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorControl({ label, value, onChange }: ColorControlProps) {
  return (
    <div className={`${styles.row} ${styles.rowH}`}>
      <div className={styles.label}>
        <span>{label}</span>
      </div>
      <input
        type="color"
        className={styles.swatch}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} color`}
      />
    </div>
  );
}
