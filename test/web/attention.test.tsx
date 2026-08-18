import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TFunction } from 'i18next';
import { MessageList } from '../../web/src/components/MessageList';
import { NotificationToggle } from '../../web/src/components/NotificationToggle';
import { useChat } from '../../web/src/hooks/useChat';
import {
  notifyEnabled,
  notifyPermissionGranted,
  requestNotifyPermission,
  setNotifyEnabled,
  showAttentionNotification,
} from '../../web/src/lib/notify';
import i18n from '../../web/src/i18n';
import { installMockWebSocket, makeMessage, MockWebSocket } from './helpers';

// `bell.ts` cachea un único AudioContext en un singleton de módulo (correcto en
// producción). Para aislar cada test de audio recargamos el módulo con
// `resetModules` + import dinámico, así el singleton parte limpio.
async function freshBell() {
  vi.resetModules();
  return import('../../web/src/lib/bell');
}
async function freshAttention() {
  vi.resetModules();
  return import('../../web/src/lib/attention');
}

// SPEC 11 — alertas de intervención humana: render resaltado, campana Web Audio,
// toggle de notificaciones (persistencia + permiso) y disparo en vivo vs history
// vs propio. Mockeamos AudioContext, Notification y document.hidden.

// ---------- MessageList: render de kind:'attention' ----------

describe('MessageList · mensaje de intervención (kind:attention)', () => {
  it('resalta el mensaje, muestra la etiqueta traducida y una campana', () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            id: 1,
            name: 'claudecode-linux',
            text: 'necesito ayuda',
            kind: 'attention',
          }),
        ]}
        myName="ana"
      />,
    );

    const article = screen.getByText('necesito ayuda').closest('article') as HTMLElement;
    expect(article).toHaveClass('message-attention');
    // Etiqueta traducida (es por defecto en la suite).
    const tag = article.querySelector('.attention-tag') as HTMLElement;
    expect(tag).not.toBeNull();
    expect(tag.textContent).toContain('Intervención');
    expect(article.querySelector('.attention-bell')?.textContent).toBe('🔔');
  });

  it('un mensaje normal no lleva el resalte ni la etiqueta', () => {
    render(
      <MessageList
        messages={[makeMessage({ id: 1, text: 'hola normal', kind: 'msg' })]}
        myName="ana"
      />,
    );

    const article = screen.getByText('hola normal').closest('article') as HTMLElement;
    expect(article).not.toHaveClass('message-attention');
    expect(article.querySelector('.attention-tag')).toBeNull();
  });

  it('una alerta propia conserva message-me y el resalte a la vez', () => {
    render(
      <MessageList
        messages={[makeMessage({ id: 1, name: 'ana', text: 'mía', kind: 'attention' })]}
        myName="ana"
      />,
    );

    const article = screen.getByText('mía').closest('article') as HTMLElement;
    expect(article).toHaveClass('message-me');
    expect(article).toHaveClass('message-attention');
  });
});

// ---------- lib/bell: campana con Web Audio API ----------

