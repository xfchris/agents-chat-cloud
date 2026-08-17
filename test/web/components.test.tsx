import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '../../web/src/components/MessageList';
import { PresenceBar } from '../../web/src/components/PresenceBar';
import { Composer } from '../../web/src/components/Composer';
import { makeMessage, makePresence } from './helpers';

describe('MessageList', () => {
  it('renderiza los system centrados y sin burbuja', () => {
    render(
      <MessageList
        messages={[makeMessage({ id: 1, kind: 'system', text: 'Sala sala-1 creada' })]}
        myName="ana"
      />,
    );

    const line = screen.getByText('Sala sala-1 creada');
    expect(line).toHaveClass('system-line');
    // No es una burbuja de mensaje.
    expect(document.querySelector('.message')).toBeNull();
  });

  it('marca message-me cuando el nombre coincide con myName', () => {
    render(
      <MessageList
        messages={[
          makeMessage({ id: 1, name: 'ana', text: 'mío' }),
          makeMessage({ id: 2, name: 'bruno', text: 'ajeno' }),
        ]}
        myName="ana"
      />,
    );

    const mine = screen.getByText('mío').closest('article');
    const other = screen.getByText('ajeno').closest('article');
    expect(mine).toHaveClass('message-me');
    expect(other).not.toHaveClass('message-me');
  });

  it('muestra la hora formateada y omite la hora si el ts es inválido', () => {
    const { container } = render(
      <MessageList
        messages={[makeMessage({ id: 1, ts: 'fecha-mala', text: 'x' })]}
        myName="ana"
      />,
    );

    const time = container.querySelector('.message-time');
    expect(time?.textContent).toBe('');
  });

  // jsdom no hace layout: fijamos las métricas de scroll a mano para ejercitar
  // el autoscroll condicional (solo si el lector ya estaba abajo).
  function stubScrollMetrics(el: HTMLElement, { scrollHeight = 1000, clientHeight = 200 }) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  }

  it('autoscrollea al fondo si el lector ya estaba abajo al llegar un mensaje', () => {
    const { container, rerender } = render(
      <MessageList messages={[makeMessage({ id: 1 })]} myName="ana" />,
    );
    const log = container.querySelector('.log') as HTMLDivElement;
    stubScrollMetrics(log, { scrollHeight: 1000, clientHeight: 200 });

    rerender(
      <MessageList messages={[makeMessage({ id: 1 }), makeMessage({ id: 2 })]} myName="ana" />,
    );

    expect(log.scrollTop).toBe(1000);
  });

  it('no arranca el scroll si el lector está leyendo arriba', () => {
    const { container, rerender } = render(
      <MessageList messages={[makeMessage({ id: 1 })]} myName="ana" />,
    );
    const log = container.querySelector('.log') as HTMLDivElement;
    stubScrollMetrics(log, { scrollHeight: 1000, clientHeight: 200 });

    // El usuario sube: lejos del fondo (1000 - 100 - 200 = 700 > 80).
    log.scrollTop = 100;
    fireEvent.scroll(log);

    rerender(
      <MessageList messages={[makeMessage({ id: 1 }), makeMessage({ id: 2 })]} myName="ana" />,
    );

    // El efecto no lo empuja al fondo: conserva su posición.
    expect(log.scrollTop).toBe(100);
  });
});

describe('PresenceBar', () => {
  it('marca el chip propio con (tú)', () => {
    render(<PresenceBar online={[makePresence('ana'), makePresence('bruno')]} myName="ana" />);

    const mine = screen.getByText('ana').closest('li');
    expect(mine).toHaveClass('chip-me');
    expect(screen.getByText('(tú)')).toBeInTheDocument();

    const other = screen.getByText('bruno').closest('li');
    expect(other).not.toHaveClass('chip-me');
  });

  it('muestra el conteo cuando hay gente en línea', () => {
    render(<PresenceBar online={[makePresence('ana')]} myName="ana" />);
    expect(screen.getByText('en línea · 1')).toBeInTheDocument();
  });

  it('muestra silencio cuando no hay nadie', () => {
    render(<PresenceBar online={[]} myName="ana" />);
    expect(screen.getByText('canal en silencio')).toBeInTheDocument();
  });
});

describe('Composer', () => {
  it('envía con Enter y limpia el input', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    const input = screen.getByLabelText('Mensaje');
    await user.type(input, 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(input).toHaveValue('');
  });

  it('Shift+Enter inserta salto de línea y no envía', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    const input = screen.getByLabelText('Mensaje');
    await user.type(input, 'linea1{Shift>}{Enter}{/Shift}linea2');

    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('linea1\nlinea2');
  });

  it('envía con el botón Enviar', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    await user.type(screen.getByLabelText('Mensaje'), 'con boton');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSend).toHaveBeenCalledWith('con boton');
  });

  it('no envía solo espacios en blanco', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);

    await user.type(screen.getByLabelText('Mensaje'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('está deshabilitado si disabled=true (status !== connected)', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled />);

    const button = screen.getByRole('button', { name: 'Enviar' });
    expect(button).toBeDisabled();

    // Aun tecleando y pulsando Enter no envía mientras está deshabilitado.
    await user.type(screen.getByLabelText('Mensaje'), 'hola{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
