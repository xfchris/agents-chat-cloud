import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClearHistory } from '../../web/src/components/ClearHistory';
import i18n from '../../web/src/i18n';

/** Espera a que se vacíen micro/macrotareas pendientes del fetch async. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('es');
  });
});

describe('ClearHistory — botón y tooltip', () => {
  it('el botón expone su aria-label y un tooltip traducido (clear.tooltip) en bottom', () => {
    render(<ClearHistory room="sala-1" />);

    const button = screen.getByRole('button', { name: 'Borrar historial' });
    expect(button).toBeInTheDocument();

    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).toHaveTextContent('Borrar todo el historial de la sala');
    expect(tip).toHaveClass('tt-bottom');
  });
});

describe('ClearHistory — confirmación en línea', () => {
  it('el botón abre y cierra la confirmación (alterna aria-expanded)', async () => {
    const user = userEvent.setup();
    render(<ClearHistory room="sala-1" />);

    const button = screen.getByRole('button', { name: 'Borrar historial' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('¿Borrar todo el historial? No se puede deshacer.');
    expect(screen.getByRole('button', { name: 'Sí, borrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('«Sí, borrar» dispara DELETE al endpoint correcto y cierra', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ cleared: 2 }), { status: 200 }));
    render(<ClearHistory room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    await user.click(screen.getByRole('button', { name: 'Sí, borrar' }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/r/sala-1/messages', { method: 'DELETE' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«Cancelar» cierra sin llamar a fetch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<ClearHistory room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Escape cierra sin borrar', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<ClearHistory room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('una tecla distinta de Escape no cierra la confirmación', async () => {
    const user = userEvent.setup();
    render(<ClearHistory room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('a');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('click fuera cierra sin borrar', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(
      <div>
        <ClearHistory room="sala-1" />
        <button type="button">afuera</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'afuera' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si el fetch DELETE falla, no rompe (la vista la refresca el evento WS)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('red caída'));
    render(<ClearHistory room="sala-1" />);

    await user.click(screen.getByRole('button', { name: 'Borrar historial' }));
    await user.click(screen.getByRole('button', { name: 'Sí, borrar' }));
    await flush();

    // No lanza; la confirmación se cerró igualmente.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ClearHistory — i18n', () => {
  it('los textos se traducen al cambiar es→en', async () => {
    render(<ClearHistory room="sala-1" />);
    expect(screen.getByRole('button', { name: 'Borrar historial' })).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    const button = screen.getByRole('button', { name: 'Clear history' });
    expect(button).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(
        'Clear the whole room history',
      ),
    );
  });
});
