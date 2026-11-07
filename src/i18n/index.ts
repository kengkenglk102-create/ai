import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import viResources from '../locales/vi.json';
import enResources from '../locales/en.json';

const languageAliases: Record<string, string> = {
  'en-US': 'en',
  'en-GB': 'en',
  'vi-VN': 'vi',
  'vi-vn': 'vi',
  'zh-CN': 'vi',
  'zh-TW': 'vi',
};

export const supportedLanguages = ['vi', 'en'];

const loadedLanguages = new Set<string>();
let initPromise: Promise<void> | null = null;
let i18nBootstrapped = false;

export function normalizeLanguage(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) {
    return 'vi';
  }

  if (languageAliases[trimmed]) {
    return languageAliases[trimmed];
  }

  const lower = trimmed.toLowerCase();
  if (languageAliases[lower]) {
    return languageAliases[lower];
  }

  return supportedLanguages.includes(lower) ? lower : 'vi';
}

function resolveSupportedLanguage(lang: string): string {
  const normalized = normalizeLanguage(lang);
  return supportedLanguages.includes(normalized) ? normalized : 'vi';
}

function getSavedLanguage(): string {
  try {
    return resolveSupportedLanguage(localStorage.getItem('app-language') || 'vi');
  } catch {
    return 'vi';
  }
}

function bootstrapI18n(savedLanguage: string): string {
  if (i18nBootstrapped) {
    return savedLanguage;
  }

  i18n
    .use(initReactI18next)
    .init({
      resources: {
        vi: { translation: viResources },
        en: { translation: enResources },
      },
      lng: savedLanguage,
      fallbackLng: 'vi',
      supportedLngs: supportedLanguages,
      lowerCaseLng: true,
      load: 'currentOnly',
      initImmediate: false,
      interpolation: {
        escapeValue: false,
      },
    });

  loadedLanguages.add('vi');
  loadedLanguages.add('en');
  i18nBootstrapped = true;
  return savedLanguage;
}

export async function initI18n(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  const savedLanguage = getSavedLanguage();
  bootstrapI18n(savedLanguage);

  initPromise = Promise.resolve();
  return initPromise;
}

export async function syncLanguage(lang: string): Promise<string> {
  await initI18n();
  const resolved = resolveSupportedLanguage(lang);
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
  try {
    localStorage.setItem('app-language', resolved);
  } catch {
    // ignore localStorage write failures
  }
  return resolved;
}

export async function changeLanguage(lang: string): Promise<void> {
  await syncLanguage(lang);
}

export function getCurrentLanguage(): string {
  return normalizeLanguage(i18n.language || 'vi');
}

export default i18n;
