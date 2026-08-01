// 농약안전정보시스템 OpenAPI (농촌진흥청)
// 신청처: https://pis.rda.go.kr (농약안전정보시스템 API 포털)
// 환경변수: VITE_AGRI_API_KEY
// 응답 형식: XML (serviceType=AA001) — JSON 미지원
//
// SVC01: 농약등록정보 목록
//   필수: apiKey, serviceCode=SVC01, serviceType=AA001
//   선택: cropName, diseaseWeedName, pestiKorName, pestiBrandName, useName, compName
//
// SVC02: 농약등록정보 상세
//   필수: apiKey, serviceCode=SVC02, pestiCode, diseaseUseSeq (SVC01 응답에서 획득)

import { saveCache, loadCache, pushSharedCache, pullSharedCache } from './cache.js'

const API_KEY = import.meta.env.VITE_AGRI_API_KEY
const USE_MOCK = !API_KEY

const FULL_CACHE_KEY = 'pesticide:all'
// 공공데이터에 없어 직접 등록한 농약. 전건 캐시는 "최신 정보 가져오기"로 통째로 덮어써지므로
// 따로 보관하고, 검색·연결 시에만 합쳐서 쓴다.
export const MANUAL_CACHE_KEY = 'pesticide:manual'

// 엔드포인트: http://psis.rda.go.kr/openApi/service.do
// 개발: vite.config.js /agri-api → http://psis.rda.go.kr 프록시 (로컬 실행에서만 직접 호출 가능)
// 배포본(GitHub Pages 등): 직접 호출 불가. 로컬에서 가져온 전건 캐시를 Firestore로 공유해서 사용한다.
const BASE_PATH = '/agri-api/openApi/service.do'

function buildUrl(params = {}) {
  const sp = new URLSearchParams()
  sp.set('apiKey', API_KEY)
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') sp.set(k, String(v))
  }
  return `${BASE_PATH}?${sp}`
}

// XML → { totalCount, list: [...] } 변환
function parseXmlResponse(text) {
  if (text.trimStart().startsWith('<html') || text.trimStart().startsWith('<!')) {
    throw new Error('API 서버에 도달하지 못했습니다 (프록시 미연결 또는 잘못된 URL)')
  }
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML 파싱 오류')

  const service = doc.querySelector('service')
  if (!service) throw new Error('응답 구조 오류 (service 요소 없음)')

  const errorCode = service.querySelector('errorCode')?.textContent?.trim()
  if (errorCode) {
    const errorMsg = service.querySelector('errorMsg')?.textContent?.trim()
    throw new Error(`${errorCode}: ${errorMsg ?? 'API 오류'}`)
  }

  // SVC01(목록)은 <list><item>...</item></list>로 감싸져 오지만,
  // SVC02(상세)는 <list> 래퍼 없이 필드가 <service> 바로 아래에 오는 단건(flat) 구조라 별도 처리한다.
  const listEl = service.querySelector('list')
  if (listEl) {
    const totalCount = Number(service.querySelector('totalCount')?.textContent ?? 0)
    const list = Array.from(listEl.querySelectorAll('item')).map(el => {
      const obj = {}
      for (const child of el.children) {
        obj[child.tagName] = child.textContent?.trim() ?? ''
      }
      return obj
    })
    return { totalCount, list }
  }

  const obj = {}
  for (const child of service.children) {
    if (child.tagName === 'errorCode' || child.tagName === 'errorMsg') continue
    obj[child.tagName] = child.textContent?.trim() ?? ''
  }
  return { totalCount: 1, list: [obj] }
}

async function apiFetch(params) {
  const res = await fetch(buildUrl(params))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return parseXmlResponse(text)
}

// useSuittime(안전사용기준) 원본 예시: "14", "수확10일전", "잡초발생기", "-"
// 숫자가 있으면 숫자만 남기고("수확10일전" → "10"), 없으면(생육단계 표현 등) 원문을 그대로 둔다.
export function cleanPreHarvestDays(raw) {
  if (!raw || raw === '-') return ''
  const digits = raw.match(/\d+/)
  return digits ? digits[0] : raw.replace(/^수확\s*/, '').replace(/\s*전까지$/, '').trim()
}

// useNum(사용횟수) 원본 예시: "3", "3회", "-"
export function cleanMaxApplications(raw) {
  if (!raw) return ''
  const digits = raw.match(/\d+/)
  return digits ? digits[0] : raw
}

