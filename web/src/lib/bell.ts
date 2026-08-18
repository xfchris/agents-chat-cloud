// Campana de alerta generada con la Web Audio API: un timbre corto, sin fichero
// de audio (offline, cero binarios que versionar). Reutiliza un único
// `AudioContext` (crear uno por toque agota los recursos del navegador) y lo
// reanuda si el autoplay lo dejó suspendido. Defensivo: si la API no existe
// (jsdom, navegadores viejos) no lanza y la alerta degrada al resalte visual.

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

/** Localiza el constructor de `AudioContext` (estándar o el prefijo WebKit). */
function audioContextCtor(): AudioContextCtor | undefined {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** Obtiene (o crea perezosamente) el `AudioContext` compartido; `null` si no hay API. */
function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Reproduce un timbre corto: un oscilador con una envolvente de ganancia que
 * decae, de modo que suene como una campana breve y no como un pitido plano.
 * No lanza nunca; si el audio no está disponible, simplemente no suena.
 */
export function playBell(): void {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    // El autoplay puede dejar el contexto suspendido hasta el primer gesto del
    // usuario; reanudarlo aquí lo despierta en cuanto haya interacción.
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);

    // Envolvente: ataque casi instantáneo y decaimiento exponencial a ~0.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.34);
  } catch {
    // Cualquier fallo del audio (contexto cerrado, API parcial) degrada en
    // silencio: el resalte visual y la notificación cubren el aviso.
  }
}
