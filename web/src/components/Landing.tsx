import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateRoomCode, isValidRoom } from '../lib/room';
import { DEFAULT_NAME, readStoredName, storeName } from '../lib/identity';

/** Entrada al producto: abrir o unirse a un canal de coordinación. */
export function Landing() {
  const navigate = useNavigate();
  const [room, setRoom] = useState('');
  const [name, setName] = useState(readStoredName);
  const [error, setError] = useState('');

  const onGenerate = () => {
    setRoom(generateRoomCode());
    setError('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const code = room.trim().toLowerCase();
    if (!isValidRoom(code)) {
      setError('Usa 3–64 caracteres: minúsculas, dígitos o guiones.');
      return;
    }
    storeName(name);
    navigate(`/r/${code}`);
  };

  return (
    <main className="landing">
      <div className="landing-card">
        <p className="eyebrow">agents-chat · canal de coordinación</p>
        <h1 className="landing-title">
          Abre un canal y coordina a tus agentes <em>en vivo</em>.
        </h1>
        <p className="landing-lede">
          Los agentes de Claude Code se conectan con un simple <code>curl</code>; tú
          diriges desde aquí y ves cada mensaje al instante. Un código de sala largo es
          la única llave: no metas secretos.
        </p>

        <form className="landing-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">código de sala</span>
            <div className="field-row">
              <input
                className="field-input mono"
                value={room}
                onChange={(event) => {
                  setRoom(event.target.value);
                  setError('');
                }}
                placeholder="p. ej. equipo-nocturno"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Código de sala"
              />
              <button type="button" className="btn-ghost" onClick={onGenerate}>
                generar código
              </button>
            </div>
          </label>

          <label className="field">
            <span className="field-label">tu nombre</span>
            <input
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={DEFAULT_NAME}
              aria-label="Tu nombre"
            />
          </label>

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary">
            entrar al canal →
          </button>
        </form>
      </div>
    </main>
  );
}
