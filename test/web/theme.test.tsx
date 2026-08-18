import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../web/src/App';
import { ThemeToggle } from '../../web/src/components/ThemeToggle';
import { installMockWebSocket, MockWebSocket, renderWithRouter } from './helpers';

// jsdom no trae `matchMedia`: lo mockeamos para que `resolveTheme` no falle cuando
// el dataset del documento no fija un tema de partida.
function mockMatchMedia(dark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: dark,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })),
  });
}

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(true);
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    vi.restoreAllMocks();
  });

  it('renderiza un botón de tema', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });

  it('estado inicial refleja el dataset vigente: en oscuro muestra ☀️ y destino claro', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'cambiar a tema claro');
    // El tooltip (burbuja propia) usa la clave genérica `tooltip.theme`, no el destino;
    // el `title` nativo ya no existe.
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).toHaveTextContent('Cambiar tema');
    // Control de cabecera → placement `bottom` (evita recorte contra el borde superior).
    expect(tip).toHaveClass('tt-bottom');
    expect(button).not.toHaveAttribute('title');
    expect(button.textContent).toContain('☀️');
  });

  it('estado inicial refleja el dataset vigente: en claro muestra 🌙 y destino oscuro', () => {
    document.documentElement.dataset.theme = 'light';
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'cambiar a tema oscuro');
    expect(button.textContent).toContain('🌙');
  });

  it('sin dataset de partida usa resolveTheme (sistema oscuro → arranca en oscuro)', () => {
    delete document.documentElement.dataset.theme;
    mockMatchMedia(true);
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'cambiar a tema claro');
    expect(button.textContent).toContain('☀️');
  });

  it('click de oscuro a claro: aplica data-theme="light" y persiste en localStorage', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    // El botón ahora ofrece volver a oscuro.
    expect(button).toHaveAttribute('aria-label', 'cambiar a tema oscuro');
    expect(button.textContent).toContain('🌙');
  });

  it('click de claro a oscuro: aplica data-theme="dark" y persiste en localStorage', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'light';
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(button).toHaveAttribute('aria-label', 'cambiar a tema claro');
    expect(button.textContent).toContain('☀️');
  });

  it('dos clicks alternan de ida y vuelta (dark → light → dark)', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('si localStorage falla, el cambio de tema en el DOM sigue funcionando (no propaga)', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'dark';
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('modo privado');
    });
    render(<ThemeToggle />);

    await expect(user.click(screen.getByRole('button'))).resolves.not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('ThemeToggle · presencia en las vistas', () => {
  let restoreWs: () => void;

  beforeEach(() => {
    restoreWs = installMockWebSocket();
    localStorage.clear();
    mockMatchMedia(true);
  });

  afterEach(() => {
    restoreWs();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    vi.restoreAllMocks();
  });

  it('está en la Landing (/)', () => {
    renderWithRouter(<App />, { route: '/' });
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });

  it('está en la cabecera de la sala (/r/<sala>)', () => {
    document.documentElement.dataset.theme = 'dark';
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });

  it('el toggle de la sala alterna el tema del documento al pulsarlo', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'dark';
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    const header = screen.getByRole('banner');
    await user.click(within(header).getByRole('button', { name: /tema/i }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
