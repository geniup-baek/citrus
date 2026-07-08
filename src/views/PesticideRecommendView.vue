<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useTreatmentStore } from '../stores/treatmentStore.js'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore.js'
import { useFarmStore } from '../stores/farmStore.js'
import { useAvailablePesticideStore, parsePurchaseText } from '../stores/availablePesticideStore.js'
import { getRecommendations, moaColor } from '../services/recommend.js'
import { searchFromFullCache, findBestMatchInCache, formatPreHarvest, formatMaxApplications, TOXIC_GRADES, FISH_TOXIC_GRADES, FISH_TOXIC_INFO, formatFishToxic, formatFishToxicBadge } from '../services/pesticide.js'
import PesticideInventoryPanel from '../components/PesticideInventoryPanel.vue'
import { usePesticideTypes } from '../composables/usePesticideTypes.js'
import { useIsMobile } from '../composables/useIsMobile.js'
import { useLocaleStore } from '../stores/localeStore'
import { confirm } from '../composables/useConfirm'

const treatStore    = useTreatmentStore()
const settingsStore = useRecommendSettingsStore()
const farmStore     = useFarmStore()
const apStore       = useAvailablePesticideStore()
const localeStore   = useLocaleStore()

const activeTab = ref('history')

// ── 오늘 날짜 (YYYY-MM-DD) ─────────────────────────────────────────────────
function today() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── 방제 이력 Tab ──────────────────────────────────────────────────────────
const fDate     = ref(today())
const fBrand    = ref('')
const fMoa      = ref('')
const fCategory = ref('')
const fPest     = ref('')
const fMemo     = ref('')
const fMatchSource = ref(null) // 'auto' | null — OpenAPI 자동 연결로 채워졌는지
const formError = ref('')
const saving    = ref(false)
const { isMobile } = useIsMobile()

const showHistoryForm = ref(false)
const editingId     = ref(null)

const histFormTarget = computed(() =>
  editingId.value && treatStore.treatments.some(t => t.id === editingId.value)
    ? `#hist-form-slot-${editingId.value}`
    : '#hist-form-top'
)

// ── 방제이력 연도별 필터 ────────────────────────────────────────────────────
const histYear = ref('')

