import { defineStore } from 'pinia'
import { ref } from 'vue'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { loadCache } from '../services/cache.js'
import { db, firebaseEnabled } from '../services/firebase.js'

const LS_PURCHASE = 'citrus:ap:purchase-input'
const LS_LIST     = 'citrus:ap:list'
const LS_MATCHES  = 'citrus:ap:manual-matches'
const FULL_KEY    = 'pesticide:all'

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

  function persistLocal() {
    try {
      localStorage.setItem(LS_PURCHASE, purchaseInput.value)
      localStorage.setItem(LS_LIST, JSON.stringify(availableList.value))
      localStorage.setItem(LS_MATCHES, JSON.stringify(manualMatches.value))
    } catch {}
  }

  let firestoreDebounceTimer = null
  function scheduleFirestoreWrite() {
    if (!firebaseEnabled || !db) return
    clearTimeout(firestoreDebounceTimer)
    firestoreDebounceTimer = setTimeout(async () => {
      try {
        const ref = doc(db, 'shared', 'availablePesticide')
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
      purchaseInput.value = localStorage.getItem(LS_PURCHASE) ?? ''
      const savedList = localStorage.getItem(LS_LIST)
      if (savedList) availableList.value = JSON.parse(savedList)
      const savedMM = localStorage.getItem(LS_MATCHES)
      if (savedMM) manualMatches.value = JSON.parse(savedMM)
    } catch {}
  }

  function init() {
    if (initialized.value) return
    initialized.value = true

    if (firebaseEnabled && db) {
      const ref = doc(db, 'shared', 'availablePesticide')
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
  function buildList(inventoryPesticides = []) {
    const cached = loadCache(FULL_KEY)
    const cacheData = cached?.data ?? []

    const purchaseEntries = parsePurchaseText(purchaseInput.value)

    const seen = new Set()
    const list = []
    let seq = 0

    function addItem(brandName, form, volume, source, invData = null) {
      if (!brandName.trim()) return
      const key = normName(brandName)
      if (seen.has(key)) return
      seen.add(key)

      // 우선순위: 수동 연결 > API 자동 > 재고 데이터
      const manual   = manualMatches.value[key]
      const apiMatch = manual ? null : findInCache(brandName, cacheData)
      const invMatch = (!manual && !apiMatch && invData) ? {
        matchSource: 'inventory',
        category: invData.pesticideType || '',
        moa:      invData.actionGroup  || '',
        targetPests: [], preHarvestDays: '', maxApplications: '',
        ingredient: '', manufacturer: '', pestiCode: '',
      } : null

      const enrich = manual || apiMatch || invMatch || {}

      list.push({
        id:             `ap-${++seq}`,
        brandName:      brandName.trim(),
        form,
        volume,
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
      })
    }

    for (const e of purchaseEntries) addItem(e.brandName, e.form, e.volume, 'purchase')
    for (const item of inventoryPesticides) addItem(item.name, '', '', 'inventory', item)

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
    const reset = { matchSource: null, category: '', moa: '', targetPests: [], preHarvestDays: '', maxApplications: '', ingredient: '', manufacturer: '', pestiCode: '' }
    Object.assign(item, apiEnrich || reset)

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
    init, savePurchaseInput, buildList, applyManualMatch, clearManualMatch, removeFromList,
    exportData, restoreData,
  }
})