// preHarvestDays가 숫자면 "수확 N일 전까지", 생육단계 표현이면 "OO 전까지"로 표시한다.
// (예전에 캐시된 미가공 값 "수확10일전" 등이 남아있어도 안전하도록 항상 재정리한다)
export function formatPreHarvest(preHarvestDays) {
  const clean = cleanPreHarvestDays(preHarvestDays)
  if (!clean) return ''
  return /^\d+$/.test(clean) ? `수확 ${clean}일 전까지` : `${clean} 전까지`
}

export function formatMaxApplications(maxApplications) {
  const clean = cleanMaxApplications(maxApplications)
  if (!clean) return ''
  return `${clean}회 이내`
}

// SVC01 응답 → 내부 구조 정규화
function normalizeListItem(item) {
  return {
    // 상세 조회에 필요한 키 (두 개 모두 필수)
    pestiCode: item.pestiCode ?? '',
    diseaseUseSeq: item.diseaseUseSeq ?? '',
    // 표시 정보
    name: item.pestiKorName ?? '',
    brandName: item.pestiBrandName ?? '',
    ingredient: item.engName ?? '',        // 주성분 함량 (예: "수산화동 77%")
    targetPest: item.diseaseWeedName ?? '',
    pesticideType: item.useName ?? '',     // 용도: 살균, 살충, 제초 등
    modeOfAction: item.indictSymbl ?? '-', // 작용기작
    manufacturer: item.compName ?? '',
    applicationMethod: item.pestiUse ?? '',
    dilution: item.dilutUnit ?? '',
    preHarvestDays: cleanPreHarvestDays(item.useSuittime),  // 예: "14"
    maxApplications: cleanMaxApplications(item.useNum),     // 예: "3"
    cropName: item.cropName ?? '감귤',
    registDate: item.applyFirstRegDate ?? '',
  }
}

