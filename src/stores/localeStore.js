import { defineStore } from 'pinia'
import { messages } from '../i18n/messages'

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

function t(path, params = {}) {
  const val = deepGet(messages, path)
  if (typeof val === 'string') {
    return applyParams(val, params)
  }

  return path
}

export const useLocaleStore = defineStore('locale', () => {
  return { t }
})
