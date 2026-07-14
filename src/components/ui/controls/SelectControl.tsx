'use client';

import { ControlRow } from './ControlRow';
import styles from './SelectControl.module.css';

type SelectOption<T extends string> = T | { value: T; label: string };

interface SelectControlProps<T extends string> {
  label: string;
  value: T | '';
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  /** Render the leading "Mixed" option for multi-select edits. */
  mixed?: boolean;
}

export function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
  mixed = false,
}: SelectControlProps<T>) {
  return (
    <ControlRow label={label}>
      <select
        className={styles.field}
        value={mixed ? '' : value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {mixed && <option value="">Mixed</option>}
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </ControlRow>
  );
}