describe('lib/bell · playBell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockAudioContext() {
    const oscillator = {
      type: '',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      state: 'suspended' as AudioContextState,
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      destination: {},
    };
    // Función regular (no arrow): debe ser construible con `new`.
    const Ctor = vi.fn(function () {
      return ctx;
    });
    vi.stubGlobal('AudioContext', Ctor);
    return { ctx, oscillator, gain, Ctor };
  }

  it('crea el contexto, lo reanuda si está suspendido y arranca un oscilador', async () => {
    const { ctx, oscillator } = mockAudioContext();
    const { playBell } = await freshBell();

    expect(() => playBell()).not.toThrow();
    expect(ctx.resume).toHaveBeenCalled();
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
  });

  it('reutiliza un único AudioContext entre llamadas', async () => {
    const { Ctor } = mockAudioContext();
    const { playBell } = await freshBell();

    playBell();
    playBell();
    // Solo se instancia una vez pese a dos toques.
    expect(Ctor).toHaveBeenCalledTimes(1);
  });

  it('usa webkitAudioContext como respaldo si no hay AudioContext estándar', async () => {
    const { Ctor } = mockAudioContext();
    // Sustituye el estándar por el prefijo WebKit.
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', Ctor);
    const { playBell } = await freshBell();

    playBell();
    expect(Ctor).toHaveBeenCalledTimes(1);
  });

  it('no lanza si AudioContext no existe en el navegador', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const { playBell } = await freshBell();
    expect(() => playBell()).not.toThrow();
  });

  it('degrada en silencio si createOscillator lanza', async () => {
    const Ctor = vi.fn(function () {
      return {
        state: 'running',
        currentTime: 0,
        resume: vi.fn(),
        createOscillator: () => {
          throw new Error('audio roto');
        },
        createGain: vi.fn(),
        destination: {},
      };
    });
    vi.stubGlobal('AudioContext', Ctor);
    const { playBell } = await freshBell();
    expect(() => playBell()).not.toThrow();
  });
});

// ---------- lib/notify: preferencia + permiso ----------

describe('lib/notify · preferencia en localStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('notifyEnabled es false sin preferencia y true con "1"', () => {
    expect(notifyEnabled()).toBe(false);
    localStorage.setItem('notifyOnAttention', '1');
    expect(notifyEnabled()).toBe(true);
  });

  it('setNotifyEnabled(true) persiste "1" y (false) lo limpia', () => {
    setNotifyEnabled(true);
    expect(localStorage.getItem('notifyOnAttention')).toBe('1');
    setNotifyEnabled(false);
    expect(localStorage.getItem('notifyOnAttention')).toBeNull();
  });

  it('degrada sin romper si localStorage lanza', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sin storage');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin storage');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('sin storage');
    });
    expect(notifyEnabled()).toBe(false);
    expect(() => setNotifyEnabled(true)).not.toThrow();
    expect(() => setNotifyEnabled(false)).not.toThrow();
  });
});

describe('lib/notify · permiso y notificación', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const t = ((key: string, opts?: Record<string, unknown>) =>
    opts?.name ? `${key}:${String(opts.name)}` : key) as unknown as TFunction;

  it('sin la API Notification: permiso no concedido y requestPermission da "default"', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(notifyPermissionGranted()).toBe(false);
    await expect(requestNotifyPermission()).resolves.toBe('default');
  });

  it('requestNotifyPermission pide permiso solo si el estado es "default"', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });

    await expect(requestNotifyPermission()).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalled();
  });

  it('no re-pregunta si ya hay una decisión (permiso denegado)', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });

    await expect(requestNotifyPermission()).resolves.toBe('denied');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('si requestPermission lanza, degrada a "denied"', async () => {
    const requestPermission = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    await expect(requestNotifyPermission()).resolves.toBe('denied');
  });

  it('showAttentionNotification crea la notificación solo con permiso concedido', () => {
    const ctor = vi.fn();
    const NotificationMock = Object.assign(ctor, { permission: 'granted' });
    vi.stubGlobal('Notification', NotificationMock);

    showAttentionNotification(makeMessage({ name: 'codex-mac' }), t);
    expect(ctor).toHaveBeenCalledWith('attention.notifyTitle', {
      body: 'attention.notifyBody:codex-mac',
    });
  });

  it('no notifica si el permiso no está concedido', () => {
    const ctor = vi.fn();
    const NotificationMock = Object.assign(ctor, { permission: 'default' });
    vi.stubGlobal('Notification', NotificationMock);

    showAttentionNotification(makeMessage({ name: 'ana' }), t);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('si el constructor de Notification lanza, degrada en silencio', () => {
    const ctor = vi.fn(() => {
      throw new Error('requires service worker');
    });
    const NotificationMock = Object.assign(ctor, { permission: 'granted' });
    vi.stubGlobal('Notification', NotificationMock);

    expect(() => showAttentionNotification(makeMessage({ name: 'ana' }), t)).not.toThrow();
  });
});

