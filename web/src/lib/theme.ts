// Fuente única de la lógica de tema (claro/oscuro). El estado vive en el DOM
// (`document.documentElement.dataset.theme`) y, si el usuario elige, en
// `localStorage['theme']`. Sin preferencia guardada se sigue al sistema. Defensivo
// con `localStorage`/`matchMedia` ausentes (modo privado, entornos de test antiguos).

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Lee la elección explícita persistida; `null` si no hay o el valor es corrupto. */
function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** Preferencia del sistema. Sin `matchMedia` cae a `true` (oscuro, el tema base). */
function prefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

/**
 * Tema a aplicar al cargar: la elección explícita manda; si no la hay, la del
 * sistema (oscuro por defecto). Reproduce la regla del script inline de `index.html`.
 */
export function resolveTheme(): Theme {
  return readStored() ?? (prefersDark() ? 'dark' : 'light');
}

/** Refleja el tema en la raíz del documento (`data-theme`). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Persiste la elección; falla en silencio si `localStorage` no está disponible. */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sin localStorage (modo privado estricto): el tema vive en memoria esta sesión.
  }
}
