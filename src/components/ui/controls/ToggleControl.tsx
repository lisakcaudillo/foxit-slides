'use client';

import styles from './ToggleControl.module.css';

interface ToggleControlProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleControl({ label, value, onChange }: ToggleControlProps) {
  return (
    <div className={`${styles.row} ${styles.rowH}`}>
      <div className={styles.label}>
        <span>{label}</span>
      </div>
      <button
        type="button"
        className={styles.toggle}
        data-on={value ? '1' : '0'}
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
