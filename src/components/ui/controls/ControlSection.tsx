'use client';

import type { ReactNode } from 'react';
import styles from './ControlSection.module.css';

interface ControlSectionProps {
  label: string;
  children?: ReactNode;
}

export function ControlSection({ label, children }: ControlSectionProps) {
  return (
    <>
      <div className={styles.section}>{label}</div>
      {children}
    </>
  );
}
