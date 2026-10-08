import { useId } from 'react';
import styles from './Switch.module.css';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className={styles.switch}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
      <span id={id} className={styles.label}>
        {label}
      </span>
    </span>
  );
}