// ─── 직접등록 농약 ────────────────────────────────────────────────────────────
// 목록(SVC01) 레코드와 같은 모양으로 맞춰 두어 검색·자동연결에서 그대로 함께 쓰인다.
// 독성·어독성은 상세 API가 없으므로 레코드에 직접 담는다.
function normalizeManualItem(entry) {
  const id = entry.id || `m${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    isManual: true,
    pestiCode: `MANUAL-${id}`,
    diseaseUseSeq: '1',
    name: (entry.name ?? '').trim(),
    brandName: (entry.brandName ?? '').trim(),
    ingredient: (entry.ingredient ?? '').trim(),
    targetPest: (entry.targetPest ?? '').trim(),
    pesticideType: (entry.pesticideType ?? '').trim(),
    modeOfAction: (entry.modeOfAction ?? '').trim() || '-',
    manufacturer: (entry.manufacturer ?? '').trim(),
    applicationMethod: (entry.applicationMethod ?? '').trim(),
    dilution: (entry.dilution ?? '').trim(),
    preHarvestDays: cleanPreHarvestDays((entry.preHarvestDays ?? '').trim()),
    maxApplications: cleanMaxApplications((entry.maxApplications ?? '').trim()),
    toxicName: (entry.toxicName ?? '').trim(),
    fishToxic: (entry.fishToxic ?? '').trim(),
    cropName: '감귤',
    registDate: entry.registDate || new Date().toISOString().slice(0, 10),
  }
}

export function loadManualPesticides() {
  const data = loadCache(MANUAL_CACHE_KEY)?.data
  return Array.isArray(data) ? data : []
}

// 다른 기기에서 등록한 항목을 덮어쓰지 않도록, 공유 캐시를 먼저 당겨와 병합한 뒤 저장한다.
async function persistManualPesticides(mutate) {
  await pullSharedCache(MANUAL_CACHE_KEY)
  const list = mutate(loadManualPesticides())
  saveCache(MANUAL_CACHE_KEY, list)
  await pushSharedCache(MANUAL_CACHE_KEY, list)
  return list
}

export async function saveManualPesticide(entry) {
  const record = normalizeManualItem(entry)
  await persistManualPesticides((list) => {
    const index = list.findIndex(p => p.id === record.id)
    if (index >= 0) return list.map((p, i) => (i === index ? record : p))
    return [...list, record]
  })
  return record
}

export async function deleteManualPesticide(id) {
  await persistManualPesticides(list => list.filter(p => p.id !== id))
}

// 공공데이터 전건 + 직접등록을 합친 검색 대상.
function allPesticideRecords() {
  return [...(loadCache(FULL_CACHE_KEY)?.data ?? []), ...loadManualPesticides()]
}

// SVC02 응답 → 상세 정보 정규화 (독성 등 추가 필드)
function normalizeDetail(item) {
  return {
    name: item.pestiKorName ?? '',
    brandName: item.pestiBrandName ?? '',
    ingredient: item.pestiEngName ?? '',       // 주성분 일반명
    ingredientContent: item.regCpntQnty ?? '', // 주성분 함량
    pesticideType: item.useName ?? '',
    manufacturer: item.compName ?? '',
    toxicCode: item.toxicGubun ?? '',
    toxicName: item.toxicName ?? '',           // 독성 (저독성, 보통독성 등)
    fishToxic: item.fishToxicGubun ?? '',      // 어독성
    cropName: item.cropName ?? '',
    targetPest: item.diseaseWeedName ?? '',
    applicationMethod: item.pestiUse ?? '',
    dilution: item.dilutUnit ?? '',
    preHarvestDays: cleanPreHarvestDays(item.useSuittime),
    maxApplications: cleanMaxApplications(item.useNum),
  }
}

// ─── 공개 API ─────────────────────────────────────────────────

export async function searchPesticides({
  pestName = '',
  targetPest = '',
  pesticideType = '', // 용도 필터 (살균, 살충 등)
  page = 1,
  pageSize = 20,
} = {}) {
  if (USE_MOCK) return mockSearch({ pestName, targetPest, pesticideType, page, pageSize })

  const baseParams = {
    serviceCode: 'SVC01',
    serviceType: 'AA001',
    cropName: '감귤',
    cropCheck: 'Y',
    displayCount: pageSize,
    startPoint: (page - 1) * pageSize,
    ...(targetPest && { diseaseWeedName: targetPest, similarFlag: 'Y' }),
    ...(pesticideType && { useName: pesticideType }),
  }

  if (!pestName) {
    const { totalCount, list: raw } = await apiFetch(baseParams)
    return { total: totalCount, list: raw.map(normalizeListItem) }
  }

  // 품목명 + 상표명 동시 검색 후 중복 제거 병합
  const [byProduct, byBrand] = await Promise.all([
    apiFetch({ ...baseParams, pestiKorName: pestName }),
    apiFetch({ ...baseParams, pestiBrandName: pestName }),
  ])
  const seen = new Set()
  const merged = []
  for (const item of [...byProduct.list, ...byBrand.list]) {
    const key = `${item.pestiCode}-${item.diseaseUseSeq}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(item)
    }
  }
  return { total: merged.length, list: merged.map(normalizeListItem) }
}

// 전건을 로컬 저장. force=true면 기존 캐시를 덮어쓴다.
export async function warmFullCache(force = false) {
  if (USE_MOCK) return
  if (!force && loadCache(FULL_CACHE_KEY)) return
  try {
    const { totalCount } = await apiFetch({
      serviceCode: 'SVC01', serviceType: 'AA001',
      cropName: '감귤', cropCheck: 'Y',
      displayCount: 1, startPoint: 0,
    })
    const { list } = await apiFetch({
      serviceCode: 'SVC01', serviceType: 'AA001',
      cropName: '감귤', cropCheck: 'Y',
      displayCount: totalCount, startPoint: 0,
    })
    const normalized = list.map(normalizeListItem)
    saveCache(FULL_CACHE_KEY, normalized)
    pushSharedCache(FULL_CACHE_KEY, normalized)
  } catch {}
}

function normalizeBrandKey(name) {
  return name.toLowerCase().replace(/[\s\-()·.]/g, '')
}

// 전건 캐시(+직접등록)에서 상표명이 정확히(우선) 또는 접두로 일치하는 항목 하나를 찾는다.
// (방제이력·가용농약 등에서 "전체 재연결" 시 브랜드명 기준으로 자동 매칭할 때 사용)
export function findBestMatchInCache(brandName) {
  if (!brandName) return null
  const cacheData = allPesticideRecords()
  if (!cacheData.length) return null
  const q = normalizeBrandKey(brandName)
  if (!q) return null
  const exact = cacheData.find(p => normalizeBrandKey(p.brandName) === q)
  if (exact) return exact
  return cacheData.find(p => {
    const n = normalizeBrandKey(p.brandName)
    return (n.length >= 2 && q.length >= 2) && (n.startsWith(q) || q.startsWith(n))
  }) ?? null
}

