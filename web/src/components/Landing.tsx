import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { generateRoomCode, isValidRoom } from '../lib/room';
import { DEFAULT_NAME, readStoredName, storeName } from '../lib/identity';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Entrada al producto: abrir o unirse a un canal de coordinación. */
export function Landing() {
  const { t } = useTranslation();
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
      setError(t('landing.invalidRoom'));
      return;
    }
    storeName(name);
    navigate(`/r/${code}`);
  };

  return (
    <main className="landing">
      <div className="landing-controls">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="landing-card">
        <p className="eyebrow">{t('landing.eyebrow')}</p>
        <h1 className="landing-title">
          {t('landing.titleLead')} <em>{t('landing.titleEm')}</em>
          {t('landing.titleTail')}
        </h1>
        <p className="landing-lede">
          {t('landing.ledeLead')} <code>curl</code>
          {t('landing.ledeTail')}
        </p>

        <form className="landing-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">{t('landing.roomLabel')}</span>
            <div className="field-row">
              <input
                className="field-input mono"
                value={room}
                onChange={(event) => {
                  setRoom(event.target.value);
                  setError('');
                }}
                placeholder={t('landing.roomPlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={t('landing.roomAria')}
              />
              <button type="button" className="btn-ghost" onClick={onGenerate}>
                {t('landing.generate')}
              </button>
            </div>
          </label>

          <label className="field">
            <span className="field-label">{t('landing.nameLabel')}</span>
            <input
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={DEFAULT_NAME}
              aria-label={t('landing.nameAria')}
            />
          </label>

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary">
            {t('landing.enter')}
          </button>
        </form>
      </div>
    </main>
  );
}
