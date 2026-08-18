import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../web/src/App';
import { Composer } from '../../web/src/components/Composer';
import { PresenceBar } from '../../web/src/components/PresenceBar';
import { LanguageSwitcher } from '../../web/src/components/LanguageSwitcher';
import i18n, { SUPPORTED_LNGS } from '../../web/src/i18n';
import {
  installMockWebSocket,
  MockWebSocket,
  makePresence,
  renderWithRouter,
} from './helpers';

// El `beforeEach` global de setup.ts revuelve el idioma a `es` antes de cada
// test. Aun así dejamos `es` explícito al terminar cada uno para no filtrar
// idioma a otros ficheros si el orden de ejecución cambia.
afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('es');
  });
});

// Cambia el idioma de la instancia global dentro de `act` para que los
// componentes suscritos re-rendericen de forma síncrona antes de las aserciones.
async function switchTo(lng: string) {
  await act(async () => {
    await i18n.changeLanguage(lng);
  });
}

describe('i18n · cambio de idioma en caliente (clave verificable)', () => {
  it('el botón enviar del Composer cambia con el idioma (es/en/pt/zh)', async () => {
    render(<Composer onSend={vi.fn()} disabled={false} />);
    const button = () => screen.getByRole('button');

    // Arranca en `es` (fijado por setup.ts).
    expect(button()).toHaveTextContent('Enviar');

    await switchTo('en');
    expect(button()).toHaveTextContent('Send');

    await switchTo('pt');
    expect(button()).toHaveTextContent('Enviar');

    await switchTo('zh');
    expect(button()).toHaveTextContent('发送');

    await switchTo('es');
    expect(button()).toHaveTextContent('Enviar');
  });

  it('el placeholder del Composer también se traduce al cambiar de idioma', async () => {
    render(<Composer onSend={vi.fn()} disabled={false} />);
    const input = () => screen.getByRole('textbox');

    // aria-label `Mensaje` en es → `Message` en en (segunda clave, no solo send).
    expect(input()).toHaveAttribute('aria-label', 'Mensaje');
    await switchTo('en');
    expect(input()).toHaveAttribute('aria-label', 'Message');
  });
});

describe('i18n · selector presente en Landing y en la sala', () => {
  let restoreWs: () => void;

  beforeEach(() => {
    restoreWs = installMockWebSocket();
    localStorage.clear();
  });

  afterEach(() => {
    restoreWs();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('la Landing monta un selector con las 4 opciones y refleja el idioma activo', () => {
    renderWithRouter(<App />, { route: '/' });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['Español', 'English', 'Português', '中文']);
    // Idioma activo `es` reflejado en el value.
    expect(select.value).toBe('es');
  });

  it('la sala (/r/<sala>) monta un selector con las 4 opciones', () => {
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    const header = screen.getByRole('banner');
    const select = within(header).getByRole('combobox') as HTMLSelectElement;
    const values = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['es', 'en', 'pt', 'zh']);
    expect(select.value).toBe('es');
  });
});