function filterFullCache(list, { pestName = '', targetPest = '', pesticideType = '' }) {
  let out = list
  if (pestName) {
    const q = pestName.toLowerCase()
    out = out.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brandName.toLowerCase().includes(q) ||
      p.ingredient.toLowerCase().includes(q),
    )
  }
  if (targetPest) {
    const q = targetPest.toLowerCase()
    out = out.filter(p => p.targetPest.toLowerCase().includes(q))
  }
  if (pesticideType) {
    out = out.filter(p => p.pesticideType === pesticideType)
  }
  return out
}

// 공공데이터 전건 캐시가 아직 없어도 직접등록 항목만으로 검색이 되도록 한다.
function cacheFetchedAt() {
  return loadCache(FULL_CACHE_KEY)?.fetchedAt ?? loadCache(MANUAL_CACHE_KEY)?.fetchedAt ?? ''
}

// 전건 캐시(+직접등록)에서 클라이언트 필터링
export function searchFromFullCache({ pestName = '', targetPest = '', pesticideType = '', page = 1, pageSize = 20, sortBy = '' } = {}) {
  const all = allPesticideRecords()
  if (!all.length) return null
  let list = filterFullCache(all, { pestName, targetPest, pesticideType })
  if (sortBy === 'brandName' || sortBy === 'name') {
    const key = sortBy
    list = [...list].sort((a, b) => (a[key] || '').localeCompare(b[key] || '', 'ko'))
  }
  const start = (page - 1) * pageSize
  return { total: list.length, list: list.slice(start, start + pageSize), fetchedAt: cacheFetchedAt() }
}

export function splitTargetPests(raw) {
  return (raw ?? '').split(/[,、]/).map(s => s.trim()).filter(Boolean)
}

