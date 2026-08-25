// 농장 데이터의 기본값·정규화 — state를 전혀 참조하지 않는 순수 함수만 모아둔다.
// (init/loadLocal/onSnapshot/restoreBackup 등 "외부에서 들어온 데이터를 안전한 모양으로
// 맞추는" 지점에서 공통으로 쓰인다.)
import {
  annualTaskTemplates,
  defaultAncillaries,
  defaultAppSettings,
  defaultFacilities,
  defaultIssues,
  defaultScheduleSettings,
  defaultScheduleRules,
  defaultSeedlings,
  defaultTasks,
  defaultInventory,
  defaultUsageGuides,
} from '../../data/defaults'
import { uuid } from '../../utils/uuid.js'

export function farmStorageKey(farmId) {
  return `citrus-farm-${farmId}-v1`
}

// ── 농장별 데이터 (facilities…notifications) ─────────────────────────────────
export function createDefaultFarmData() {
  return {
    facilities: [...defaultFacilities],
    ancillaries: [...defaultAncillaries],
    seedlings: [...defaultSeedlings],
    tasks: [...defaultTasks],
    scheduleRules: [...defaultScheduleRules],
    scheduleSettings: { ...defaultScheduleSettings },
    issues: [...defaultIssues],
    inventory: [...defaultInventory],
    usageGuides: [...defaultUsageGuides],
    annualTaskTemplates: [...annualTaskTemplates],
    notifications: {},
    changeLog: [],
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeFarmData(data) {
  const defaults = createDefaultFarmData()

  return {
    facilities: Array.isArray(data?.facilities) ? data.facilities : defaults.facilities,
    ancillaries: Array.isArray(data?.ancillaries) ? data.ancillaries : defaults.ancillaries,
    seedlings: Array.isArray(data?.seedlings) ? data.seedlings : defaults.seedlings,
    tasks: Array.isArray(data?.tasks) ? data.tasks : defaults.tasks,
    scheduleRules: Array.isArray(data?.scheduleRules)
      ? data.scheduleRules
      : defaults.scheduleRules,
    scheduleSettings:
      data?.scheduleSettings && typeof data.scheduleSettings === 'object'
        ? { ...defaults.scheduleSettings, ...data.scheduleSettings }
        : defaults.scheduleSettings,
    issues: Array.isArray(data?.issues) ? data.issues : defaults.issues,
    inventory: Array.isArray(data?.inventory) ? data.inventory : defaults.inventory,
    usageGuides: Array.isArray(data?.usageGuides) ? data.usageGuides : defaults.usageGuides,
    annualTaskTemplates: [...annualTaskTemplates],
    notifications:
      data?.notifications && typeof data.notifications === 'object'
        ? data.notifications
        : defaults.notifications,
    changeLog: Array.isArray(data?.changeLog) ? data.changeLog : defaults.changeLog,
    updatedAt: data?.updatedAt || defaults.updatedAt,
  }
}

// ── 공통(농장 무관) 분류·항목 설정 ─────────────────────────────────────────────
export function normalizeAppSettings(data) {
  const defaults = { ...defaultAppSettings }
  const stored = data && typeof data === 'object' ? data : {}
  const merged = { ...defaults, ...stored }
  const storedCats = Array.isArray(stored.taskCategories) ? stored.taskCategories : []
  merged.taskCategories = [...new Set([...defaults.taskCategories, ...storedCats])]
  const storedRootstocks = Array.isArray(stored.rootstockTypes) ? stored.rootstockTypes : []
  merged.rootstockTypes = [...new Set([...defaults.rootstockTypes, ...storedRootstocks])]
  const storedEquipment = Array.isArray(stored.equipmentTypes) ? stored.equipmentTypes : []
  merged.equipmentTypes = [...new Set([...defaults.equipmentTypes, ...storedEquipment])]
  // pesticideTypes: migrate old string[] → {name, abbr}[] and merge with defaults
  const defPesti = defaults.pesticideTypes
  const normPesti = v => typeof v === 'string' ? { name: v, abbr: '' } : v
  const storedPestiRaw = Array.isArray(stored.pesticideTypes) ? stored.pesticideTypes : []
  const storedPesti = storedPestiRaw.map(normPesti)
  if (storedPesti.length === 0) {
    merged.pesticideTypes = defPesti
  } else {
    const defAbbrMap = new Map(defPesti.map(p => [p.name, p.abbr]))
    const storedNames = new Set(storedPesti.map(p => p.name))
    merged.pesticideTypes = [
      ...storedPesti.map(p => ({ ...p, abbr: p.abbr || defAbbrMap.get(p.name) || '' })),
      ...defPesti.filter(p => !storedNames.has(p.name)),
    ]
  }
  return merged
}

export function normalizeIssue(issue) {
  return {
    ...issue,
    resolutionSteps: Array.isArray(issue?.resolutionSteps) ? issue.resolutionSteps : [],
    photos: Array.isArray(issue?.photos) ? issue.photos : [],
  }
}

export function normalizeUsageGuide(guide) {
  return {
    ...guide,
    steps: (Array.isArray(guide?.steps) ? guide.steps : []).map((s) => ({
      ...s,
      photos: Array.isArray(s?.photos) ? s.photos : [],
    })),
  }
}

export function normalizeInventoryItem(item) {
  // 로트(규격+유효기간) 기반: 현재 재고는 txns로부터 계산하므로 품목엔 메타 + txns만 보관한다.
  // 구버전(품목당 단일 수량/단위) 데이터는 unit→규격, expiryDate→유효기간으로 이전한다.
  const fallbackVolume = item?.unit || '기본'
  const fallbackExpiry = item?.expiryDate || ''
  const txns = (Array.isArray(item?.txns) ? item.txns : []).map((t) => ({
    id: t.id || uuid(),
    date: t.date || new Date().toISOString(),
    type: t.type === '사용' ? '사용' : '입고',
    volume: t.volume || fallbackVolume,
    expiryDate: t.expiryDate || fallbackExpiry,
    amount: Math.abs(Number(t.amount) || 0),
    note: t.note || '',
  }))
  return {
    id: item?.id,
    name: item?.name || '',
    category: item?.category === '농약' ? '농약' : '비료',
    pesticideType: item?.pesticideType || '',
    actionGroup: item?.actionGroup || '',
    productName: item?.productName || '',
    matchSource: item?.matchSource === 'auto' ? 'auto' : '', // 공공데이터로 연결된 품목 표시
    notes: item?.notes || '',
    txns,
  }
}

export function normalizeRule(rule) {
  return {
    ...rule,
    interval: Math.max(1, Number(rule?.interval || 1)),
    dayOfWeek: Math.max(1, Math.min(7, Number(rule?.dayOfWeek || 1))),
    dayOfMonth: Math.max(1, Math.min(31, Number(rule?.dayOfMonth || 1))),
    enabled: rule?.enabled !== false,
  }
}

export function normalizeScheduleSettings(settings) {
  return {
    generationDays: Math.max(1, Math.min(180, Number(settings?.generationDays || 21))),
    duplicatePolicy: ['rule-and-date', 'title-and-date', 'allow'].includes(settings?.duplicatePolicy)
      ? settings.duplicatePolicy
      : 'rule-and-date',
  }
}