describe('i18n · selección persiste en localStorage y muta el DOM', () => {
  let restoreWs: () => void;

  beforeEach(() => {
    restoreWs = installMockWebSocket();
    localStorage.setItem('i18nextLng', 'es');
  });

  afterEach(() => {
    restoreWs();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('elegir English en la Landing persiste i18nextLng y traduce los textos', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/' });

    // Antes: textos en español.
    expect(screen.getByRole('button', { name: 'entrar al canal →' })).toBeInTheDocument();

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'en');

    // El detector cachea la elección en `localStorage['i18nextLng']`.
    expect(localStorage.getItem('i18nextLng')).toBe('en');
    // El DOM cambió (Landing en inglés).
    expect(screen.getByRole('button', { name: 'enter the channel →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'generate code' })).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe('en');
  });

  it('el estado de conexión de la sala se traduce al cambiar de idioma', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    // `connected` en es.
    expect(screen.getByText('en línea')).toBeInTheDocument();

    const header = screen.getByRole('banner');
    await user.selectOptions(within(header).getByRole('combobox'), 'en');

    // `connected` en en.
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.queryByText('en línea')).toBeNull();
  });
});

describe('i18n · interpolación del contador de presencia', () => {
  it('interpola {{count}} en es y tras cambiar a en/zh', async () => {
    render(<PresenceBar online={[makePresence('ana'), makePresence('bruno')]} myName="ana" />);

    expect(screen.getByText('en línea · 2')).toBeInTheDocument();

    await switchTo('en');
    expect(screen.getByText('online · 2')).toBeInTheDocument();

    await switchTo('zh');
    expect(screen.getByText('在线 · 2')).toBeInTheDocument();
  });

  it('muestra `canal en silencio` (sin interpolación) cuando no hay nadie, y su traducción', async () => {
    render(<PresenceBar online={[]} myName="ana" />);
    expect(screen.getByText('canal en silencio')).toBeInTheDocument();

    await switchTo('pt');
    expect(screen.getByText('canal em silêncio')).toBeInTheDocument();
  });
});

describe('i18n · detección y fallback', () => {
  it('SUPPORTED_LNGS son exactamente es/en/pt/zh y el fallback es es', () => {
    expect([...SUPPORTED_LNGS]).toEqual(['es', 'en', 'pt', 'zh']);
    expect(i18n.options.fallbackLng).toEqual(['es']);
  });

  it('un idioma de navegador no soportado (de) cae al fallback es por clave', async () => {
    await switchTo('de');

    // `de` no está en supportedLngs: resolvedLanguage cae al fallback.
    expect(i18n.resolvedLanguage).toBe('es');
    // La clave se resuelve con el recurso de `es`, no muestra la clave cruda.
    expect(i18n.t('composer.send')).toBe('Enviar');
    expect(i18n.t('room.connected')).toBe('en línea');
  });

  it('una clave presente solo en es cae al fallback es aunque el idioma sea en', async () => {
    // Namespace desechable para ejercitar el fallback POR CLAVE documentado en la
    // spec (falta una clave en un idioma → usa `es`) sin tocar el bundle real
    // `translation`. La clave existe solo en `es`; `en` no la tiene.
    i18n.addResourceBundle('es', 'tmpns', { onlyInEs: 'solo-es' });
    i18n.addResourceBundle('en', 'tmpns', {});
    try {
      await switchTo('en');
      // No existe en `en`: i18next resuelve con el recurso de `es`, no la clave cruda.
      expect(i18n.t('onlyInEs', { ns: 'tmpns' })).toBe('solo-es');
    } finally {
      i18n.removeResourceBundle('es', 'tmpns');
      i18n.removeResourceBundle('en', 'tmpns');
    }
  });
});

describe('i18n · textos nuevos de SPEC 10 se traducen al cambiar de idioma', () => {
  it('el title del selector de idioma sale de i18n y cambia con el idioma', async () => {
    render(<LanguageSwitcher />);
    const select = () => screen.getByRole('combobox');

    // Arranca en `es`: title = tooltip.language.
    expect(select()).toHaveAttribute('title', 'Cambiar idioma');

    await switchTo('en');
    expect(select()).toHaveAttribute('title', 'Change language');
  });

  it('los encabezados del roster (Agentes/Personas) se traducen al cambiar de idioma', async () => {
    render(
      <PresenceBar
        online={[makePresence('claudecode-linux'), makePresence('ana')]}
        myName="ana"
      />,
    );

    // Español.
    expect(screen.getByRole('heading', { name: 'Agentes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personas' })).toBeInTheDocument();

    await switchTo('en');
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Agentes' })).toBeNull();
  });

  it('el tooltip de tipo (Agente/Persona) se traduce al cambiar de idioma', async () => {
    render(
      <PresenceBar
        online={[makePresence('claudecode-linux'), makePresence('ana')]}
        myName="ana"
      />,
    );

    // Español: title del prefijo de tipo.
    expect(screen.getByTitle('Agente')).toBeInTheDocument();
    expect(screen.getByTitle('Persona')).toBeInTheDocument();

    await switchTo('en');
    expect(screen.getByTitle('Agent')).toBeInTheDocument();
    expect(screen.getByTitle('Person')).toBeInTheDocument();
    expect(screen.queryByTitle('Agente')).toBeNull();
  });
});

describe('LanguageSwitcher · robustez de normalización', () => {
  // Fuerza `resolvedLanguage` a un valor arbitrario para ejercitar las ramas de
  // normalización sin depender de que i18next lo resuelva a un soportado.
  function withResolvedLanguage(value: string | undefined, fn: () => void) {
    const descriptor = Object.getOwnPropertyDescriptor(i18n, 'resolvedLanguage');
    Object.defineProperty(i18n, 'resolvedLanguage', {
      configurable: true,
      writable: true,
      value,
    });
    try {
      fn();
    } finally {
      if (descriptor) Object.defineProperty(i18n, 'resolvedLanguage', descriptor);
    }
  }

  it('si resolvedLanguage es un valor no soportado, el value del select cae a es', () => {
    // Rama FALSA del ternario de normalización (`: 'es'`).
    withResolvedLanguage('zz-region', () => {
      render(<LanguageSwitcher />);
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('es');
    });
  });

  it('si resolvedLanguage es undefined, normaliza a es (rama `?? ""`)', () => {
    withResolvedLanguage(undefined, () => {
      render(<LanguageSwitcher />);
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('es');
    });
  });

  it('un código regional soportado por i18next se refleja normalizado en el value', async () => {
    // i18next resuelve `en-US` a `en` (está en supportedLngs); el switcher lo
    // muestra tal cual porque `en` sí es una option.
    await switchTo('en-US');
    render(<LanguageSwitcher />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('en');
  });

  it('cambiar la opción del select dispara changeLanguage (onChange)', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('es');

    await user.selectOptions(select, 'pt');
    expect(i18n.resolvedLanguage).toBe('pt');
    expect(select.value).toBe('pt');
  });
});
