import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

// Idiomas soportados. `es` es el fallback (y el idioma del backend).
export const SUPPORTED_LNGS = ['es', 'en', 'pt', 'zh'] as const;

export type Lng = (typeof SUPPORTED_LNGS)[number];

// Recursos empaquetados inline: sin backend HTTP, para que el primer render ya
// tenga las cadenas y la init sea síncrona.
const resources = {
  es: { translation: es },
  en: { translation: en },
  pt: { translation: pt },
  zh: { translation: zh },
} as const;

// Init síncrona (recursos inline): al importar este módulo antes de renderizar,
// `useTranslation` dispone de las traducciones en el primer paint.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LNGS,
    // Detecta por elección guardada primero, luego por el idioma del navegador;
    // la elección explícita persiste en `localStorage['i18nextLng']`.
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      // React ya escapa por nosotros: evitamos el doble escape.
      escapeValue: false,
    },
  });

export default i18n;