// ---------- lib/attention: composición campana + notificación ----------

describe('lib/attention · fireAttentionAlert', () => {
  const t = ((key: string) => key) as unknown as TFunction;

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  function stubHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  }

  function stubAudio() {
    const start = vi.fn();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return {
          state: 'running',
          currentTime: 0,
          resume: vi.fn(),
          createOscillator: () => ({
            type: '',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
            start,
            stop: vi.fn(),
          }),
          createGain: () => ({
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
          }),
          destination: {},
        };
      }),
    );
    return { start };
  }

  it('siempre suena la campana; notifica con toggle+permiso+pestaña oculta', async () => {
    const { start } = stubAudio();
    const ctor = vi.fn();
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }));
    localStorage.setItem('notifyOnAttention', '1');
    stubHidden(true);
    const { fireAttentionAlert } = await freshAttention();

    fireAttentionAlert(makeMessage({ name: 'codex-linux' }), t);

    expect(start).toHaveBeenCalled();
    expect(ctor).toHaveBeenCalled();
  });

  it('con la pestaña visible suena la campana pero NO notifica', async () => {
    const { start } = stubAudio();
    const ctor = vi.fn();
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }));
    localStorage.setItem('notifyOnAttention', '1');
    stubHidden(false);
    const { fireAttentionAlert } = await freshAttention();

    fireAttentionAlert(makeMessage({ name: 'codex-linux' }), t);

    expect(start).toHaveBeenCalled();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('con el toggle desactivado no notifica (aunque haya permiso y pestaña oculta)', async () => {
    stubAudio();
    const ctor = vi.fn();
    vi.stubGlobal('Notification', Object.assign(ctor, { permission: 'granted' }));
    localStorage.removeItem('notifyOnAttention');
    stubHidden(true);
    const { fireAttentionAlert } = await freshAttention();

    fireAttentionAlert(makeMessage({ name: 'codex-linux' }), t);
    expect(ctor).not.toHaveBeenCalled();
  });
});

// ---------- NotificationToggle ----------

describe('NotificationToggle', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arranca desactivado (🔕) y refleja aria-pressed=false', () => {
    render(<NotificationToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', 'Activar avisos');
    expect(button).toHaveAttribute('title', 'Avisar cuando un agente pida intervención');
  });

  it('al activarlo pide permiso, persiste la preferencia y pasa a 🔔', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const user = userEvent.setup();

    render(<NotificationToggle />);
    await user.click(screen.getByRole('button'));

    expect(requestPermission).toHaveBeenCalled();
    expect(localStorage.getItem('notifyOnAttention')).toBe('1');
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-label', 'Desactivar avisos');
  });

  it('al desactivarlo limpia la preferencia sin volver a pedir permiso', async () => {
    localStorage.setItem('notifyOnAttention', '1');
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    const user = userEvent.setup();

    render(<NotificationToggle />);
    // Arranca activado.
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button'));

    expect(localStorage.getItem('notifyOnAttention')).toBeNull();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ---------- i18n: los textos nuevos existen en los 4 idiomas ----------

describe('SPEC 11 · textos de intervención en los cuatro idiomas', () => {
  // Etiqueta del mensaje (MessageList) y textos del toggle por idioma. Cubre el
  // criterio "todos los textos nuevos salen de i18n en los cuatro idiomas": no
  // basta con `es`, deben resolverse (no mostrar la clave cruda) en en/pt/zh.
  const cases = [
    { lng: 'es', label: 'Intervención', toggleOn: 'Activar avisos', tooltip: 'Avisar cuando un agente pida intervención' },
    { lng: 'en', label: 'Attention', toggleOn: 'Enable alerts', tooltip: 'Alert me when an agent asks for intervention' },
    { lng: 'pt', label: 'Intervenção', toggleOn: 'Ativar avisos', tooltip: 'Avisar quando um agente pedir intervenção' },
    { lng: 'zh', label: '求助', toggleOn: '开启提醒', tooltip: '当智能体请求人工介入时提醒我' },
  ];

  afterEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('es');
    });
  });

  it.each(cases)('en $lng: etiqueta del mensaje y textos del toggle traducidos', async ({
    lng,
    label,
    toggleOn,
    tooltip,
  }) => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage(lng);
    });

    const { unmount } = render(
      <MessageList
        messages={[makeMessage({ id: 1, name: 'codex-linux', text: 'ayuda', kind: 'attention' })]}
        myName="ana"
      />,
    );
    // La etiqueta del mensaje sale traducida (no la clave cruda `attention.label`).
    const tag = screen.getByText('ayuda').closest('article')!.querySelector('.attention-tag')!;
    expect(tag.textContent).toContain(label);
    unmount();

    // El toggle arranca desactivado: su aria-label es `toggleOn` y el title el tooltip.
    render(<NotificationToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', toggleOn);
    expect(button).toHaveAttribute('title', tooltip);
  });
});

