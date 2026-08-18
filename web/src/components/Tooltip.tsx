import { cloneElement, useId, useState, type KeyboardEvent, type ReactElement } from 'react';

interface TooltipProps {
  /** Texto ya traducido por el llamador (`t('...')`). */
  label: string;
  /** Posición de la burbuja respecto al disparador. Por defecto `'top'`. */
  placement?: 'top' | 'bottom';
  /** Disparador: un ÚNICO elemento (contrato de `cloneElement`). */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

/**
 * Tooltip propio (sin librerías) con look «oscuro compacto» tipo Bootstrap.
 * Envuelve un único elemento disparador y muestra una burbuja `role="tooltip"`
 * enlazada por `aria-describedby`. Se muestra al hover y al foco de teclado; se
 * oculta al salir el ratón, al perder el foco y con Escape. La burbuja permanece
 * en el DOM y su visibilidad la gobierna el estado `open` (jsdom no aplica
 * `:hover`, y así RTL puede verificarla). El id es estable por instancia.
 */
export function Tooltip({ label, placement = 'top', children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  // Respeta un `aria-describedby` previo del disparador, concatenando el id de la
  // burbuja para no pisar otras descripciones accesibles.
  const previous = children.props['aria-describedby'];
  const describedBy = previous ? `${previous} ${id}` : id;
  const trigger = cloneElement(children, { 'aria-describedby': describedBy });

  // Escape sólo cierra este tooltip; no detiene la propagación para no romper
  // otros consumidores del evento (p. ej. el popover de ShareInvite).
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <span
      className="tt-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={onKeyDown}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={`tt-bubble tt-${placement}`}
        data-open={open ? 'true' : undefined}
        // Fuera del árbol de accesibilidad mientras está oculta: evita exponer
        // permanentemente el texto (redundante con el `aria-label` del control) y
        // que `aria-describedby` lo anuncie cuando no se ve. Permanece en el DOM.
        aria-hidden={open ? undefined : 'true'}
      >
        {label}
      </span>
    </span>
  );
}
