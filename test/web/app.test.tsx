import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../web/src/App';
import { ROOM_RE } from 'shared/constants';
import {
  installMockWebSocket,
  MockWebSocket,
  makeMessage,
  makePresence,
  renderWithRouter,
} from './helpers';

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

describe('Landing', () => {
  it('muestra inputs de sala y nombre y el botón generar', () => {
    renderWithRouter(<App />, { route: '/' });

    expect(screen.getByLabelText('Código de sala')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'generar código' })).toBeInTheDocument();
  });

  it('generar código rellena el input con algo que cumple ROOM_RE', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/' });

    await user.click(screen.getByRole('button', { name: 'generar código' }));

    const input = screen.getByLabelText('Código de sala') as HTMLInputElement;
    expect(ROOM_RE.test(input.value)).toBe(true);
  });

  it('entrar a una sala válida navega a /r/<room> y monta ChatRoom (abre WS)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/' });

    await user.type(screen.getByLabelText('Código de sala'), 'equipo-nocturno');
    const nameInput = screen.getByLabelText('Tu nombre');
    await user.clear(nameInput); // viene precargado con el default `humano`
    await user.type(nameInput, 'ana');
    await user.click(screen.getByRole('button', { name: 'entrar al canal →' }));

    // ChatRoom montado: cabecera con el nombre de sala y WS abierto.
    expect(screen.getByText('equipo-nocturno')).toBeInTheDocument();
    expect(MockWebSocket.last.url).toMatch(/\/r\/equipo-nocturno\/ws$/);
    // Persistió el nombre.
    expect(localStorage.getItem('chatName')).toBe('ana');
  });

  it('normaliza a minúsculas y recorta antes de navegar', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/' });

    await user.type(screen.getByLabelText('Código de sala'), '  SALA-1  ');
    await user.click(screen.getByRole('button', { name: 'entrar al canal →' }));

    expect(MockWebSocket.last.url).toMatch(/\/r\/sala-1\/ws$/);
  });

  it('sala inválida no navega y muestra feedback', async () => {
    const user = userEvent.setup();
    renderWithRouter(<App />, { route: '/' });

    await user.type(screen.getByLabelText('Código de sala'), 'ab');
    await user.click(screen.getByRole('button', { name: 'entrar al canal →' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // No se abrió ningún WS: seguimos en la landing.
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'generar código' })).toBeInTheDocument();
  });

  it('el input de sala precarga el nombre guardado en localStorage', () => {
    localStorage.setItem('chatName', 'rebeca');
    renderWithRouter(<App />, { route: '/' });

    expect(screen.getByLabelText('Tu nombre')).toHaveValue('rebeca');
  });
});

describe('ChatRoom (ruta /r/:room)', () => {
  it('renderiza la sala y, tras history, MessageList muestra los mensajes', async () => {
    renderWithRouter(<App />, { route: '/r/sala-1' });

    expect(MockWebSocket.last.url).toMatch(/\/r\/sala-1\/ws$/);
    expect(screen.getByText('enlazando…')).toBeInTheDocument();

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'history',
        history: [makeMessage({ id: 1, name: 'bruno', text: 'hola equipo' })],
      });
    });

    expect(screen.getByText('hola equipo')).toBeInTheDocument();
    expect(screen.getByText('en línea')).toBeInTheDocument();
  });

  it('muestra la presencia entrante con el chip propio', async () => {
    localStorage.setItem('chatName', 'ana');
    renderWithRouter(<App />, { route: '/r/sala-1' });

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'presence',
        online: [makePresence('ana'), makePresence('bruno')],
      });
    });

    // Acotado a la lista de presencia: el nick read-only también muestra «ana».
    const presence = within(screen.getByLabelText('Participantes en línea'));
    expect(presence.getByText('(tú)')).toBeInTheDocument();
    expect(presence.getByText('ana').closest('li')).toHaveClass('chip-me');
  });

  it('envía un mensaje por el Composer cuando está conectado', async () => {
    const user = userEvent.setup();
    localStorage.setItem('chatName', 'ana');
    renderWithRouter(<App />, { route: '/r/sala-1' });

    act(() => MockWebSocket.last.open());
    MockWebSocket.last.send.mockClear();

    await user.type(screen.getByLabelText('Mensaje'), 'desde la web{Enter}');

    expect(MockWebSocket.last.clientEvents).toContainEqual({
      type: 'msg',
      name: 'ana',
      text: 'desde la web',
    });
  });

  it('el Composer está deshabilitado mientras no está conectado', () => {
    renderWithRouter(<App />, { route: '/r/sala-1' });
    // Sin abrir el WS: status = connecting.
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('sin nombre almacenado usa `humano` como nombre efectivo (chip propio), sin input editable', async () => {
    // Sin `chatName` en localStorage: readStoredName() = `humano`.
    renderWithRouter(<App />, { route: '/r/sala-1' });
    act(() => MockWebSocket.last.open());

    // El nick es read-only: no hay input editable en la cabecera.
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument();

    act(() => {
      MockWebSocket.last.emit({ type: 'presence', online: [makePresence('humano')] });
    });

    // Acotado a la lista de presencia: el nick read-only también muestra «humano».
    const presence = within(screen.getByLabelText('Participantes en línea'));
    await waitFor(() =>
      expect(presence.getByText('humano').closest('li')).toHaveClass('chip-me'),
    );
  });

  it('sala inválida en la URL no crashea: muestra fallback y no abre WS', () => {
    renderWithRouter(<App />, { route: '/r/AB' });

    expect(screen.getByText(/no es un canal válido/)).toBeInTheDocument();
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(screen.getByRole('link', { name: /volver a la entrada/ })).toBeInTheDocument();
  });
});
