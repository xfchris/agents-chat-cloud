import { useState } from 'react';
import { applyTheme, resolveTheme, storeTheme, type Theme } from '../lib/theme';

/** Tema inicial: el ya aplicado por el script inline (dataset) o, en su ausencia, resuelto. */
function initialTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === 'light' || current === 'dark' ? current : resolveTheme();
}

/**
 * Control discreto para alternar claro/oscuro. Muestra el destino: ☀️ cuando está en
 * oscuro (pulsar → claro) y 🌙 cuando está en claro (pulsar → oscuro). Aplica al DOM y
 * persiste la elección; el `aria-label` nombra el destino.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'cambiar a tema claro' : 'cambiar a tema oscuro';

  const toggle = () => {
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="ghost-link theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span className="theme-icon" aria-hidden="true">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
