import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface ComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

/** Entrada de mensajes: Enter envía, Shift+Enter inserta salto de línea. */
export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const body = text.trim();
    if (!body || disabled) return;
    onSend(body);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <footer className="composer">
      <textarea
        className="composer-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Escribe un mensaje… (Enter envía · Shift+Enter salta de línea)"
        rows={1}
        aria-label="Mensaje"
      />
      <button
        type="button"
        className="composer-send"
        onClick={submit}
        disabled={disabled || text.trim().length === 0}
      >
        Enviar
      </button>
    </footer>
  );
}
