import { defineStore } from 'pinia'
import { ref } from 'vue'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { loadCache } from '../services/cache.js'
import { db, firebaseEnabled } from '../services/firebase.js'
import { getToxicityFromCache, getFishToxicFromCache } from '../services/pesticide.js'

const FULL_KEY    = 'pesticide:all'

function lsKeys(farmId) {
  return {
    purchase: `citrus:ap:${farmId}:purchase-input`,
    list:     `citrus:ap:${farmId}:list`,
    matches:  `citrus:ap:${farmId}:manual-matches`,
  }
}

// "겔럭시(유)-200ml/올스타/오쏘도" 형식에서 개별 항목 파싱
function parseSegment(seg) {
  const s = seg.trim()
  if (!s) return null
  // 상표명(형태)-용량  /  상표명(형태)  /  상표명
  const m = s.match(/^([^(\-\/]+?)(?:\s*\(([^)]*)\))?(?:\s*[-–]\s*(.+))?$/)
  if (!m) return { brandName: s, form: '', volume: '' }
  return {
    brandName: m[1].trim(),
    form:   (m[2] ?? '').trim(),
    volume: (m[3] ?? '').trim(),
  }
}

// 구입가능농약 텍스트 → 파싱된 항목 배열
export function parsePurchaseText(text) {
  const entries = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const segments = line.split('/')
    for (const seg of segments) {
      const parsed = parseSegment(seg)
      if (parsed?.brandName) entries.push(parsed)
    }
  }
  return entries
}

function normName(name) {
  return name.toLowerCase().replace(/[\s\-()·.]/g, '')
}

function buildEnrichment(matches) {
  if (!matches.length) return null
  const targetPests = [...new Set(
    matches.flatMap(p =>
      p.targetPest.split(/[,、]/).map(t => t.trim()).filter(Boolean),
    ),
  )]
  const first = matches[0]
  return {
    matchSource: 'api',
    category: first.pesticideType || '',
    moa: (first.modeOfAction && first.modeOfAction !== '-') ? first.modeOfAction : '',
    targetPests,
    preHarvestDays: first.preHarvestDays || '',
    maxApplications: first.maxApplications || '',
    ingredient: first.ingredient || '',
    manufacturer: first.manufacturer || '',
    pestiCode: first.pestiCode || '',
    toxicName: getToxicityFromCache(first.pestiCode, first.diseaseUseSeq),
    fishToxic: getFishToxicFromCache(first.pestiCode, first.diseaseUseSeq),
  }
}

function findInCache(brandName, cacheData) {
  if (!cacheData.length) return null
  const q = normName(brandName)
  if (!q) return null
  const exact = cacheData.filter(p => normName(p.brandName) === q)
  if (exact.length) return buildEnrichment(exact)
  // 접두 일치 (짧은 이름이 긴 이름의 시작 부분)
  const partial = cacheData.filter(p => {
    const n = normName(p.brandName)
    return (n.length >= 2 && q.length >= 2) && (n.startsWith(q) || q.startsWith(n))
  })
  if (partial.length) return buildEnrichment(partial)
  return null
}

