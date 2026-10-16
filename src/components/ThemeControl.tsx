import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/useTheme';

export default function ThemeControl({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  const Icon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;
  return (
    <label className="theme-control" title={`Appearance: ${preference}`}>
      <Icon size={15} aria-hidden="true" />
      <select
        aria-label="Appearance"
        value={preference}
        onChange={(e) => onChange(e.target.value as ThemePreference)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