// 목록(SVC01)은 같은 제품이라도 병해충마다 레코드가 나뉘어 있다.
// 이를 상표명 기준으로 한 건씩 묶어서 돌려준다 (레코드 원본은 records에 그대로 담는다).
export function searchGroupedFromFullCache({ pestName = '', targetPest = '', pesticideType = '', page = 1, pageSize = 20, sortBy = 'brandName' } = {}) {
  const all = allPesticideRecords()
  if (!all.length) return null
  const list = filterFullCache(all, { pestName, targetPest, pesticideType })

  const groups = new Map()
  for (const item of list) {
    const key = normalizeBrandKey(item.brandName || item.name) || `${item.pestiCode}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        brandName: item.brandName,
        name: item.name,
        pesticideType: item.pesticideType,
        ingredient: item.ingredient,
        manufacturer: item.manufacturer,
        modeOfActions: [],
        targetPests: [],
        records: [],
      }
      groups.set(key, group)
    }
    group.records.push(item)
    if (item.modeOfAction && item.modeOfAction !== '-' && !group.modeOfActions.includes(item.modeOfAction)) {
      group.modeOfActions.push(item.modeOfAction)
    }
    for (const pest of splitTargetPests(item.targetPest)) {
      if (!group.targetPests.includes(pest)) group.targetPests.push(pest)
    }
  }

  const sortKey = sortBy === 'name' ? 'name' : 'brandName'
  const arr = [...groups.values()].sort((a, b) => (a[sortKey] || '').localeCompare(b[sortKey] || '', 'ko'))
  const start = (page - 1) * pageSize
  return {
    total: arr.length,
    recordTotal: list.length,
    list: arr.slice(start, start + pageSize),
    fetchedAt: cacheFetchedAt(),
  }
}

// 독성 등급 (농약관리법 기준 4단계, 높은 순서)
export const TOXIC_GRADES = ['맹독성', '고독성', '보통독성', '저독성']

// 상세정보(SVC02) 캐시에서 독성 등급을 조회한다.
// (독성 정보는 목록(SVC01)엔 없고 상세조회로만 얻을 수 있어, "상세정보 전체 가져오기"로 미리 캐시해둔 것을 사용한다)
export function getToxicityFromCache(pestiCode, diseaseUseSeq) {
  if (!pestiCode || !diseaseUseSeq) return ''
  const cached = loadCache(`pesticide:detail:${pestiCode}-${diseaseUseSeq}`)
  return cached?.data?.toxicName ?? ''
}

// 어독성 등급 (농약관리법 기준 3단계, 저장값은 API 원본 표기인 로마숫자 그대로 사용)
export const FISH_TOXIC_GRADES = ['Ⅰ급', 'Ⅱ급', 'Ⅲ급']

export const FISH_TOXIC_INFO = {
  'Ⅰ급': {
    label: 'I급 (강독성)',
    lc50: '96시간 LC50 ≤ 10 mg/L',
    desc: '아주 적은 농도에서도 어류에 치명적',
    guidance: '하천·저수지 인근에서는 사용 금지 또는 강력 제한',
  },
  'Ⅱ급': {
    label: 'II급 (중독성)',
    lc50: '96시간 LC50 10 ~ 100 mg/L',
    desc: '일정 농도 이상에서 어류 피해 발생',
    guidance: '수질 오염 우려가 있으므로 사용 시 주의 필요',
  },
  'Ⅲ급': {
    label: 'III급 (약독성)',
    lc50: '96시간 LC50 ≥ 100 mg/L',
    desc: '상대적으로 어류에 안전',
    guidance: '수질 영향이 적어 수계 주변에서도 비교적 안전하게 사용 가능',
  },
}

// API가 반환하는 표기가 조금씩 다를 수 있어(로마숫자/아라비아숫자 등) 셋 중 하나로 정규화한다.
function normalizeFishGrade(raw) {
  if (!raw) return ''
  if (raw.includes('Ⅰ') || raw.trim().startsWith('1')) return 'Ⅰ급'
  if (raw.includes('Ⅱ') || raw.trim().startsWith('2')) return 'Ⅱ급'
  if (raw.includes('Ⅲ') || raw.trim().startsWith('3')) return 'Ⅲ급'
  return raw
}

export function formatFishToxic(grade) {
  const g = normalizeFishGrade(grade)
  return FISH_TOXIC_INFO[g]?.label ?? g
}

const FISH_TOXIC_ROMAN = { 'Ⅰ급': 'I급', 'Ⅱ급': 'II급', 'Ⅲ급': 'III급' }

// 뱃지 등 짧게 표시할 곳에 쓰는 축약형 ("어독성 I급")
export function formatFishToxicBadge(grade) {
  const g = normalizeFishGrade(grade)
  const roman = FISH_TOXIC_ROMAN[g]
  return roman ? `어독성 ${roman}` : ''
}

// 상세정보(SVC02) 캐시에서 어독성 등급을 조회한다.
export function getFishToxicFromCache(pestiCode, diseaseUseSeq) {
  if (!pestiCode || !diseaseUseSeq) return ''
  const cached = loadCache(`pesticide:detail:${pestiCode}-${diseaseUseSeq}`)
  return normalizeFishGrade(cached?.data?.fishToxic ?? '')
}

// 같은 상표명(제품)이라도 병해충마다 레코드(diseaseUseSeq)가 따로 있고 상세정보도 레코드 단위로
// 캐시된다. 독성·어독성은 병해충이 아니라 제품 단위 정보이므로, 레코드 중 하나라도 상세조회가
// 되어 있으면 그 값을 제품 전체의 값으로 쓴다.
export function findToxicityInCache(records = []) {
  for (const r of records) {
    // 직접등록 농약은 상세 API가 없으므로 레코드에 적어둔 값을 그대로 쓴다.
    if (r.isManual) {
      if (r.toxicName || r.fishToxic) {
        return { toxicName: r.toxicName || '', fishToxic: normalizeFishGrade(r.fishToxic || '') }
      }
      continue
    }
    const toxicName = getToxicityFromCache(r.pestiCode, r.diseaseUseSeq)
    const fishToxic = getFishToxicFromCache(r.pestiCode, r.diseaseUseSeq)
    if (toxicName || fishToxic) return { toxicName, fishToxic }
  }
  return { toxicName: '', fishToxic: '' }
}

export function detailCacheKey(pestiCode, diseaseUseSeq) {
  return `pesticide:detail:${pestiCode}-${diseaseUseSeq}`
}

// 상세정보가 캐시된 레코드 id(pestiCode-diseaseUseSeq) 집합.
// 개수만 세면 되므로 값은 파싱하지 않고 localStorage 키만 훑는다.
function cachedDetailIds() {
  const prefix = 'citrus:pesticide:detail:' // cache.js의 localStorage 접두사 + 상세 캐시 키
  const ids = new Set()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) ids.add(key.slice(prefix.length))
    }
  } catch {}
  return ids
}

// 전건 캐시의 상표(제품) 수와, 그중 상세정보를 가져온 상표 수.
// 상세는 병해충별 레코드 단위로 캐시되므로 한 레코드라도 있으면 그 상표는 가져온 것으로 센다.
export function getDetailCoverage() {
  const cached = loadCache(FULL_CACHE_KEY)
  if (!cached) return { brands: 0, withDetail: 0 }
  const ids = cachedDetailIds()
  const byBrand = new Map() // 상표 키 → 상세 보유 여부
  for (const item of cached.data) {
    const key = normalizeBrandKey(item.brandName || item.name) || item.pestiCode
    const has = byBrand.get(key) || ids.has(`${item.pestiCode}-${item.diseaseUseSeq}`)
    byBrand.set(key, has)
  }
  let withDetail = 0
  for (const has of byBrand.values()) {
    if (has) withDetail++
  }
  return { brands: byBrand.size, withDetail }
}

export function getTypesFromCache() {
  const all = allPesticideRecords()
  if (!all.length) return []
  return [...new Set(all.map(p => p.pesticideType).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
}

export async function getAvailableTypes() {
  if (USE_MOCK) return ['살균', '살충']
  const { totalCount } = await apiFetch({
    serviceCode: 'SVC01',
    serviceType: 'AA001',
    cropName: '감귤',
    cropCheck: 'Y',
    displayCount: 1,
    startPoint: 0,
  })
  const { list } = await apiFetch({
    serviceCode: 'SVC01',
    serviceType: 'AA001',
    cropName: '감귤',
    cropCheck: 'Y',
    displayCount: totalCount,
    startPoint: 0,
  })
  return [...new Set(list.map(i => i.useName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
}

export async function getPesticideDetail({ pestiCode, diseaseUseSeq } = {}) {
  if (USE_MOCK) return mockDetail(pestiCode)

  const { list } = await apiFetch({
    serviceCode: 'SVC02',
    pestiCode,
    diseaseUseSeq,
  })

  return normalizeDetail(list[0] ?? {})
}

// 전건 목록(SVC01)에 있는 모든 항목의 상세정보(SVC02)를 순차 조회해 캐시 + 공유 캐시에 저장한다.
// 이미 캐시된 항목은 건너뛴다(force=true면 전부 다시 가져옴).
// onProgress(done, total)로 진행 상황을 알릴 수 있다.
export async function warmAllDetails(force = false, onProgress = () => {}) {
  if (USE_MOCK) return
  const cached = loadCache(FULL_CACHE_KEY)
  const list = cached?.data ?? []
  let done = 0
  for (const item of list) {
    done++
    onProgress(done, list.length)
    if (!item.pestiCode || !item.diseaseUseSeq) continue
    const key = detailCacheKey(item.pestiCode, item.diseaseUseSeq)
    if (!force && loadCache(key)) continue
    try {
      const detail = await getPesticideDetail({ pestiCode: item.pestiCode, diseaseUseSeq: item.diseaseUseSeq })
      saveCache(key, detail)
      pushSharedCache(key, detail)
    } catch {}
  }
}

export function modeOfActionColor(code) {
  if (!code || code === '-') return 'var(--muted, #aaa)'
  const upper = code.toUpperCase()
  // FRAC 코드 (살균제)
  if (upper.startsWith('M')) return '#607d8b'     // 다부위접촉 (회색)
  if (upper === 'U' || upper === 'NC') return '#9e9e9e'
  const num = Number.parseInt(code)
  if (!Number.isNaN(num)) {
    if (num <= 3) return '#e53935'   // DMI 등 고위험 저항성 계열
    if (num <= 7) return '#f08a24'
    if (num <= 12) return '#43a047'
    return '#1976d2'
  }
  // IRAC 코드 (살충제): 1A, 4A, 28 등
  if (/^\d+[A-Z]$/.test(upper)) {
    const n = Number.parseInt(upper)
    if (n <= 4) return '#e53935'
    if (n <= 10) return '#f08a24'
    return '#1976d2'
  }
  return '#607d8b'
}

// ─── Mock Data ────────────────────────────────────────────────
// 실제 API 필드명 기준으로 작성 (키 승인 후 제거)

const MOCK_LIST = [
  {
    pestiCode: 'P0001', diseaseUseSeq: 'D001',
    name: '코사이드 WDG', brandName: '코사이드 WDG',
    ingredient: '수산화동 77.0%', targetPest: '궤양병',
    pesticideType: '살균', modeOfAction: 'M01',
    manufacturer: '동방아그로', applicationMethod: '경엽살포',
    dilution: '1,000배', preHarvestDays: '7', maxApplications: '4',
    cropName: '감귤', registDate: '20100315',
  },
  {
    pestiCode: 'P0002', diseaseUseSeq: 'D002',
    name: '스타너 유제', brandName: '스타너 유제',
    ingredient: '디페노코나졸 25.0%', targetPest: '더뎅이병, 궤양병',
    pesticideType: '살균', modeOfAction: '3',
    manufacturer: '신젠타', applicationMethod: '경엽살포',
    dilution: '2,000배', preHarvestDays: '14', maxApplications: '3',
    cropName: '감귤', registDate: '20080612',
  },
  {
    pestiCode: 'P0003', diseaseUseSeq: 'D003',
    name: '다코닐 수화제', brandName: '다코닐',
    ingredient: '클로로탈로닐 75.0%', targetPest: '검은점무늬병, 더뎅이병',
    pesticideType: '살균', modeOfAction: 'M05',
    manufacturer: '경농', applicationMethod: '경엽살포',
    dilution: '600배', preHarvestDays: '30', maxApplications: '3',
    cropName: '감귤', registDate: '19991201',
  },
  {
    pestiCode: 'P0004', diseaseUseSeq: 'D004',
    name: '스위치 입상수화제', brandName: '스위치',
    ingredient: '시프로디닐 37.5%+플루디옥소닐 25.0%', targetPest: '잿빛곰팡이병',
    pesticideType: '살균', modeOfAction: '9+12',
    manufacturer: '신젠타', applicationMethod: '경엽살포',
    dilution: '1,500배', preHarvestDays: '3', maxApplications: '2',
    cropName: '감귤', registDate: '20050820',
  },
  {
    pestiCode: 'P0005', diseaseUseSeq: 'D005',
    name: '벨쿠트 수화제', brandName: '벨쿠트',
    ingredient: '이프로디온 50.0%', targetPest: '더뎅이병, 잿빛곰팡이병',
    pesticideType: '살균', modeOfAction: '2',
    manufacturer: '바이엘', applicationMethod: '경엽살포',
    dilution: '1,000배', preHarvestDays: '30', maxApplications: '3',
    cropName: '감귤', registDate: '20020411',
  },
  {
    pestiCode: 'P0006', diseaseUseSeq: 'D006',
    name: '팔콘 유제', brandName: '팔콘',
    ingredient: '테부코나졸 16.7%+트리플록시스트로빈 8.3%', targetPest: '검은점무늬병',
    pesticideType: '살균', modeOfAction: '3+11',
    manufacturer: '바이엘', applicationMethod: '경엽살포',
    dilution: '2,000배', preHarvestDays: '14', maxApplications: '3',
    cropName: '감귤', registDate: '20121107',
  },
  {
    pestiCode: 'P0007', diseaseUseSeq: 'D007',
    name: '코니도 수화제', brandName: '코니도',
    ingredient: '이미다클로프리드 8.0%', targetPest: '귤굴나방, 진딧물, 깍지벌레',
    pesticideType: '살충', modeOfAction: '4A',
    manufacturer: '바이엘', applicationMethod: '경엽살포',
    dilution: '2,000배', preHarvestDays: '14', maxApplications: '3',
    cropName: '감귤', registDate: '20030509',
  },
  {
    pestiCode: 'P0008', diseaseUseSeq: 'D008',
    name: '버티맥 유제', brandName: '버티맥',
    ingredient: '아바멕틴 1.8%', targetPest: '귤응애, 점박이응애',
    pesticideType: '살충', modeOfAction: '6',
    manufacturer: '신젠타', applicationMethod: '경엽살포',
    dilution: '2,000배', preHarvestDays: '14', maxApplications: '3',
    cropName: '감귤', registDate: '20010301',
  },
  {
    pestiCode: 'P0009', diseaseUseSeq: 'D009',
    name: '스피네이트 액상수화제', brandName: '스피네이트',
    ingredient: '스피노사드 11.7%', targetPest: '귤굴나방, 귤응애',
    pesticideType: '살충', modeOfAction: '5',
    manufacturer: '다우아그로', applicationMethod: '경엽살포',
    dilution: '2,500배', preHarvestDays: '7', maxApplications: '3',
    cropName: '감귤', registDate: '20070614',
  },
  {
    pestiCode: 'P0010', diseaseUseSeq: 'D010',
    name: '아타라 입상수화제', brandName: '아타라',
    ingredient: '티아메톡삼 25.0%', targetPest: '진딧물, 총채벌레',
    pesticideType: '살충', modeOfAction: '4A',
    manufacturer: '신젠타', applicationMethod: '경엽살포',
    dilution: '4,000배', preHarvestDays: '7', maxApplications: '3',
    cropName: '감귤', registDate: '20090825',
  },
  {
    pestiCode: 'P0011', diseaseUseSeq: 'D011',
    name: '매치 유제', brandName: '매치',
    ingredient: '루페뉴론 5.0%', targetPest: '귤굴나방',
    pesticideType: '살충', modeOfAction: '15',
    manufacturer: '신젠타', applicationMethod: '경엽살포',
    dilution: '1,000배', preHarvestDays: '14', maxApplications: '2',
    cropName: '감귤', registDate: '20040317',
  },
  {
    pestiCode: 'P0012', diseaseUseSeq: 'D012',
    name: '보르도액 수화제', brandName: '보르도액',
    ingredient: '염기성황산구리 57.6%', targetPest: '궤양병, 흑점병',
    pesticideType: '살균', modeOfAction: 'M01',
    manufacturer: '농협케미컬', applicationMethod: '경엽살포',
    dilution: '400배', preHarvestDays: '30', maxApplications: '4',
    cropName: '감귤', registDate: '19980101',
  },
]

const MOCK_DETAILS = {
  P0001: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '77.0%', ingredient: '수산화동(Copper hydroxide)' },
  P0002: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '25.0%', ingredient: '디페노코나졸(Difenoconazole)' },
  P0003: { toxicName: '보통독성', fishToxic: '어독성Ⅰ', ingredientContent: '75.0%', ingredient: '클로로탈로닐(Chlorothalonil)' },
  P0004: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '37.5%+25.0%', ingredient: '시프로디닐(Cyprodinil)+플루디옥소닐(Fludioxonil)' },
  P0005: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '50.0%', ingredient: '이프로디온(Iprodione)' },
  P0006: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '16.7%+8.3%', ingredient: '테부코나졸(Tebuconazole)+트리플록시스트로빈(Trifloxystrobin)' },
  P0007: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '8.0%', ingredient: '이미다클로프리드(Imidacloprid)' },
  P0008: { toxicName: '저독성', fishToxic: '어독성Ⅰ', ingredientContent: '1.8%', ingredient: '아바멕틴(Abamectin)' },
  P0009: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '11.7%', ingredient: '스피노사드(Spinosad)' },
  P0010: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '25.0%', ingredient: '티아메톡삼(Thiamethoxam)' },
  P0011: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '5.0%', ingredient: '루페뉴론(Lufenuron)' },
  P0012: { toxicName: '저독성', fishToxic: '어독성Ⅱ', ingredientContent: '57.6%', ingredient: '염기성황산구리(Basic copper sulfate)' },
}

function mockSearch({ pestName, targetPest, pesticideType, page, pageSize }) {
  let filtered = MOCK_LIST
  if (pestName) {
    const q = pestName.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brandName.toLowerCase().includes(q) ||
      p.ingredient.toLowerCase().includes(q)
    )
  }
  if (targetPest) {
    const q = targetPest.toLowerCase()
    filtered = filtered.filter(p => p.targetPest.toLowerCase().includes(q))
  }
  if (pesticideType && pesticideType !== 'all') {
    filtered = filtered.filter(p => p.pesticideType === pesticideType)
  }
  const start = (page - 1) * pageSize
  return { total: filtered.length, list: filtered.slice(start, start + pageSize) }
}

function mockDetail(pestiCode) {
  const base = MOCK_LIST.find(p => p.pestiCode === pestiCode) ?? {}
  const extra = MOCK_DETAILS[pestiCode] ?? {}
  return {
    name: base.name,
    brandName: base.brandName,
    ingredient: extra.ingredient ?? base.ingredient,
    ingredientContent: extra.ingredientContent ?? '',
    pesticideType: base.pesticideType,
    manufacturer: base.manufacturer,
    toxicName: extra.toxicName ?? '',
    fishToxic: extra.fishToxic ?? '',
    cropName: base.cropName,
    targetPest: base.targetPest,
    applicationMethod: base.applicationMethod,
    dilution: base.dilution,
    preHarvestDays: base.preHarvestDays,
    maxApplications: base.maxApplications,
  }
}