export const useAvailablePesticideStore = defineStore('availablePesticide', () => {
  const purchaseInput  = ref('')
  const availableList  = ref([])
  const manualMatches  = ref({})  // normName(brandName) → enrichment
  const initialized    = ref(false)
  let activeFarmId = null

  function persistLocal() {
    if (!activeFarmId) return
    try {
      const keys = lsKeys(activeFarmId)
      localStorage.setItem(keys.purchase, purchaseInput.value)
      localStorage.setItem(keys.list, JSON.stringify(availableList.value))
      localStorage.setItem(keys.matches, JSON.stringify(manualMatches.value))
    } catch {}
  }

  let firestoreDebounceTimer = null
  function scheduleFirestoreWrite() {
    if (!firebaseEnabled || !db || !activeFarmId) return
    clearTimeout(firestoreDebounceTimer)
    firestoreDebounceTimer = setTimeout(async () => {
      try {
        const ref = doc(db, 'farms', activeFarmId, 'data', 'availablePesticide')
        await setDoc(ref, {
          purchaseInput: purchaseInput.value,
          availableList: availableList.value,
          manualMatches: manualMatches.value,
        }, { merge: true })
      } catch (e) {
        console.warn('[availablePesticideStore] Firestore write failed, will retry on next change.', e)
      }
    }, 500)
  }

  function persistAll() {
    persistLocal()
    scheduleFirestoreWrite()
  }

  function loadLocal() {
    try {
      const keys = lsKeys(activeFarmId)
      purchaseInput.value = localStorage.getItem(keys.purchase) ?? ''
      const savedList = localStorage.getItem(keys.list)
      if (savedList) availableList.value = JSON.parse(savedList)
      const savedMM = localStorage.getItem(keys.matches)
      if (savedMM) manualMatches.value = JSON.parse(savedMM)
    } catch {}
  }

  function init(farmId) {
    if (initialized.value) return
    initialized.value = true
    activeFarmId = farmId

    if (firebaseEnabled && db) {
      const ref = doc(db, 'farms', activeFarmId, 'data', 'availablePesticide')
      onSnapshot(ref, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          purchaseInput.value = typeof data.purchaseInput === 'string' ? data.purchaseInput : ''
          availableList.value = Array.isArray(data.availableList) ? data.availableList : []
          manualMatches.value = data.manualMatches && typeof data.manualMatches === 'object' ? data.manualMatches : {}
          persistLocal()
        } else {
          loadLocal()
          persistAll()
        }
      })
    } else {
      loadLocal()
    }
  }

  function savePurchaseInput(text) {
    purchaseInput.value = text
    persistAll()
  }

  // 구입가능농약 + 재고농약 → 가용농약 목록 작성
  // 같은 상표명이 구입가능 목록과 재고 목록 양쪽에 있으면 source: 'both'로 표시하여
  // "재고" 필터에서 누락되지 않도록 한다 (첫 등장 소스만 남기던 이전 방식의 버그 수정).
  function buildList(inventoryPesticides = []) {
    const cached = loadCache(FULL_KEY)
    const cacheData = cached?.data ?? []

    const purchaseEntries = parsePurchaseText(purchaseInput.value)

    const purchaseByKey  = new Map()
    for (const e of purchaseEntries) {
      const key = normName(e.brandName)
      if (key && !purchaseByKey.has(key)) purchaseByKey.set(key, e)
    }
    const inventoryByKey = new Map()
    for (const item of inventoryPesticides) {
      const key = normName(item.name)
      if (key && !inventoryByKey.has(key)) inventoryByKey.set(key, item)
    }

    const allKeys = new Set([...purchaseByKey.keys(), ...inventoryByKey.keys()])
    const list = []
    let seq = 0

    for (const key of allKeys) {
      const purchase = purchaseByKey.get(key)
      const invData  = inventoryByKey.get(key)
      let source = 'inventory'
      if (purchase && invData) source = 'both'
      else if (purchase) source = 'purchase'
      const brandName = (purchase?.brandName ?? invData?.name ?? '').trim()
      if (!brandName) continue

      // 우선순위: 수동 연결 > API 자동 > 재고 데이터
      const manual   = manualMatches.value[key]
      const apiMatch = manual ? null : findInCache(brandName, cacheData)
      const invMatch = (!manual && !apiMatch && invData) ? {
        matchSource: 'inventory',
        category: invData.pesticideType || '',
        moa:      invData.actionGroup  || '',
        targetPests: [], preHarvestDays: '', maxApplications: '',
        ingredient: '', manufacturer: '', pestiCode: '', toxicName: '', fishToxic: '',
      } : null

      const enrich = manual || apiMatch || invMatch || {}

      list.push({
        id:             `ap-${++seq}`,
        brandName,
        form:           purchase?.form   ?? '',
        volume:         purchase?.volume ?? '',
        source,
        matchSource:    enrich.matchSource    ?? null,
        category:       enrich.category       ?? '',
        moa:            enrich.moa            ?? '',
        targetPests:    enrich.targetPests    ?? [],
        preHarvestDays: enrich.preHarvestDays ?? '',
        maxApplications: enrich.maxApplications ?? '',
        ingredient:     enrich.ingredient     ?? '',
        manufacturer:   enrich.manufacturer   ?? '',
        pestiCode:      enrich.pestiCode      ?? '',
        toxicName:      enrich.toxicName      ?? '',
        fishToxic:      enrich.fishToxic      ?? '',
      })
    }

    availableList.value = list
    persistAll()
    return list
  }

  function applyManualMatch(itemId, apiItem) {
    const item = availableList.value.find(p => p.id === itemId)
    if (!item) return
    const key = normName(item.brandName)

    // 선택한 농약의 전체 레코드를 캐시에서 조회하여 병해충 통합
    const cached = loadCache(FULL_KEY)
    const cacheData = cached?.data ?? []
    const brandQ = normName(apiItem.brandName)
    const allMatches = cacheData.filter(p => normName(p.brandName) === brandQ)

    const enrich = allMatches.length
      ? { ...buildEnrichment(allMatches), matchSource: 'manual' }
      : {
          matchSource: 'manual',
          category:       apiItem.pesticideType || '',
          moa:            (apiItem.modeOfAction && apiItem.modeOfAction !== '-') ? apiItem.modeOfAction : '',
          targetPests:    apiItem.targetPest ? [apiItem.targetPest] : [],
          preHarvestDays: apiItem.preHarvestDays || '',
          maxApplications: apiItem.maxApplications || '',
          ingredient:     apiItem.ingredient || '',
          manufacturer:   apiItem.manufacturer || '',
          pestiCode:      apiItem.pestiCode || '',
          toxicName:      getToxicityFromCache(apiItem.pestiCode, apiItem.diseaseUseSeq),
          fishToxic:      getFishToxicFromCache(apiItem.pestiCode, apiItem.diseaseUseSeq),
        }

    manualMatches.value = { ...manualMatches.value, [key]: enrich }
    Object.assign(item, enrich)

    persistAll()
  }

  // 목록의 모든 항목을 최신 OpenAPI 캐시 기준으로 다시 매칭한다.
  // 사용자가 직접 '수동 연결'해둔 항목(matchSource: 'manual')은 건드리지 않는다.
  function refreshAllFromCache() {
    const cached = loadCache(FULL_KEY)
    const cacheData = cached?.data ?? []
    let updated = 0

    for (const item of availableList.value) {
      const key = normName(item.brandName)
      if (manualMatches.value[key]) continue

      const apiMatch = findInCache(item.brandName, cacheData)
      if (apiMatch) {
        Object.assign(item, apiMatch)
        updated++
      }
    }

    if (updated > 0) persistAll()
    return updated
  }

  // 사용자가 직접 입력/수정한 정보로 갱신 (미연결 항목의 수동 입력, 또는 기존 연결 정보의 수정)
  function updateManualInfo(itemId, info) {
    const item = availableList.value.find(p => p.id === itemId)
    if (!item) return
    const key = normName(item.brandName)

    const enrich = {
      matchSource:    'manual',
      category:       info.category ?? '',
      moa:            info.moa ?? '',
      targetPests:    Array.isArray(info.targetPests) ? info.targetPests : [],
      preHarvestDays: info.preHarvestDays ?? '',
      maxApplications: info.maxApplications ?? '',
      ingredient:     info.ingredient ?? '',
      manufacturer:   info.manufacturer ?? '',
      pestiCode:      item.pestiCode || '',
      toxicName:      info.toxicName ?? '',
      fishToxic:      info.fishToxic ?? '',
    }

    manualMatches.value = { ...manualMatches.value, [key]: enrich }
    Object.assign(item, enrich)

    persistAll()
  }

  function clearManualMatch(itemId) {
    const item = availableList.value.find(p => p.id === itemId)
    if (!item) return
    const key = normName(item.brandName)
    const { [key]: _removed, ...rest } = manualMatches.value
    manualMatches.value = rest

    // 캐시에서 재매칭
    const cached = loadCache(FULL_KEY)
    const cacheData = cached?.data ?? []
    const apiEnrich = findInCache(item.brandName, cacheData)
    const reset = { matchSource: null, category: '', moa: '', targetPests: [], preHarvestDays: '', maxApplications: '', ingredient: '', manufacturer: '', pestiCode: '', toxicName: '', fishToxic: '' }
    Object.assign(item, apiEnrich || reset)

    persistAll()
  }

  // 가용농약 전체 초기화 — 구입가능농약 입력·목록·수동 연결 정보를 모두 비운다.
  function clearAll() {
    purchaseInput.value = ''
    availableList.value = []
    manualMatches.value = {}
    persistAll()
  }

  function removeFromList(id) {
    availableList.value = availableList.value.filter(p => p.id !== id)
    persistAll()
  }

  function exportData() {
    return {
      purchaseInput: purchaseInput.value,
      manualMatches: manualMatches.value,
      availableList: availableList.value,
    }
  }

  function restoreData(data) {
    if (!data) return
    if (typeof data.purchaseInput === 'string') purchaseInput.value = data.purchaseInput
    if (data.manualMatches && typeof data.manualMatches === 'object') manualMatches.value = data.manualMatches
    if (Array.isArray(data.availableList)) availableList.value = data.availableList
    persistAll()
  }

  return {
    purchaseInput, availableList, manualMatches,
    init, savePurchaseInput, buildList, applyManualMatch, updateManualInfo, clearManualMatch, removeFromList, clearAll,
    refreshAllFromCache, exportData, restoreData,
  }
})