// ---------- useChat: disparo en vivo vs history vs propio ----------

describe('useChat · gancho de alerta en vivo (onLiveAttention)', () => {
  let restoreWs: () => void;

  beforeEach(() => {
    restoreWs = installMockWebSocket();
  });
  afterEach(() => {
    restoreWs();
    vi.restoreAllMocks();
  });

  it('dispara con un attention EN VIVO de otro participante', () => {
    const onAttention = vi.fn();
    renderHook(() => useChat('sala-1', 'ana', onAttention));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'msg',
        msg: makeMessage({ id: 5, name: 'codex-linux', text: 'ayuda', kind: 'attention' }),
      });
    });

    expect(onAttention).toHaveBeenCalledTimes(1);
    expect(onAttention.mock.calls[0][0]).toMatchObject({ id: 5, kind: 'attention' });
  });

  it('NO dispara para un attention propio (mismo nombre)', () => {
    const onAttention = vi.fn();
    renderHook(() => useChat('sala-1', 'ana', onAttention));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'msg',
        msg: makeMessage({ id: 5, name: 'ana', text: 'mía', kind: 'attention' }),
      });
    });

    expect(onAttention).not.toHaveBeenCalled();
  });

  it('NO dispara para un attention que llega en el history inicial', () => {
    const onAttention = vi.fn();
    renderHook(() => useChat('sala-1', 'ana', onAttention));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'history',
        history: [
          makeMessage({ id: 1, name: 'codex-linux', text: 'previo', kind: 'attention' }),
        ],
      });
    });

    expect(onAttention).not.toHaveBeenCalled();
  });

  it('NO dispara para un msg normal en vivo de otro', () => {
    const onAttention = vi.fn();
    renderHook(() => useChat('sala-1', 'ana', onAttention));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'msg',
        msg: makeMessage({ id: 6, name: 'bruno', text: 'normal', kind: 'msg' }),
      });
    });

    expect(onAttention).not.toHaveBeenCalled();
  });

  it('no re-dispara para un attention duplicado (id ya visto)', () => {
    const onAttention = vi.fn();
    renderHook(() => useChat('sala-1', 'ana', onAttention));
    const dup = makeMessage({ id: 9, name: 'codex-linux', text: 'ayuda', kind: 'attention' });

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({ type: 'msg', msg: dup });
      MockWebSocket.last.emit({ type: 'msg', msg: { ...dup, text: 'ayuda copia' } });
    });

    expect(onAttention).toHaveBeenCalledTimes(1);
  });

  it('sin callback no rompe al llegar un attention en vivo', () => {
    const { result } = renderHook(() => useChat('sala-1', 'ana'));

    act(() => {
      MockWebSocket.last.open();
      MockWebSocket.last.emit({
        type: 'msg',
        msg: makeMessage({ id: 7, name: 'codex-linux', text: 'ayuda', kind: 'attention' }),
      });
    });

    expect(result.current.messages).toHaveLength(1);
  });
});
