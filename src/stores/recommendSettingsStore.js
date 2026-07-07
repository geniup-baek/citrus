import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

const LS_KEY = 'citrus:recommend-settings'

const DEFAULTS = {
  moaConflictDays: 60,
  enforceMaxApplications: true,
  maxApplicationsPerYear: 3,
  preferPesticideMaxApplications: true,
  excludeToxicGrades: ['고독성', '맹독성'],
  excludeFishToxicGrades: ['Ⅰ급'],
  skipCachedPesticideDetails: true, // 농약 상세정보 전체 가져오기 시 이미 캐시된 항목은 건너뛸지 여부
  overwriteLinkedTreatments: false, // 방제이력 전체 재연결 시 이미 연결된(작용기작이 채워진) 이력도 다시 연결할지 여부
  autoOpenPrintDialog: false, // PDF 출력 시 인쇄 대화상자를 자동으로 열지 여부
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
