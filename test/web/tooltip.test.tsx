import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../web/src/components/Tooltip';
import i18n from '../../web/src/i18n';

// Devuelve el nodo de la burbuja en CUALQUIER estado. La burbuja siempre está en el
// DOM (para que RTL la vea), pero cuando está cerrada lleva `aria-hidden="true"` y
// queda fuera del árbol de accesibilidad; por eso se localiza con `{ hidden: true }`.
// Su apertura/cierre se decide por `data-open` / `aria-hidden`, no por su presencia.
function bubble() {
  return screen.getByRole('tooltip', { hidden: true });
}
function isOpen() {
  return bubble().hasAttribute('data-open');
}

// Disparador de conveniencia: un botón enfocable con texto propio.
function renderTooltip(label = 'Hola', placement?: 'top' | 'bottom') {
  return render(
    <Tooltip label={label} placement={placement}>
      <button type="button">disparador</button>
    </Tooltip>,
  );
}

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('es');
  });
});

describe('Tooltip', () => {
  it('la burbuja tiene role="tooltip" y muestra el texto', () => {
    renderTooltip('Cambiar tema');
    expect(bubble()).toHaveTextContent('Cambiar tema');
  });

  it('arranca oculto y aparece al hover; desaparece al salir el ratón', () => {
    renderTooltip();
    const wrap = bubble().parentElement as HTMLElement;

    expect(isOpen()).toBe(false);
    fireEvent.mouseEnter(wrap);
    expect(isOpen()).toBe(true);
    fireEvent.mouseLeave(wrap);
    expect(isOpen()).toBe(false);
  });

  it('aparece al enfocar el disparador y desaparece al perder el foco (blur)', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'disparador' });

    fireEvent.focus(trigger);
    expect(isOpen()).toBe(true);
    fireEvent.blur(trigger);
    expect(isOpen()).toBe(false);
  });

  it('Escape oculta la burbuja mientras el disparador está enfocado', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'disparador' });

    fireEvent.focus(trigger);
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });

  it('otras teclas no cierran la burbuja (solo Escape)', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'disparador' });

    fireEvent.focus(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(isOpen()).toBe(true);
  });

  it('inyecta aria-describedby en el disparador apuntando al id de la burbuja', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'disparador' });

    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(describedBy).toBe(bubble().id);
  });

  it('respeta un aria-describedby previo del disparador concatenando el id', () => {
    render(
      <Tooltip label="Hola">
        <button type="button" aria-describedby="externo">
          disparador
        </button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'disparador' });
    expect(trigger.getAttribute('aria-describedby')).toBe(`externo ${bubble().id}`);
  });

  it('aplica la clase de placement (top por defecto, bottom explícito)', () => {
    const { rerender } = renderTooltip('Hola');
    expect(bubble()).toHaveClass('tt-top');

    rerender(
      <Tooltip label="Hola" placement="bottom">
        <button type="button">disparador</button>
      </Tooltip>,
    );
    expect(bubble()).toHaveClass('tt-bottom');
  });

  it('cerrada: la burbuja lleva aria-hidden y queda fuera del árbol accesible', () => {
    renderTooltip();
    // Cerrada por defecto: aria-hidden="true" y `getByRole('tooltip')` (sin hidden)
    // no la encuentra, pero sigue en el DOM (localizable con { hidden: true }).
    expect(isOpen()).toBe(false);
    expect(bubble()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('abierta por hover: se quita aria-hidden y entra en el árbol accesible', () => {
    renderTooltip();
    const wrap = bubble().parentElement as HTMLElement;

    fireEvent.mouseEnter(wrap);
    // Ya visible en el árbol de accesibilidad: `getByRole('tooltip')` normal la ve.
    expect(screen.getByRole('tooltip')).toBe(bubble());
    expect(bubble()).not.toHaveAttribute('aria-hidden');
  });

  it('abierta por foco: se quita aria-hidden; al blur vuelve a ocultarse', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'disparador' });

    fireEvent.focus(trigger);
    expect(bubble()).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('tooltip')).toBe(bubble());

    fireEvent.blur(trigger);
    expect(bubble()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('el texto de la burbuja cambia con el idioma', async () => {
    function Translated() {
      const { t } = useTranslation();
      return (
        <Tooltip label={t('tooltip.theme')} placement="bottom">
          <button type="button">disparador</button>
        </Tooltip>
      );
    }
    render(<Translated />);

    expect(bubble()).toHaveTextContent('Cambiar tema');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(bubble()).toHaveTextContent('Change theme');
  });

  // Legibilidad en ambos temas: inspección estática de tokens (jsdom no computa CSS
  // externo). Los tokens `--tooltip-*` viven en `:root` y NO se redefinen por tema,
  // así que el look «oscuro compacto» es constante y legible sobre claro y oscuro.
  it('define los tokens --tooltip-* en :root, una sola vez (constantes en ambos temas)', () => {
    const css = readFileSync(resolve(process.cwd(), 'web/src/styles.css'), 'utf8');
    const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
    for (const token of ['--tooltip-bg', '--tooltip-fg', '--tooltip-border', '--tooltip-shadow']) {
      // Presente en :root…
      expect(rootBlock).toContain(`${token}:`);
      // …y definido una única vez en todo el archivo (no reasignado por tema).
      const defs = css.match(new RegExp(`${token}\\s*:`, 'g')) ?? [];
      expect(defs).toHaveLength(1);
    }
  });
});
