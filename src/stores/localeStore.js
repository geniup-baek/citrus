import { defineStore } from 'pinia'
import { ref } from 'vue'
import { messages } from '../i18n/messages'

const STORAGE_KEY = 'citrus-locale-v1'

function deepGet(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

function applyParams(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, token) => {
    if (params[token] === undefined) {
      return `{${token}}`
    }

    return String(params[token])
  })
}

export const useLocaleStore = defineStore('locale', () => {
  const preferred = localStorage.getItem(STORAGE_KEY)
  const browserFallback = navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
  const locale = ref(preferred === 'ko' || preferred === 'en' ? preferred : browserFallback)

  function setLocale(nextLocale) {
    if (nextLocale !== 'ko' && nextLocale !== 'en') {
      return
    }

    locale.value = nextLocale
    localStorage.setItem(STORAGE_KEY, nextLocale)
  }

  function t(path, params = {}) {
    const primary = deepGet(messages[locale.value], path)
    if (typeof primary === 'string') {
      return applyParams(primary, params)
    }

    const fallback = deepGet(messages.en, path)
    if (typeof fallback === 'string') {
      return applyParams(fallback, params)
    }

    return path
  }

  return {
    locale,
    setLocale,
    t,
  }
})