const histYears = computed(() =>
  [...new Set(treatStore.treatments.map(t => t.date?.slice(0, 4)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a)),
)

const filteredTreatments = computed(() =>
  histYear.value
    ? treatStore.treatments.filter(t => t.date?.startsWith(histYear.value))
    : treatStore.treatments,
)

const formMode = ref('single') // 'single' | 'bulk'

function resetForm() {
  editingId.value = null
  formMode.value  = 'single'
  fDate.value     = today()
  fBrand.value    = ''
  fMoa.value      = ''
  fCategory.value = ''
  fPest.value     = ''
  fMemo.value     = ''
  fMatchSource.value = null
  formError.value = ''
  histLinkId.value      = null
  histLinkQuery.value   = ''
  histLinkResults.value = []
  bulkPasteText.value    = ''
  bulkImportMessage.value = ''
}

function startEdit(t) {
  showHistoryForm.value = true
  editingId.value       = t.id
  formMode.value        = 'single'
  fDate.value           = t.date
  fBrand.value          = t.brandName
  fMoa.value            = t.moa       ?? ''
  fCategory.value       = t.category  ?? ''
  fPest.value           = t.targetPest ?? ''
  fMemo.value           = t.memo       ?? ''
  fMatchSource.value    = t.matchSource ?? null
  formError.value       = ''
  histLinkId.value      = null
  if (isMobile.value) {
    nextTick(() => {
      const el = document.getElementById(`hist-form-slot-${t.id}`)
      ;(el?.closest('li') ?? el)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

async function submitTreatment() {
  formError.value = ''
  if (!fDate.value)  { formError.value = '날짜를 입력하세요.'; return }
  if (!fBrand.value) { formError.value = '농약을 선택하세요.'; return }
  saving.value = true
  const record = {
    date:        fDate.value,
    brandName:   fBrand.value,
    moa:         fMoa.value,
    category:    fCategory.value,
    targetPest:  fPest.value.trim(),
    memo:        fMemo.value.trim(),
    matchSource: fMatchSource.value,
  }
  try {
    if (editingId.value) {
      await treatStore.updateTreatment(editingId.value, record)
    } else {
      await treatStore.addTreatment(record)
    }
    resetForm()
  } catch (e) {
    formError.value = e.message
  } finally {
    saving.value = false
  }
}

async function confirmDeleteTreatment(t) {
  const ok = await confirm({ message: localeStore.t('confirm.treatment', { date: formatDate(t.date), brandName: t.brandName }) })
  if (!ok) return
  if (editingId.value === t.id) resetForm()
  await treatStore.deleteTreatment(t.id)
}

function newHistoryEntry() {
  resetForm()
  if (isMobile.value) {
    nextTick(() => document.getElementById('hist-form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

// ── 방제이력 농약정보 연결 (폼) ────────────────────────────────────────────────
const formLinkResults = ref([])

function onFormBrandInput(val) {
  fMatchSource.value = null // 직접 입력 중이므로 자동 연결 표시 해제
  const q = val.trim()
  if (!q) { formLinkResults.value = []; return }
  const result = searchFromFullCache({ pestName: q, page: 1, pageSize: 10 })
  formLinkResults.value = result?.list ?? []
}

function applyFormLink(apiItem) {
  fBrand.value = apiItem.brandName
  if (apiItem.pesticideType)                                 fCategory.value = normCat(apiItem.pesticideType)
  if (apiItem.modeOfAction && apiItem.modeOfAction !== '-')  fMoa.value      = apiItem.modeOfAction
  fMatchSource.value = 'auto'
  formLinkResults.value = []
}

// ── 방제이력 농약정보 연결 (목록 항목) ─────────────────────────────────────────
const histLinkId      = ref(null)
const histLinkQuery   = ref('')
const histLinkResults = ref([])

function openHistLink(id) {
  if (histLinkId.value === id) {
    histLinkId.value      = null
    histLinkQuery.value   = ''
    histLinkResults.value = []
    return
  }
  histLinkId.value      = id
  histLinkQuery.value   = ''
  histLinkResults.value = []
}

function searchHistLinkCandidates(query) {
  if (!query.trim()) { histLinkResults.value = []; return }
  const result = searchFromFullCache({ pestName: query.trim(), page: 1, pageSize: 12 })
  histLinkResults.value = result?.list ?? []
}

async function applyHistLink(treatment, apiItem) {
  const moa      = (apiItem.modeOfAction && apiItem.modeOfAction !== '-') ? apiItem.modeOfAction : (treatment.moa || '')
  const category = normCat(apiItem.pesticideType) || treatment.category || ''
  await treatStore.updateTreatment(treatment.id, {
    date:        treatment.date,
    brandName:   apiItem.brandName || treatment.brandName,
    moa,
    category,
    targetPest:  treatment.targetPest || '',
    memo:        treatment.memo || '',
    matchSource: 'auto',
  })
  histLinkId.value      = null
  histLinkQuery.value   = ''
  histLinkResults.value = []
}

const histRefreshMessage = ref('')

// 아직 농약정보가 연결되지 않은(작용기작이 비어있는) 이력만 브랜드명 기준으로 일괄 연결한다.
// 설정에서 켜면 이미 연결된 이력도 다시 연결(덮어쓰기)한다.
async function refreshAllTreatmentLinks() {
  const overwrite = settingsStore.settings.overwriteLinkedTreatments
  let updated = 0
  for (const t of treatStore.treatments) {
    if (t.moa && !overwrite) continue
    const match = findBestMatchInCache(t.brandName)
    if (!match) continue
    const moa = (match.modeOfAction && match.modeOfAction !== '-') ? match.modeOfAction : ''
    const category = normCat(match.pesticideType) || ''
    if (!moa && !category) continue
    await treatStore.updateTreatment(t.id, {
      date:        t.date,
      brandName:   t.brandName,
      moa,
      category,
      targetPest:  t.targetPest || '',
      memo:        t.memo || '',
      matchSource: 'auto',
    })
    updated++
  }
  histRefreshMessage.value = updated > 0 ? `${updated}건 정보를 연결했습니다.` : '연결할 항목이 없습니다 (이미 연결된 이력 제외).'
}

// ── 방제이력 붙여넣기 일괄추가 ─────────────────────────────────────────────────
// 스프레드시트에서 복사한 "날짜(YYYYMMDD)\t농약명\t비고" 형식 탭 구분 텍스트를 파싱한다.
const bulkPasteText = ref('')
const bulkImporting = ref(false)
const bulkImportMessage = ref('')

function parseBulkDate(raw) {
  const s = raw.trim()
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  const dashed = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return dashed ? s : null
}

function parseBulkTreatmentText(text) {
  const rows = []
  for (const line of text.split('\n')) {
    const cols = line.replace(/\r$/, '').split('\t')
    const date = parseBulkDate(cols[0] || '')
    const nameRaw = (cols[1] || '').trim()
    const memo = (cols[2] || '').trim()
    if (!date || !nameRaw) continue
    rows.push({ date, nameRaw, memo })
  }
  return rows
}

const bulkParsedRows = computed(() => parseBulkTreatmentText(bulkPasteText.value))

// 농약명 뒤에 붙은 설명을 분리한다.
// 1) 괄호 표기: "크레모아(보, 어3)" → 크레모아 / 보, 어3
// 2) 캐시에 등록된 상표명이 접두어로 일치: "수퍼펀치 인축3급보통, 어독성1급" → 수퍼펀치 / 인축3급보통, 어독성1급
// 어느 쪽도 아니면 전체를 그대로 상표명으로 둔다.
function splitBulkTreatmentName(raw) {
  const parenMatch = raw.match(/^(.+?)\s*\(([^)]*)\)\s*$/)
  if (parenMatch) {
    return { brand: parenMatch[1].trim(), extra: parenMatch[2].trim() }
  }
  const match = findBestMatchInCache(raw)
  if (match?.brandName && raw.startsWith(match.brandName) && raw.length > match.brandName.length) {
    const extra = raw.slice(match.brandName.length).trim().replace(/^,\s*/, '')
    return { brand: match.brandName, extra }
  }
  return { brand: raw, extra: '' }
}

function buildBulkTreatmentRecord(row) {
  const { brand } = splitBulkTreatmentName(row.nameRaw)
  const match = findBestMatchInCache(brand)
  const moa = (match?.modeOfAction && match.modeOfAction !== '-') ? match.modeOfAction : ''
  const category = match ? (normCat(match.pesticideType) || '') : ''
  return {
    date:        row.date,
    brandName:   match?.brandName || brand,
    moa,
    category,
    targetPest:  '',
    memo:        row.memo.trim(),
    matchSource: match ? 'auto' : null,
  }
}

async function importBulkTreatments() {
  const rows = bulkParsedRows.value
  if (!rows.length) return
  bulkImporting.value = true
  bulkImportMessage.value = ''
  try {
    const records = rows.map(buildBulkTreatmentRecord)
    const matched = records.filter((r) => r.matchSource === 'auto').length
    if (settingsStore.settings.bulkImportMode === 'replace') {
      await treatStore.replaceAllTreatments(records)
      bulkImportMessage.value = `전체 새로 작성됨: ${rows.length}건 (자동 연결 ${matched}건)`
    } else {
      for (const record of records) {
        await treatStore.addTreatment(record)
      }
      bulkImportMessage.value = `${rows.length}건 추가됨 (자동 연결 ${matched}건)`
    }
    bulkPasteText.value = ''
  } finally {
    bulkImporting.value = false
  }
}

function formatDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

// ── 농약 추천 Tab ──────────────────────────────────────────────────────────
const recPest        = ref('')
const recDate        = ref(today())
const recHarvestDate = ref('')
const recResult      = ref(null)

const recPests = computed(() => {
  const set = new Set()
  for (const p of apStore.availableList) {
    for (const pest of p.targetPests) {
      set.add(pest.replace(/\(.*?\)/g, '').trim())
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
})

const recConstraintHint = computed(() => {
  const s = settingsStore.settings
  const parts = [`${s.moaConflictDays}일 이내 작용기작 중복 제외`]
  if (s.enforceMaxApplications) {
    parts.push(
      s.preferPesticideMaxApplications
        ? `연간 최대 사용 횟수 제한(농약별 등록정보 우선, 기본 ${s.maxApplicationsPerYear}회)`
        : `연간 최대 ${s.maxApplicationsPerYear}회 사용 제한`,
    )
  }
  if (recHarvestDate.value) parts.push('수확 전 안전기간(PHI) 확인')
  if (s.excludeToxicGrades.length) parts.push(`독성등급 제외(${s.excludeToxicGrades.join('/')})`)
  if (s.excludeFishToxicGrades.length) parts.push(`어독성 제외(${s.excludeFishToxicGrades.map(formatFishToxic).join('/')})`)
  parts.push('방제 예정일 기준')
  return parts.join(' · ')
})

function runRecommend() {
  if (!recPest.value.trim()) { recResult.value = null; return }
  recResult.value = getRecommendations({
    targetPest:  recPest.value.trim(),
    treatments:  treatStore.treatments,
    settings:    settingsStore.settings,
    today:       recDate.value || today(),
    harvestDate: recHarvestDate.value || '',
    pesticides:  apStore.availableList,
  })
}

// 이력이 바뀌면 추천 결과도 갱신
watch(() => treatStore.treatments.length, () => {
  if (recResult.value) runRecommend()
})

function hasStock(brandName) {
  return (inventoryStockMap.value[brandName]?.length ?? 0) > 0
}

const sortedRecommended = computed(() =>
  recResult.value
    ? [...recResult.value.recommended].sort((a, b) => hasStock(b.brandName) - hasStock(a.brandName))
    : [],
)

const sortedExcluded = computed(() =>
  recResult.value
    ? [...recResult.value.excluded].sort((a, b) => hasStock(b.brandName) - hasStock(a.brandName))
    : [],
)

// ── computed helpers ───────────────────────────────────────────────────────
const { resolveType: normCat, typeNames: pesticideTypes } = usePesticideTypes()

const categoryClass = (cat) => ({
  '살균제': 'cat-fungicide',
  '살비제': 'cat-miticide',
  '살충제': 'cat-insecticide',
}[cat] ?? '')

const categoryClassFor = (cat) => categoryClass(normCat(cat))

const toxicClass = (grade) => ({
  '저독성': 'toxic-low',
  '보통독성': 'toxic-mid',
  '고독성': 'toxic-high',
  '맹독성': 'toxic-extreme',
}[grade] ?? '')

const fishToxicClass = (grade) => ({
  'Ⅰ급': 'fishtoxic-1',
  'Ⅱ급': 'fishtoxic-2',
  'Ⅲ급': 'fishtoxic-3',
}[grade] ?? '')

const showFishToxicInfo = ref(false)

// ── 가용농약 Tab ───────────────────────────────────────────────────────────
const apInputText    = ref('')
const apFilter        = ref('')
const apSourceFilter  = ref('all')   // 'all' | 'purchase' | 'inventory'
const apUnmatchedOnly = ref(false)
const apManualOnly   = ref(false)
const apEditMode     = ref(false)
const matchingItemId = ref(null)   // 수동 연결 패널이 열린 아이템 id
const matchQuery     = ref('')
const matchResults   = ref([])
const apBuilding     = ref(false)
const manualEditId   = ref(null)   // 직접 입력/수정 패널이 열린 아이템 id
const manualEditForm = ref({
  category: '', moa: '', targetPests: '',
  preHarvestDays: '', maxApplications: '', ingredient: '', manufacturer: '', toxicName: '', fishToxic: '',
})
const apRefreshMessage = ref('')

const manualEditItem = computed(() =>
  manualEditId.value ? apStore.availableList.find(p => p.id === manualEditId.value) ?? null : null,
)
const apFormTarget = computed(() =>
  manualEditId.value && filteredApList.value.some(p => p.id === manualEditId.value)
    ? `#ap-form-slot-${manualEditId.value}`
    : '#ap-form-top',
)

const apFormMode = ref('single') // 'single' | 'bulk'

function closeApEdit() {
  apEditMode.value     = false
  matchingItemId.value = null
  matchQuery.value     = ''
  matchResults.value   = []
  manualEditId.value   = null
  apFormMode.value     = 'single'
  apRefreshMessage.value = ''
  newApBrand.value       = ''
  newApForm.value        = ''
  newApVolume.value      = ''
  newApLinkResults.value = []
  newApMessage.value     = ''
  apBulkAppendText.value = ''
}

function refreshAllPesticideInfo() {
  const updated = apStore.refreshAllFromCache()
  apRefreshMessage.value = updated > 0 ? `${updated}개 항목 정보를 갱신했습니다.` : '갱신할 항목이 없습니다 (수동 연결 항목 제외).'
}

const inventoryPesticides = computed(() =>
  (farmStore.state?.inventory ?? []).filter(i => i.category === '농약'),
)

function fmtExpiry(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `~${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function stockLotLabel(lot) {
  return [lot.vol === '기본' ? '' : lot.vol, lot.expiry ? fmtExpiry(lot.expiry) : '', `${lot.qty}개`]
    .filter(Boolean).join(' ')
}

// 재고 수량 맵: item.name → [{vol, expiry, qty}] (lot별 재고 > 0인 것만)
const inventoryStockMap = computed(() => {
  const map = {}
  for (const item of inventoryPesticides.value) {
    const byLot = {}
    for (const t of item.txns ?? []) {
      const key = `${t.volume || '기본'}__${t.expiryDate || ''}`
      byLot[key] = (byLot[key] ?? 0) + (t.type === '입고' ? t.amount : -t.amount)
    }
    const lots = Object.entries(byLot)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => { const [vol, expiry] = key.split('__'); return { vol, expiry, qty } })
    if (lots.length) map[item.name] = lots
  }
  return map
})

const parsedCount = computed(() => parsePurchaseText(apInputText.value).length)

const apStats = computed(() => {
  const total   = apStore.availableList.length
  const matched = apStore.availableList.filter(p => p.matchSource).length
  const manual  = apStore.availableList.filter(p => p.matchSource === 'manual').length
  return { total, matched, unmatched: total - matched, manual }
})

// '재고'는 재고에 실제로 있는 항목 전체(구입가능 목록과 겹치는 'both' 포함),
// '구입가능'은 구입 가능한 항목 전체('both' 포함) — 둘은 서로 배타적이지 않다.
const apSourceCounts = computed(() => ({
  purchase: apStore.availableList.filter(p => p.source === 'purchase' || p.source === 'both').length,
  inventory: apStore.availableList.filter(p => p.source === 'inventory' || p.source === 'both').length,
}))

const filteredApList = computed(() => {
  let list = apStore.availableList
  if (apSourceFilter.value === 'purchase') list = list.filter(p => p.source === 'purchase' || p.source === 'both')
  else if (apSourceFilter.value === 'inventory') list = list.filter(p => p.source === 'inventory' || p.source === 'both')
  if (apUnmatchedOnly.value) list = list.filter(p => !p.matchSource)
  if (apManualOnly.value) list = list.filter(p => p.matchSource === 'manual')
  const q = apFilter.value.trim().toLowerCase()
  if (q) list = list.filter(p =>
    p.brandName.toLowerCase().includes(q) ||
    normCat(p.category).includes(q) ||
    p.moa.toLowerCase().includes(q) ||
    p.targetPests.some(t => t.toLowerCase().includes(q)),
  )
  return [...list].sort((a, b) => a.brandName.localeCompare(b.brandName, 'ko'))
})

function matchLabel(src) {
  if (src === 'api')       return '자동'
  if (src === 'manual')    return '수동'
  if (src === 'inventory') return '재고'
  return '미연결'
}

async function buildApList() {
  apStore.savePurchaseInput(apInputText.value)
  apBuilding.value = true
  try { apStore.buildList(inventoryPesticides.value) }
  finally { apBuilding.value = false }
}

// 붙여넣기 일괄추가(설정 > 동작 > 붙여넣기 일괄추가 방식): 'append'는 새로 입력한 내용만
// 기존 구입가능농약 텍스트에 더하고, 'replace'는 텍스트 전체를 붙여넣은 내용으로 대체한다(기존 동작).
const apBulkIsAppend    = computed(() => settingsStore.settings.bulkImportMode === 'append')
const apBulkAppendText  = ref('')
const apBulkAppendCount = computed(() => parsePurchaseText(apBulkAppendText.value).length)
const apBulkCurrentCount = computed(() => apBulkIsAppend.value ? apBulkAppendCount.value : parsedCount.value)

async function buildApListAppend() {
  const merged = [apStore.purchaseInput.trim(), apBulkAppendText.value.trim()].filter(Boolean).join('\n')
  apBuilding.value = true
  try {
    apStore.savePurchaseInput(merged)
    apStore.buildList(inventoryPesticides.value)
  } finally {
    apBuilding.value = false
  }
  apBulkAppendText.value = ''
}

async function submitApBulk() {
  if (apBulkIsAppend.value) await buildApListAppend()
  else await buildApList()
}

// ── 가용농약 새 항목 단일 추가 (구입가능농약 입력 텍스트에 한 줄 추가 후 재작성) ──────
const newApBrand       = ref('')
const newApForm        = ref('')
const newApVolume      = ref('')
const newApLinkResults = ref([])
const newApMessage     = ref('')

function onNewApBrandInput(val) {
  newApMessage.value = ''
  const q = val.trim()
  if (!q) { newApLinkResults.value = []; return }
  const result = searchFromFullCache({ pestName: q, page: 1, pageSize: 10 })
  newApLinkResults.value = result?.list ?? []
}

function applyNewApLink(apiItem) {
  newApBrand.value = apiItem.brandName
  newApLinkResults.value = []
}

async function submitNewApItem() {
  const brand = newApBrand.value.trim()
  if (!brand) return
  const formPart = newApForm.value.trim()
  const volPart   = newApVolume.value.trim()
  const formSuffix = formPart ? `(${formPart})` : ''
  const volSuffix   = volPart ? `-${volPart}` : ''
  const segment = `${brand}${formSuffix}${volSuffix}`
  const existing = apInputText.value.trim()
  apInputText.value = existing ? `${existing}\n${segment}` : segment
  await buildApList()
  newApMessage.value = `"${brand}" 추가됨`
  newApBrand.value  = ''
  newApForm.value   = ''
  newApVolume.value = ''
  newApLinkResults.value = []
}

function openManualMatch(itemId) {
  manualEditId.value = null
  if (matchingItemId.value === itemId) {
    matchingItemId.value = null
    matchQuery.value = ''
    matchResults.value = []
    return
  }
  matchingItemId.value = itemId
  matchQuery.value = ''
  matchResults.value = []
}

function searchApiCandidates(query) {
  if (!query.trim()) { matchResults.value = []; return }
  const result = searchFromFullCache({ pestName: query.trim(), page: 1, pageSize: 12 })
  matchResults.value = result?.list ?? []
}

function applyMatch(itemId, apiItem) {
  apStore.applyManualMatch(itemId, apiItem)
  matchingItemId.value = null
  matchQuery.value = ''
  matchResults.value = []
}

async function confirmDeleteAp(item) {
  const ok = await confirm({ message: localeStore.t('confirm.availablePesticide', { brandName: item.brandName }) })
  if (!ok) return
  apStore.removeFromList(item.id)
}

function openManualEdit(item) {
  matchingItemId.value = null
  matchQuery.value = ''
  matchResults.value = []
  if (manualEditId.value === item.id) {
    manualEditId.value = null
    return
  }
  manualEditId.value = item.id
  manualEditForm.value = {
    category:        item.category || '',
    moa:             item.moa || '',
    targetPests:     (item.targetPests || []).join(', '),
    preHarvestDays:  item.preHarvestDays || '',
    maxApplications: item.maxApplications || '',
    ingredient:      item.ingredient || '',
    manufacturer:    item.manufacturer || '',
    toxicName:       item.toxicName || '',
    fishToxic:       item.fishToxic || '',
  }
}

function saveManualEdit(item) {
  const f = manualEditForm.value
  apStore.updateManualInfo(item.id, {
    category:        f.category.trim(),
    moa:             f.moa.trim(),
    targetPests:     f.targetPests.split(',').map(s => s.trim()).filter(Boolean),
    preHarvestDays:  f.preHarvestDays.trim(),
    maxApplications: f.maxApplications.trim(),
    ingredient:      f.ingredient.trim(),
    manufacturer:    f.manufacturer.trim(),
    toxicName:       f.toxicName,
    fishToxic:       f.fishToxic,
  })
  manualEditId.value = null
}

// apStore.init()은 App.vue에서 전역으로 한 번 호출되며, Firestore 동기화 시점에 따라
// purchaseInput이 마운트 이후에 채워질 수 있으므로 값을 반응형으로 동기화한다.
watch(() => apStore.purchaseInput, (v) => { apInputText.value = v }, { immediate: true })
</script>

<template>
  <div class="card recommend-view">
    <div class="view-header">
      <h2>방제 관리</h2>
      <p class="subtitle">방제 이력 기록부터 농약재고·가용농약 관리, 작용기작 중복 방지 추천까지 한 곳에서 관리합니다.</p>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'history' }"   @click="activeTab = 'history'">방제 이력</button>
      <button class="tab-btn" :class="{ active: activeTab === 'peststock' }" @click="activeTab = 'peststock'">농약재고</button>
      <button class="tab-btn" :class="{ active: activeTab === 'avail' }"     @click="activeTab = 'avail'">가용농약</button>
      <button class="tab-btn" :class="{ active: activeTab === 'settings' }"  @click="activeTab = 'settings'">추천 설정</button>
      <button class="tab-btn" :class="{ active: activeTab === 'recommend' }" @click="activeTab = 'recommend'">농약 추천</button>
    </div>

    <!-- ═══ 방제 이력 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'history'">
      <div :class="['page-grid', showHistoryForm ? 'two-columns' : '']">

        <!-- 목록 -->
        <article class="card">
          <div class="pip-header">
            <div class="pip-summary">
              <span v-if="filteredTreatments.length" class="summary-chip">{{ filteredTreatments.length }}건</span>
            </div>
            <div class="pip-actions">
              <button v-if="showHistoryForm && treatStore.treatments.length > 0" class="ghost" type="button" @click="refreshAllTreatmentLinks">
                전체 재연결 ({{ settingsStore.settings.overwriteLinkedTreatments ? '기존 연결도 덮어쓰기' : '미연결만' }})
              </button>
              <button v-if="!showHistoryForm" type="button" @click="showHistoryForm = true">편집</button>
              <button v-else class="ghost" type="button" @click="resetForm(); showHistoryForm = false; histRefreshMessage = ''">편집종료</button>
            </div>
          </div>
          <p v-if="histRefreshMessage" class="muted" style="font-size:0.82rem; margin: -0.4rem 0 0.6rem;">{{ histRefreshMessage }}</p>
          <div v-if="histYears.length" class="sort-filter-bar">
            <button
              class="ghost compact-btn"
              :class="{ 'hist-year-active': histYear === '' }"
              type="button"
              @click="histYear = ''"
            >전체</button>
            <button
              v-for="y in histYears"
              :key="y"
              class="ghost compact-btn"
              :class="{ 'hist-year-active': histYear === y }"
              type="button"
              @click="histYear = y"
            >{{ y }}년</button>
          </div>
          <div id="hist-form-top" class="mobile-form-slot"></div>
          <div v-if="treatStore.treatments.length === 0" class="empty-msg">
            {{ showHistoryForm ? '저장하면 목록에 표시됩니다.' : '기록된 방제 이력이 없습니다.' }}
          </div>
          <div v-else-if="filteredTreatments.length === 0" class="empty-msg">
            {{ histYear }}년 방제 이력이 없습니다.
          </div>
          <ul v-else class="list clean">
            <template v-for="(t, i) in filteredTreatments" :key="t.id">
              <li v-if="i === 0 || t.date !== filteredTreatments[i - 1].date" class="hist-date-divider">
                <span>{{ formatDate(t.date) }}</span>
              </li>
              <li class="list-item card-like">
                <div>
                  <div class="task-card-top">
                    <p class="item-title">{{ t.brandName }}</p>
                    <span v-if="t.category" class="cat-badge" :class="categoryClass(t.category)">{{ t.category }}</span>
                    <span v-if="t.moa" class="moa-badge" :style="{ background: moaColor(t.moa) }">{{ t.moa }}</span>
                    <span v-if="t.matchSource === 'auto'" class="match-badge match-ok">자동</span>
                  </div>
                  <p v-if="t.targetPest || t.memo" class="item-meta">
                    <span v-if="t.targetPest">{{ t.targetPest }}</span>
                    <span v-if="t.targetPest && t.memo"> · </span>
                    <span v-if="t.memo" class="muted">{{ t.memo }}</span>
                  </p>
                </div>
                <div class="row-actions">
                  <template v-if="showHistoryForm">
                    <button
                      class="ghost"
                      :class="{ 'link-btn-active': histLinkId === t.id }"
                      type="button"
                      @click="openHistLink(t.id)"
                    >{{ t.moa ? '정보 재연결' : '농약정보 연결' }}</button>
                    <button :class="{ ghost: editingId !== t.id }" type="button" @click="editingId === t.id ? resetForm() : startEdit(t)">편집</button>
                    <button class="danger" type="button" @click="confirmDeleteTreatment(t)">삭제</button>
                  </template>
                </div>
                <!-- 농약정보 연결 패널 -->
                <div v-if="histLinkId === t.id" class="link-panel">
                  <input
                    v-model="histLinkQuery"
                    type="text"
                    class="link-search-input"
                    placeholder="농약명 검색 (공공데이터)"
                    @input="searchHistLinkCandidates(histLinkQuery)"
                  />
                  <div v-if="histLinkResults.length" class="link-results">
                    <div
                      v-for="r in histLinkResults"
                      :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                      class="link-result-item"
                      @click="applyHistLink(t, r)"
                    >
                      <span class="link-result-brand">{{ r.brandName }}</span>
                      <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(normCat(r.pesticideType))">{{ normCat(r.pesticideType) }}</span>
                      <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                      <span class="link-result-pest">{{ r.targetPest }}</span>
                    </div>
                  </div>
                  <p v-else-if="histLinkQuery.trim().length > 1" class="muted" style="font-size:0.82rem; padding:0.4rem 0.65rem;">
                    검색 결과 없음 — 공공데이터 농약정보를 먼저 가져와야 합니다.
                  </p>
                </div>
                <div :id="`hist-form-slot-${t.id}`" class="mobile-form-slot"></div>
              </li>
            </template>
          </ul>
        </article>

        <!-- 폼 -->
        <Teleport v-if="showHistoryForm" :to="histFormTarget" :disabled="!isMobile">
        <article v-if="showHistoryForm" class="card">
          <div v-if="!editingId" class="inline-filters" style="margin-bottom: 1rem;">
            <button :class="{ ghost: formMode !== 'single' }" type="button" @click="formMode = 'single'">새 기록</button>
            <button :class="{ ghost: formMode !== 'bulk' }" type="button" @click="formMode = 'bulk'">붙여넣기 일괄추가</button>
          </div>

          <template v-if="formMode === 'bulk' && !editingId">
            <h2>붙여넣기로 일괄 추가</h2>
            <p class="ap-hint">
              <code>날짜(YYYYMMDD)</code>, <code>농약명</code>, <code>비고</code> 열을 탭으로 구분해 붙여넣으세요 (스프레드시트에서 복사).<br>
              농약명 뒤에 붙은 설명(괄호 또는 등록된 상표명 뒤 텍스트)은 버려지고 비고 열 내용만 사용됩니다.<br>
              현재 설정: <strong>{{ settingsStore.settings.bulkImportMode === 'replace' ? '전체 새로 작성' : '기존 목록에 추가' }}</strong>
              <span v-if="settingsStore.settings.bulkImportMode === 'replace'" class="muted">(붙여넣는 내용으로 방제이력 전체를 대체합니다 — 설정페이지에서 변경 가능)</span>
              <span v-else class="muted">(설정페이지에서 변경 가능)</span>
            </p>
            <textarea
              v-model="bulkPasteText"
              class="ap-textarea"
              rows="8"
              placeholder="20240414	크레모아	손방제"
            ></textarea>
            <div class="ap-input-footer">
              <span v-if="bulkParsedRows.length > 0" class="ap-parse-count">{{ bulkParsedRows.length }}개 항목 인식됨</span>
              <span v-else class="ap-parse-count muted">입력 없음</span>
            </div>
            <div class="row-actions">
              <button type="button" :disabled="bulkImporting || !bulkParsedRows.length" @click="importBulkTreatments">
                {{ bulkImporting ? '처리 중...' : (settingsStore.settings.bulkImportMode === 'replace' ? '전체 새로 작성' : '일괄 추가') }}
              </button>
            </div>
            <p v-if="bulkImportMessage" class="muted" style="font-size:0.82rem; margin-top:0.5rem;">{{ bulkImportMessage }}</p>
          </template>

          <template v-else>
          <h2>{{ editingId ? '이력 편집' : '새 기록' }}</h2>
          <form class="stack-form" @submit.prevent="submitTreatment">
            <label>날짜
              <input type="date" v-model="fDate" required />
            </label>
            <label>농약
              <input
                v-model="fBrand"
                placeholder="상표명 입력 (공공데이터 검색)"
                autocomplete="off"
                @input="onFormBrandInput($event.target.value)"
              />
            </label>
            <div v-if="formLinkResults.length" class="inv-api-panel">
              <div
                v-for="r in formLinkResults"
                :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                class="inv-api-item"
                @mousedown.prevent="applyFormLink(r)"
              >
                <span class="inv-api-brand">{{ r.brandName }}</span>
                <span v-if="r.pesticideType" class="cat-badge" :class="categoryClass(normCat(r.pesticideType))">{{ normCat(r.pesticideType) }}</span>
                <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                <span class="inv-api-pest">{{ r.targetPest }}</span>
              </div>
            </div>
            <div v-if="fMoa" class="hist-form-info">
              <span class="moa-badge" :style="{ background: moaColor(fMoa) }">{{ fMoa }}</span>
              <span class="cat-badge" :class="categoryClass(fCategory)">{{ fCategory }}</span>
            </div>
            <label>방제 대상
              <input v-model="fPest" list="pest-list" placeholder="예: 귤굴나방" autocomplete="off" />
              <datalist id="pest-list">
                <option v-for="p in recPests" :key="p" :value="p" />
              </datalist>
            </label>
            <label>메모
              <input v-model="fMemo" placeholder="희석배수, 날씨, 구역 등 (선택)" />
            </label>
            <p v-if="formError" class="form-error">{{ formError }}</p>
            <div class="row-actions">
              <button type="submit" :disabled="saving">
                {{ saving ? '저장 중...' : (editingId ? '저장' : '기록 추가') }}
              </button>
              <button v-if="editingId" class="ghost" type="button" @click="newHistoryEntry">새 기록</button>
            </div>
          </form>
          </template>
        </article>
        </Teleport>

      </div>
    </section>

    <!-- ═══ 농약재고 ════════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'peststock'">
      <PesticideInventoryPanel />
    </section>

    <!-- ═══ 농약 추천 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'recommend'">
      <div class="rec-search">
        <input
          v-model="recPest"
          list="rec-pest-list"
          placeholder="방제 대상 입력 (예: 귤굴나방, 잿빛곰팡이병)"
          @keyup.enter="runRecommend"
          autocomplete="off"
        />
        <datalist id="rec-pest-list">
          <option v-for="p in recPests" :key="p" :value="p" />
        </datalist>
        <label class="rec-date-label">방제 예정일
          <input type="date" v-model="recDate" class="rec-date-input" @change="runRecommend" />
        </label>
        <label class="rec-date-label">수확 예정일 <span class="muted">(선택)</span>
          <input type="date" v-model="recHarvestDate" class="rec-date-input" @change="runRecommend" />
        </label>
        <button @click="runRecommend">추천 조회</button>
      </div>

      <div v-if="apStore.availableList.length === 0" class="empty-msg">
        가용농약 목록이 없습니다.<br>
        <span class="hint">'가용농약' 탭에서 구입가능농약을 입력하고 목록을 작성해주세요.</span>
      </div>
      <div v-else-if="!recResult" class="empty-msg">
        방제 대상을 입력하고 추천 조회를 눌러주세요.<br>
        <span class="hint">설정의 제약사항이 반영됩니다 ({{ recConstraintHint }}).</span>
      </div>

      <template v-else>
        <div v-if="recResult.totalMatched === 0" class="empty-msg">
          '{{ recPest }}'에 등록된 농약이 없습니다. 다른 이름으로 검색해 보세요.
        </div>
        <template v-else>
          <!-- 추천 가능 -->
          <div class="rec-section">
            <h3 class="rec-section-title ok">
              추천 가능
              <span class="rec-count">{{ recResult.recommended.length }}건</span>
            </h3>
            <div v-if="recResult.recommended.length === 0" class="empty-msg small">
              현재 제약사항을 모두 만족하는 농약이 없습니다.
            </div>
            <div v-else class="rec-list">
              <div v-for="p in sortedRecommended" :key="p.brandName" class="rec-card rec-ok">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                  <span class="moa-badge" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span v-if="p.toxicName" class="toxic-badge" :class="toxicClass(p.toxicName)">{{ p.toxicName }}</span>
                  <span v-if="p.fishToxic" class="toxic-badge" :class="fishToxicClass(p.fishToxic)">{{ formatFishToxicBadge(p.fishToxic) }}</span>
                </div>
                <div class="rec-pests">{{ p.targetPests.join(', ') }}</div>
                <div v-if="p.preHarvestDays" class="ap-safety">{{ formatPreHarvest(p.preHarvestDays) }}</div>
                <div v-if="p.useCount > 0" class="rec-usecount">올해 {{ p.useCount }}회 사용{{ p.appliedLimit ? ` (최대 ${p.appliedLimit}회)` : '' }}</div>
                <div v-if="inventoryStockMap[p.brandName]?.length" class="ap-stock-row">
                  재고
                  <span v-for="lot in inventoryStockMap[p.brandName]" :key="`${lot.vol}-${lot.expiry}`" class="ap-stock-lot">{{ stockLotLabel(lot) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 제약으로 제외 -->
          <div v-if="recResult.excluded.length > 0" class="rec-section">
            <h3 class="rec-section-title ng">
              제약으로 제외
              <span class="rec-count">{{ recResult.excluded.length }}건</span>
            </h3>
            <div class="rec-list">
              <div v-for="p in sortedExcluded" :key="p.brandName" class="rec-card rec-ng">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                  <span class="moa-badge moa-faded" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span v-if="p.toxicName" class="toxic-badge" :class="toxicClass(p.toxicName)">{{ p.toxicName }}</span>
                  <span v-if="p.fishToxic" class="toxic-badge" :class="fishToxicClass(p.fishToxic)">{{ formatFishToxicBadge(p.fishToxic) }}</span>
                </div>
                <ul class="rec-reasons">
                  <li v-for="(r, i) in p.reasons" :key="i">{{ r }}</li>
                </ul>
                <div v-if="inventoryStockMap[p.brandName]?.length" class="ap-stock-row">
                  재고
                  <span v-for="lot in inventoryStockMap[p.brandName]" :key="`${lot.vol}-${lot.expiry}`" class="ap-stock-lot">{{ stockLotLabel(lot) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </section>

    <!-- ═══ 가용농약 ════════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'avail'" :class="['page-grid', apEditMode ? 'two-columns' : '']">
      <article class="card">

      <div class="pip-header">
        <div class="pip-summary">
          <span v-if="apStats.total > 0" class="summary-chip">{{ apStats.total }}개</span>
        </div>
        <div class="pip-actions">
          <button v-if="apEditMode && apStore.availableList.length > 0" class="ghost" type="button" @click="refreshAllPesticideInfo">
            전체 재연결
          </button>
          <button v-if="!apEditMode" type="button" @click="apEditMode = true">편집</button>
          <button v-else class="ghost" type="button" @click="closeApEdit">편집종료</button>
        </div>
      </div>
      <p v-if="apRefreshMessage" class="muted" style="font-size:0.82rem; margin: -0.4rem 0 0.6rem;">{{ apRefreshMessage }}</p>

      <!-- 재고농약 표시 -->
      <div class="ap-inv-row">
        <span class="ap-inv-label">재고농약</span>
        <span v-if="inventoryPesticides.length > 0" class="pill ap-inv-pill">{{ inventoryPesticides.length }}종</span>
        <span v-else class="muted" style="font-size:0.8rem;">없음 (재고 메뉴에서 농약 카테고리 항목 추가)</span>
        <span v-if="inventoryPesticides.length > 0" class="ap-inv-names">
          {{ inventoryPesticides.map(i => i.name).slice(0, 5).join(' · ') }}{{ inventoryPesticides.length > 5 ? ' 외 ' + (inventoryPesticides.length - 5) + '종' : '' }}
        </span>
      </div>

      <div id="ap-form-top" class="mobile-form-slot"></div>

      <!-- 가용농약 목록 -->
      <template v-if="apStore.availableList.length > 0">
        <div class="ap-list-header">
          <span class="ap-list-title">가용농약 목록</span>
          <div class="ap-src-filter">
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'all' }"       @click="apSourceFilter = 'all'">전체 ({{ apStats.total }})</button>
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'purchase' }"  @click="apSourceFilter = 'purchase'">구입가능 ({{ apSourceCounts.purchase }})</button>
            <button class="ap-src-btn" :class="{ active: apSourceFilter === 'inventory' }" @click="apSourceFilter = 'inventory'">재고 ({{ apSourceCounts.inventory }})</button>
          </div>
          <button
            class="ghost ap-unmatched-btn"
            :class="{ 'ap-unmatched-active': apUnmatchedOnly }"
            @click="apUnmatchedOnly = !apUnmatchedOnly"
          >미연결만 ({{ apStats.unmatched }})</button>
          <button
            class="ghost ap-unmatched-btn"
            :class="{ 'ap-unmatched-active': apManualOnly }"
            @click="apManualOnly = !apManualOnly"
          >수동만 ({{ apStats.manual }})</button>
          <input
            v-model="apFilter"
            type="text"
            class="ap-filter-input"
            placeholder="필터 (농약명, 분류, 작용기작, 병해충)"
          />
        </div>

        <div class="ap-list">
          <div v-for="item in filteredApList" :key="item.id" class="ap-card">
            <!-- 카드 메인 -->
            <div class="ap-card-body">
              <div class="ap-card-name-row">
                <span class="ap-brand">{{ item.brandName }}</span>
                <span v-if="item.form"   class="ap-form">({{ item.form }})</span>
                <span v-if="item.volume" class="ap-vol">{{ item.volume }}</span>
              </div>
              <div class="ap-card-badges">
                <span v-if="item.category" class="cat-badge" :class="categoryClassFor(item.category)">
                  {{ normCat(item.category) }}
                </span>
                <span v-if="item.moa" class="moa-badge" :style="{ background: moaColor(item.moa) }">
                  {{ item.moa }}
                </span>
                <span v-if="item.toxicName" class="toxic-badge" :class="toxicClass(item.toxicName)">
                  {{ item.toxicName }}
                </span>
                <span v-if="item.fishToxic" class="toxic-badge" :class="fishToxicClass(item.fishToxic)">
                  {{ formatFishToxicBadge(item.fishToxic) }}
                </span>
                <span
                  class="source-badge"
                  :class="{ 'src-purchase': item.source === 'purchase', 'src-inv': item.source === 'inventory', 'src-both': item.source === 'both' }"
                >
                  {{ item.source === 'both' ? '구입+재고' : item.source === 'purchase' ? '구입가능' : '재고' }}
                </span>
                <span class="match-badge" :class="item.matchSource ? 'match-ok' : 'match-none'">
                  {{ matchLabel(item.matchSource) }}
                </span>
              </div>
              <div v-if="item.targetPests.length" class="ap-pests">
                {{ item.targetPests.join(' · ') }}
              </div>
              <div v-if="item.preHarvestDays" class="ap-safety">
                {{ formatPreHarvest(item.preHarvestDays) }} · {{ formatMaxApplications(item.maxApplications) }}
              </div>
              <div v-if="item.ingredient" class="ap-ingredient">{{ item.ingredient }}</div>
              <div v-if="inventoryStockMap[item.brandName]?.length" class="ap-stock-row">
                재고
                <span
                  v-for="lot in inventoryStockMap[item.brandName]"
                  :key="`${lot.vol}-${lot.expiry}`"
                  class="ap-stock-lot"
                >{{ stockLotLabel(lot) }}</span>
              </div>
            </div>

            <!-- 카드 액션 -->
            <div v-if="apEditMode" class="ap-card-actions">
              <button
                class="ghost"
                :class="{ 'link-btn-active': matchingItemId === item.id }"
                @click="openManualMatch(item.id)"
              >{{ item.matchSource === 'manual' ? '연결 변경' : (item.matchSource ? '수동 재연결' : '수동 연결') }}</button>
              <button
                class="ghost"
                :class="{ 'link-btn-active': manualEditId === item.id }"
                @click="openManualEdit(item)"
              >{{ item.matchSource ? '정보 수정' : '직접 입력' }}</button>
              <button
                v-if="item.matchSource === 'manual'"
                class="ghost"
                @click="apStore.clearManualMatch(item.id)"
              >연결 해제</button>
              <button class="danger" @click="confirmDeleteAp(item)">삭제</button>
            </div>

            <!-- 수동 연결 패널 -->
            <div v-if="matchingItemId === item.id" class="match-panel">
              <input
                type="text"
                v-model="matchQuery"
                placeholder="농약명 검색 (공공데이터)"
                class="match-search-input"
                @input="searchApiCandidates(matchQuery)"
              />
              <div v-if="matchResults.length" class="match-results">
                <div
                  v-for="r in matchResults"
                  :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                  class="match-result-item"
                  @click="applyMatch(item.id, r)"
                >
                  <span class="match-result-brand">{{ r.brandName }}</span>
                  <span class="cat-badge" :class="categoryClassFor(r.pesticideType)">{{ normCat(r.pesticideType) }}</span>
                  <span class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                  <span class="match-result-pest">{{ r.targetPest }}</span>
                </div>
              </div>
              <p v-else-if="matchQuery.trim().length > 1" class="muted" style="font-size:0.82rem; padding:0.5rem 0;">
                검색 결과 없음 — 공공데이터가 없거나 농약정보를 먼저 가져와야 합니다.
              </p>
            </div>

            <div :id="`ap-form-slot-${item.id}`" class="mobile-form-slot"></div>
          </div>

          <p v-if="filteredApList.length === 0" class="empty-msg small">필터 결과 없음</p>
        </div>
      </template>
      <div v-else class="empty-msg">
        구입가능농약을 입력하거나 재고를 추가한 후 '목록 작성'을 눌러주세요.
      </div>

      </article>

      <!-- 편집 패널: 직접 입력/수정 중이면 해당 항목 폼, 아니면 구입가능농약 입력 폼 -->
      <Teleport v-if="apEditMode" :to="apFormTarget" :disabled="!isMobile">
      <article v-if="apEditMode" class="card">
        <template v-if="manualEditItem">
          <h2>{{ manualEditItem.brandName }} {{ manualEditItem.matchSource ? '정보 수정' : '직접 입력' }}</h2>
          <div class="manual-edit-grid">
            <label>분류
              <select v-model="manualEditForm.category">
                <option value="">선택 안 함</option>
                <option v-for="tp in pesticideTypes" :key="tp" :value="tp">{{ tp }}</option>
              </select>
            </label>
            <label>작용기작
              <input v-model="manualEditForm.moa" type="text" placeholder="예: 4a, 나1" />
            </label>
            <label>대상 병해충
              <input v-model="manualEditForm.targetPests" type="text" placeholder="쉼표로 구분 (예: 귤굴나방, 진딧물)" />
            </label>
            <label>수확 전 일수
              <input v-model="manualEditForm.preHarvestDays" type="text" placeholder="예: 14" />
            </label>
            <label>최대 사용 횟수
              <input v-model="manualEditForm.maxApplications" type="text" placeholder="예: 3" />
            </label>
            <label>독성 등급
              <select v-model="manualEditForm.toxicName">
                <option value="">선택 안 함</option>
                <option v-for="g in TOXIC_GRADES" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label>어독성 등급
              <select v-model="manualEditForm.fishToxic">
                <option value="">선택 안 함</option>
                <option v-for="g in FISH_TOXIC_GRADES" :key="g" :value="g">{{ formatFishToxic(g) }}</option>
              </select>
            </label>
            <label>성분
              <input v-model="manualEditForm.ingredient" type="text" />
            </label>
            <label>제조사
              <input v-model="manualEditForm.manufacturer" type="text" />
            </label>
          </div>
          <div class="row-actions">
            <button type="button" @click="saveManualEdit(manualEditItem)">저장</button>
            <button class="ghost" type="button" @click="manualEditId = null">취소</button>
          </div>
        </template>
        <template v-else>
          <div class="inline-filters" style="margin-bottom: 1rem;">
            <button :class="{ ghost: apFormMode !== 'single' }" type="button" @click="apFormMode = 'single'">새 항목 추가</button>
            <button :class="{ ghost: apFormMode !== 'bulk' }" type="button" @click="apFormMode = 'bulk'">붙여넣기 일괄추가</button>
          </div>

          <template v-if="apFormMode === 'single'">
            <h2>새 항목 추가</h2>
            <form class="stack-form" @submit.prevent="submitNewApItem">
              <label>상표명
                <input
                  v-model="newApBrand"
                  placeholder="상표명 입력 (공공데이터 검색)"
                  autocomplete="off"
                  @input="onNewApBrandInput($event.target.value)"
                />
              </label>
              <div v-if="newApLinkResults.length" class="inv-api-panel">
                <div
                  v-for="r in newApLinkResults"
                  :key="`${r.pestiCode}-${r.diseaseUseSeq}`"
                  class="inv-api-item"
                  @mousedown.prevent="applyNewApLink(r)"
                >
                  <span class="inv-api-brand">{{ r.brandName }}</span>
                  <span v-if="r.pesticideType" class="cat-badge" :class="categoryClassFor(r.pesticideType)">{{ normCat(r.pesticideType) }}</span>
                  <span v-if="r.modeOfAction && r.modeOfAction !== '-'" class="moa-badge" :style="{ background: moaColor(r.modeOfAction) }">{{ r.modeOfAction }}</span>
                  <span class="inv-api-pest">{{ r.targetPest }}</span>
                </div>
              </div>
              <label>형태 <span class="muted">(선택)</span>
                <input v-model="newApForm" placeholder="예: 액상, 수화제" />
              </label>
              <label>용량 <span class="muted">(선택)</span>
                <input v-model="newApVolume" placeholder="예: 500ml" />
              </label>
              <div class="row-actions">
                <button type="submit" :disabled="!newApBrand.trim()">추가</button>
              </div>
            </form>
            <p v-if="newApMessage" class="muted" style="font-size:0.82rem; margin-top:0.5rem;">{{ newApMessage }}</p>
          </template>

          <template v-else>
          <h2>{{ apBulkIsAppend ? '붙여넣기로 일괄 추가' : '구입가능농약 입력' }}</h2>
          <p class="ap-hint">
            <code>상표명(형태)-용량</code> 형식, 줄바꿈으로 구분. 유사 농약은 <code>/</code>로 연결.<br>
            예) <code>만수무강(액상)-500ml</code> &nbsp;|&nbsp; <code>겔럭시(유)-200ml/올스타/오쏘도</code><br>
            현재 설정: <strong>{{ apBulkIsAppend ? '기존 목록에 추가' : '전체 새로 작성' }}</strong>
            <span v-if="apBulkIsAppend" class="muted">(붙여넣은 항목만 기존 구입가능농약 목록에 더해집니다 — 설정페이지에서 변경 가능)</span>
            <span v-else class="muted">(이 내용이 구입가능농약 전체 목록을 대체합니다 — 설정페이지에서 변경 가능)</span>
          </p>
          <textarea
            v-if="apBulkIsAppend"
            v-model="apBulkAppendText"
            class="ap-textarea"
            placeholder="새로 추가할 항목만 입력하세요..."
            rows="6"
          ></textarea>
          <textarea
            v-else
            v-model="apInputText"
            class="ap-textarea"
            placeholder="여기에 붙여넣기..."
            rows="6"
          ></textarea>
          <div class="ap-input-footer">
            <span v-if="apBulkCurrentCount > 0" class="ap-parse-count">{{ apBulkCurrentCount }}개 항목 인식됨</span>
            <span v-else class="ap-parse-count muted">입력 없음</span>
          </div>
          <div class="ap-build-row">
            <button
              :disabled="apBuilding || (apBulkIsAppend ? !apBulkAppendText.trim() : !apInputText.trim())"
              @click="submitApBulk"
            >
              {{ apBuilding ? '처리 중...' : (apBulkIsAppend ? '일괄 추가' : '목록 작성') }}
            </button>
            <span v-if="apStats.total > 0" class="ap-stats">
              {{ apStats.total }}개 &nbsp;·&nbsp; 연결 {{ apStats.matched }} &nbsp;·&nbsp; 미연결 {{ apStats.unmatched }}
            </span>
          </div>
          </template>
        </template>
      </article>
      </Teleport>
    </section>

    <!-- ═══ 추천 설정 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'settings'">
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-label">
            <span>작용기작 중복 제한 기간</span>
            <span class="setting-hint">같은 작용기작을 이 기간 내 재사용 시 제외</span>
          </div>
          <div class="setting-control days-control">
            <button class="ghost days-btn days-btn-wide" @click="settingsStore.settings.moaConflictDays = Math.max(14, settingsStore.settings.moaConflictDays - 10)">−10</button>
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.max(14, settingsStore.settings.moaConflictDays - 1)">−</button>
            <span class="days-value">{{ settingsStore.settings.moaConflictDays }}일</span>
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.min(180, settingsStore.settings.moaConflictDays + 1)">+</button>
            <button class="ghost days-btn days-btn-wide" @click="settingsStore.settings.moaConflictDays = Math.min(180, settingsStore.settings.moaConflictDays + 10)">+10</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>연간 최대 사용 횟수 제한</span>
            <span class="setting-hint">동일 농약이 설정 횟수 이상 사용된 경우 제외</span>
          </div>
          <label class="toggle" aria-label="연간 최대 사용 횟수 제한">
            <input type="checkbox" v-model="settingsStore.settings.enforceMaxApplications" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div v-if="settingsStore.settings.enforceMaxApplications" class="setting-row setting-sub">
          <div class="setting-label">
            <span>최대 허용 횟수 (기본값)</span>
            <span class="setting-hint">농약별 등록정보가 없을 때 적용되는 값</span>
          </div>
          <div class="setting-control days-control">
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.max(1, settingsStore.settings.maxApplicationsPerYear - 1)">−</button>
            <span class="days-value">{{ settingsStore.settings.maxApplicationsPerYear }}회/년</span>
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.min(10, settingsStore.settings.maxApplicationsPerYear + 1)">+</button>
          </div>
        </div>

        <div v-if="settingsStore.settings.enforceMaxApplications" class="setting-row setting-sub">
          <div class="setting-label">
            <span>농약별 등록정보 우선 적용</span>
            <span class="setting-hint">농약정보에 최대 사용 횟수가 등록되어 있으면 위 기본값 대신 그 값을 사용</span>
          </div>
          <label class="toggle" aria-label="농약별 등록정보 우선 적용">
            <input type="checkbox" v-model="settingsStore.settings.preferPesticideMaxApplications" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>제외할 독성 등급</span>
            <span class="setting-hint">체크한 등급의 농약은 추천에서 자동 제외 (상세정보를 가져와야 등급이 채워집니다)</span>
          </div>
          <div class="toxic-grade-checks">
            <label v-for="g in TOXIC_GRADES" :key="g" class="toxic-grade-check">
              <input type="checkbox" :value="g" v-model="settingsStore.settings.excludeToxicGrades" />
              {{ g }}
            </label>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>
              제외할 어독성 등급
              <button
                type="button"
                class="info-icon-btn"
                :aria-label="showFishToxicInfo ? '어독성 등급 설명 닫기' : '어독성 등급 설명 보기'"
                @click="showFishToxicInfo = !showFishToxicInfo"
              >ⓘ</button>
            </span>
            <span class="setting-hint">체크한 등급의 농약은 추천에서 자동 제외 (상세정보를 가져와야 등급이 채워집니다)</span>
          </div>
          <div class="toxic-grade-checks">
            <label v-for="g in FISH_TOXIC_GRADES" :key="g" class="toxic-grade-check">
              <input type="checkbox" :value="g" v-model="settingsStore.settings.excludeFishToxicGrades" />
              {{ formatFishToxic(g) }}
            </label>
          </div>
        </div>

        <div v-if="showFishToxicInfo" class="fish-toxic-info">
          <div v-for="g in FISH_TOXIC_GRADES" :key="g" class="fish-toxic-info-row">
            <p class="fish-toxic-info-title">{{ FISH_TOXIC_INFO[g].label }}</p>
            <p class="fish-toxic-info-lc50">{{ FISH_TOXIC_INFO[g].lc50 }}</p>
            <p class="muted">{{ FISH_TOXIC_INFO[g].desc }}</p>
            <p class="muted">{{ FISH_TOXIC_INFO[g].guidance }}</p>
          </div>
        </div>

        <div class="setting-reset">
          <button class="ghost" @click="settingsStore.reset()">기본값으로 초기화</button>
        </div>
      </div>

      <div class="settings-note">
        <p>수확 전 안전기간(PHI)은 '농약 추천' 탭에서 수확 예정일을 입력하면 자동으로 반영됩니다.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.view-header { margin-bottom: 1.25rem; }
.subtitle { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--muted); }

/* ── Tabs ── */
.tab-bar {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0;
}
.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: -1px;
  border-radius: 0;
}
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
.tab-btn:hover:not(.active) { color: var(--text); }

/* ── Form ── */
.hist-form-info { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; padding: 0.15rem 0; }
.form-error { font-size: 0.82rem; color: var(--danger, #dc2626); }


/* ── 농약정보 연결 ── */
.link-btn-active { background: var(--primary) !important; color: var(--primary-ink) !important; border-color: var(--primary) !important; }

.hist-year-active {
  background: var(--surface-strong);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

.hist-date-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.9rem 0 0.35rem;
  padding: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
}
.hist-date-divider:first-child { margin-top: 0; }
.hist-date-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
.link-panel {
  margin-top: 0.5rem;
  border: 1px solid var(--primary);
  border-radius: 0.5rem;
  overflow: hidden;
}
.link-search-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--line);
  padding: 0.5rem 0.75rem;
  font-size: 0.88rem;
  background: color-mix(in srgb, var(--primary) 4%, var(--surface));
  outline: none;
  box-sizing: border-box;
}
.link-search-input:focus { background: var(--surface); }
.link-results { max-height: 200px; overflow-y: auto; }
.link-result-item {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;
  padding: 0.38rem 0.65rem; cursor: pointer; font-size: 0.83rem;
  border-bottom: 1px solid var(--line);
}
.link-result-item:last-child { border-bottom: none; }
.link-result-item:hover { background: var(--surface-strong); }
.link-result-brand { font-weight: 600; }
.link-result-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }

/* OpenAPI 검색 패널 (폼 농약 입력란) */
.inv-api-panel {
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 220px; overflow-y: auto;
  border: 1px solid var(--primary); border-radius: 0.45rem;
  background: var(--bg);
  margin-top: -0.25rem; margin-bottom: 0.25rem;
}
.inv-api-item {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;
  padding: 0.38rem 0.65rem; cursor: pointer; font-size: 0.83rem;
  border-bottom: 1px solid var(--line);
}
.inv-api-item:last-child { border-bottom: none; }
.inv-api-item:hover { background: var(--surface-strong); }
.inv-api-brand { font-weight: 600; }
.inv-api-pest { font-size: 0.76rem; color: var(--muted); margin-left: auto; }

/* ── Recommend ── */
.rec-search { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: flex-end; }
.rec-search > input { flex: 1; min-width: 180px; }
.rec-date-label { font-size: 0.78rem; color: var(--muted); display: flex; flex-direction: column; gap: 0.2rem; }
.rec-date-input { flex: none; width: auto; }

.rec-section { margin-bottom: 1.25rem; }
.rec-section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rec-section-title.ok { color: #166534; }
.rec-section-title.ng { color: #9a3412; }
.rec-count { font-size: 0.78rem; font-weight: 400; color: var(--muted); }

.rec-list { display: flex; flex-direction: column; gap: 0.5rem; }
.rec-card {
  border: 1px solid var(--line);
  border-radius: 0.65rem;
  padding: 0.65rem 0.9rem;
}
.rec-ok { background: #f0fdf4; border-color: #bbf7d0; }
.rec-ng { background: #fef2f2; border-color: #fecaca; opacity: 0.85; }

.rec-top { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
.rec-brand { font-weight: 600; font-size: 0.88rem; }
.rec-pests { font-size: 0.78rem; color: var(--muted); }
.rec-usecount { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; }
.rec-reasons { margin: 0.25rem 0 0; padding-left: 1.2rem; font-size: 0.8rem; color: #9a3412; }
.rec-reasons li { margin-bottom: 0.15rem; }

/* ── Settings ── */
.settings-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}
.setting-row:last-child { border-bottom: none; }
.setting-sub { padding-left: 1.1rem; background: var(--surface); }
.setting-label { display: flex; flex-direction: column; gap: 0.15rem; }
.setting-label span:first-child { font-size: 0.88rem; font-weight: 500; }
.setting-hint { font-size: 0.75rem; color: var(--muted); }
.setting-control { flex-shrink: 0; }
.setting-reset { margin-top: 0.75rem; }

.days-control { display: flex; align-items: center; gap: 0.4rem; }
.days-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
.days-btn-wide { width: auto; padding: 0 0.55rem; font-size: 0.82rem; }
.days-value { font-size: 0.88rem; font-weight: 600; min-width: 52px; text-align: center; }

.toggle { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; inset: 0;
  background: var(--line); border-radius: 22px;
  transition: background 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px; height: 16px;
  left: 3px; top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.toggle input:checked + .toggle-slider { background: var(--primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(18px); }

.toxic-grade-checks { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.toxic-grade-check { display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer; }

.info-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; margin-left: 0.3rem;
  padding: 0; border-radius: 50%;
  background: var(--surface-strong); color: var(--muted);
  font-size: 0.75rem; line-height: 1; cursor: pointer; vertical-align: middle;
}
.info-icon-btn:hover { background: var(--primary); color: var(--primary-ink); }

.fish-toxic-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.6rem;
  margin: -0.25rem 0 0.75rem;
  padding: 0.75rem;
  background: var(--surface);
  border-radius: 0.5rem;
}
.fish-toxic-info-row p { margin: 0.1rem 0; font-size: 0.78rem; }
.fish-toxic-info-title { font-weight: 700; font-size: 0.85rem !important; }
.fish-toxic-info-lc50 { color: var(--primary); font-weight: 600; }

.settings-note {
  margin-top: 0.75rem;
  font-size: 0.78rem;
  color: var(--muted);
  padding: 0.5rem 0.75rem;
  border-left: 2px solid var(--line);
}
.settings-note p { margin: 0; }

/* ── 가용농약 ── */
.ap-inv-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.6rem 0;
  font-size: 0.83rem;
}
.ap-inv-label { font-weight: 600; font-size: 0.82rem; color: var(--muted); }
.ap-inv-pill { font-size: 0.75rem; }
.ap-inv-names { font-size: 0.78rem; color: var(--muted); }

.ap-build-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.1rem;
  flex-wrap: wrap;
}
.ap-stats { font-size: 0.8rem; color: var(--muted); }

.ap-list-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}
.ap-list-title { font-size: 0.9rem; font-weight: 700; }
.ap-unmatched-btn {
  font-size: 0.78rem;
  border-radius: 999px;
  padding: 0.22rem 0.7rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.ap-unmatched-active {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fca5a5;
}
.ap-src-filter {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  overflow: hidden;
  flex-shrink: 0;
}
.ap-src-btn {
  background: none;
  border: none;
  border-right: 1px solid var(--line);
  padding: 0.22rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--muted);
  white-space: nowrap;
  font-family: inherit;
}
.ap-src-btn:last-child { border-right: none; }
.ap-src-btn.active { background: var(--primary); color: var(--primary-ink); font-weight: 600; }
.ap-src-btn:not(.active):hover { background: var(--surface-strong); color: var(--text); }

.ap-filter-input {
  flex: 1;
  min-width: 160px;
  font-size: 0.83rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--bg);
  color: var(--text);
}

.ap-list { display: flex; flex-direction: column; gap: 0.55rem; }

.ap-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 0.7rem 0.9rem;
}
.ap-card-body { margin-bottom: 0.45rem; }
.ap-card-name-row {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}
.ap-brand { font-weight: 600; font-size: 0.9rem; }
.ap-form  { font-size: 0.78rem; color: var(--muted); }
.ap-vol   { font-size: 0.78rem; color: var(--muted); }
.ap-card-badges {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}
.ap-pests     { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.15rem; }
.ap-safety    { font-size: 0.78rem; color: var(--muted); }
.ap-ingredient { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; font-style: italic; }
.ap-stock-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
  flex-wrap: wrap;
}
.ap-stock-lot {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  padding: 0.08rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.ap-card-actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.source-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid;
}
.src-purchase { background: #f0fdf4; color: #15803d; border-color: #86efac; }
.src-inv      { background: #eff6ff; color: #1d4ed8; border-color: #93c5fd; }
.src-both     { background: #faf5ff; color: #7e22ce; border-color: #d8b4fe; }

.match-panel {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--line);
}
.match-search-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 0.85rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--primary);
  border-radius: 0.45rem;
  background: var(--bg);
  color: var(--text);
  margin-bottom: 0.4rem;
}
.match-search-input:focus { outline: none; }
.match-results {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 240px;
  overflow-y: auto;
}
.match-result-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.35rem 0.5rem;
  border-radius: 0.4rem;
  cursor: pointer;
  font-size: 0.82rem;
  background: var(--bg);
  border: 1px solid var(--line);
}
.match-result-item:hover { background: var(--surface-strong); border-color: var(--primary); }
.match-result-brand { font-weight: 600; }
.match-result-pest  { font-size: 0.76rem; color: var(--muted); margin-left: auto; }

.manual-edit-panel {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--line);
}
.manual-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.manual-edit-grid label {
  font-size: 0.78rem;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

/* ── Shared ── */
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; line-height: 1.6; }
.empty-msg.small { padding: 0.75rem; text-align: left; }
.hint { font-size: 0.8rem; }
</style>
