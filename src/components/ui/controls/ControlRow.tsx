'use client';

import type { ReactNode } from 'react';
import styles from './ControlRow.module.css';

interface ControlRowProps {
  label: string;
  /** Optional value display next to the label (right-aligned, tabular). */
  value?: string | number;
  /** Lay out label and children on a single horizontal row. */
  inline?: boolean;
  children?: ReactNode;
}

export function ControlRow({ label, value, inline = false, children }: ControlRowProps) {
  const rowClass = inline ? `${styles.row} ${styles.rowH}` : styles.row;
  return (
    <div className={rowClass}>
      <div className={styles.label}>
        <span>{label}</span>
        {value != null && <span className={styles.value}>{value}</span>}
      </div>
      {children}
    </div>
  );
}
