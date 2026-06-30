// 농약안전정보시스템 OpenAPI (농촌진흥청)
// 신청처: https://pis.rda.go.kr (농약안전정보시스템 API 포털)
// 환경변수: VITE_AGRI_API_KEY
//
// SVC01: 농약등록정보 목록
//   필수: apiKey, serviceCode=SVC01, serviceType=AA001(XML)/AA002(Ajax)
//   선택: cropName, diseaseWeedName, pestiKorName, pestiBrandName, useName, compName
//   ※ serviceType에 JSON 옵션 없음 → resCd=02 병행 시도 (NCPMS와 동일 인프라 추정)
//
// SVC02: 농약등록정보 상세
//   필수: apiKey, serviceCode=SVC02, pestiCode, diseaseUseSeq (SVC01 응답에서 획득)

const API_KEY = import.meta.env.VITE_AGRI_API_KEY
const USE_MOCK = !API_KEY

// 실제 엔드포인트: API 키 수령 후 pis.rda.go.kr 또는 ncpms.rda.go.kr 확인 필요
// 프로덕션: netlify.toml에 /agri-api/* 프록시 규칙 추가 필요
const BASE_PATH = '/agri-api/npmsAPI/service'

function buildUrl(params = {}) {
  const sp = new URLSearchParams()
  sp.set('apiKey', API_KEY)
  sp.set('resCd', '02') // JSON 응답 시도 (미지원 시 XML 반환될 수 있음)
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') sp.set(k, String(v))
  }
  return `${BASE_PATH}?${sp}`
}

async function apiFetch(params) {
  const res = await fetch(buildUrl(params))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const svc = data?.service
  if (svc?.errorCode) throw new Error(`${svc.errorCode}: ${svc.errorMsg ?? '오류'}`)
  return data
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
    preHarvestDays: item.useSuittime ?? '',  // 예: "14"
    maxApplications: item.useNum ?? '',      // 예: "3"
    cropName: item.cropName ?? '감귤',
    registDate: item.applyFirstRegDate ?? '',
  }
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
    preHarvestDays: item.useSuittime ?? '',
    maxApplications: item.useNum ?? '',
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

  const data = await apiFetch({
    serviceCode: 'SVC01',
    serviceType: 'AA001',
    cropName: '감귤',
    cropCheck: 'Y',
    displayCount: pageSize,
    startPoint: (page - 1) * pageSize,
    ...(pestName && { pestiKorName: pestName }),
    ...(targetPest && { diseaseWeedName: targetPest, similarFlag: 'Y' }),
    ...(pesticideType && { useName: pesticideType }),
  })

  const raw = data?.service?.list ?? []
  const list = (Array.isArray(raw) ? raw : [raw]).map(normalizeListItem)
  return { total: Number(data?.service?.totalCount ?? list.length), list }
}

export async function getPesticideDetail({ pestiCode, diseaseUseSeq } = {}) {
  if (USE_MOCK) return mockDetail(pestiCode)

  const data = await apiFetch({
    serviceCode: 'SVC02',
    pestiCode,
    diseaseUseSeq,
  })

  const item = data?.service?.list?.[0] ?? data?.service ?? {}
  return normalizeDetail(item)
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
