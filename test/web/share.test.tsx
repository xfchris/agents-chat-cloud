import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../web/src/App';
import { ShareInvite } from '../../web/src/components/ShareInvite';
import {
  installMockWebSocket,
  MockWebSocket,
  makePresence,
  renderWithRouter,
} from './helpers';

// --- utilidades de portapapeles -------------------------------------------
// jsdom no siempre trae `navigator.clipboard`. Guardamos el descriptor original
// y lo restauramos en cada test para no filtrar el mock entre casos.

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

function restoreClipboard(): void {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    // No existía en el prototipo original: lo dejamos como `undefined` explícito.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  }
}

/** Espera a que se vacíen micro/macrotareas pendientes de la copia async. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const ORIGIN = window.location.origin;

afterEach(() => {
  restoreClipboard();
  vi.restoreAllMocks();
});

describe('ShareInvite — abrir/cerrar popover', () => {
  it('el botón compartir alterna aria-expanded y monta/desmonta el popover', async () => {
    const user = userEvent.setup();
    render(<ShareInvite room="sala-1" />);

    const toggle = screen.getByRole('button', { name: 'compartir' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Compartir la sala' })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<ShareInvite room="sala-1" />);

    const toggle = screen.getByRole('button', { name: 'compartir' });
    await user.click(toggle);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('cierra al hacer click fuera del componente', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ShareInvite room="sala-1" />
        <button type="button">afuera</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'compartir' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'afuera' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ShareInvite — copiar enlace', () => {
  it('escribe exactamente <origin>/r/<sala> y confirma con "copiado ✓"', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ShareInvite room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'compartir' }));
    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/r/sala-1`);
    expect(await screen.findByText('copiado ✓')).toBeInTheDocument();
  });
});

describe('ShareInvite — invitar a un agente', () => {
  it('escribe un texto que contiene curl y la ruta /brief, y confirma', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ShareInvite room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'compartir' }));
    await user.click(screen.getByRole('button', { name: /Invitar a un agente/ }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('curl');
    expect(copied).toContain(`${ORIGIN}/r/sala-1/brief`);
    expect(await screen.findByText('copiado ✓')).toBeInTheDocument();
  });
});

describe('ShareInvite — fallback seleccionable', () => {
  it('renderiza enlace e invitación en campos readonly, con o sin clipboard', async () => {
    const user = userEvent.setup();
    setClipboard(undefined); // sin Clipboard API
    render(<ShareInvite room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'compartir' }));

    const linkField = screen.getByLabelText('Enlace de la sala') as HTMLInputElement;
    expect(linkField).toHaveValue(`${ORIGIN}/r/sala-1`);
    expect(linkField).toHaveAttribute('readonly');

    const inviteField = screen.getByLabelText(
      'Texto de invitación para un agente',
    ) as HTMLTextAreaElement;
    expect(inviteField.value).toContain('curl');
    expect(inviteField.value).toContain(`${ORIGIN}/r/sala-1/brief`);
    expect(inviteField).toHaveAttribute('readonly');

    // Al enfocar, el contenido se selecciona (facilita el copiado a mano).
    const linkSelect = vi.spyOn(linkField, 'select');
    await user.click(linkField);
    expect(linkSelect).toHaveBeenCalled();

    const inviteSelect = vi.spyOn(inviteField, 'select');
    await user.click(inviteField);
    expect(inviteSelect).toHaveBeenCalled();
  });
});

describe('ShareInvite — camino degradado sin copia', () => {
  it('sin Clipboard API no confirma pero el texto sigue seleccionable', async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<ShareInvite room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'compartir' }));
    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));
    await flush();

    expect(screen.queryByText('copiado ✓')).toBeNull();
    // El fallback sigue disponible.
    expect(screen.getByLabelText('Enlace de la sala')).toHaveValue(`${ORIGIN}/r/sala-1`);
  });

  it('si writeText rechaza, tampoco confirma', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('denegado'));
    setClipboard({ writeText });
    render(<ShareInvite room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'compartir' }));
    await user.click(screen.getByRole('button', { name: /Invitar a un agente/ }));
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('copiado ✓')).toBeNull();
  });
});

describe('ChatRoom — nick read-only', () => {
  let restoreWs: () => void;

  beforeEach(() => {
    restoreWs = installMockWebSocket();
    localStorage.clear();
  });

  afterEach(() => {
    restoreWs();
    localStorage.clear();
  });

  it('la topbar muestra el nick como texto read-only igual a myName', async () => {
    localStorage.setItem('chatName', 'rebeca');
    renderWithRouter(<App />, { route: '/r/sala-1' });

    act(() => MockWebSocket.last.open());

    // Acotado a la identidad de la topbar para no colisionar con el chip de presencia.
    const identity = within(document.querySelector('.identity') as HTMLElement);
    expect(identity.getByText('rebeca')).toHaveClass('identity-name');
    expect(identity.getByText('tú')).toBeInTheDocument();

    // No es editable: no hay ningún input de nombre en la sala.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument();

    // Coincide con el nick efectivo mostrado en presencia.
    act(() => {
      MockWebSocket.last.emit({ type: 'presence', online: [makePresence('rebeca')] });
    });
    const presence = within(screen.getByLabelText('Participantes en línea'));
    await waitFor(() =>
      expect(presence.getByText('rebeca').closest('li')).toHaveClass('chip-me'),
    );
  });

  it('sin nombre almacenado, la topbar muestra `humano` read-only', () => {
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    const identity = within(document.querySelector('.identity') as HTMLElement);
    expect(identity.getByText('humano')).toHaveClass('identity-name');
  });
});
