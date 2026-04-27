import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW'
import zhCN from './locales/zh-CN'
import en from './locales/en'
import vi from './locales/vi'

export type SupportedLocale = 'zh-TW' | 'zh-CN' | 'en' | 'vi'

export const SUPPORTED_LOCALES: { code: SupportedLocale; label: string; flag: string }[] = [
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
]

const savedLocale = (localStorage.getItem('locale') as SupportedLocale) || 'zh-TW'

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'zh-TW',
  messages: {
    'zh-TW': zhTW,
    'zh-CN': zhCN,
    en,
    vi,
  },
})

export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
}
