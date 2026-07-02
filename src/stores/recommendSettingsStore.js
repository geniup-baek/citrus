import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

const LS_KEY = 'citrus:recommend-settings'

const DEFAULTS = {
  moaConflictDays: 60,
  enforceMaxApplications: false,
  maxApplicationsPerYear: 3,
}

export const useRecommendSettingsStore = defineStore('recommendSettings', () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch {}

  const settings = reactive({ ...DEFAULTS, ...saved })

  watch(() => ({ ...settings }), (v) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
  }, { deep: true })

  function reset() { Object.assign(settings, DEFAULTS) }

  function restoreSettings(data) { Object.assign(settings, { ...DEFAULTS, ...data }) }

  return { settings, reset, restoreSettings }
})
