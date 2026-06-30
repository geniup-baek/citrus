// 농약정보서비스 (공공데이터포털 / 농촌진흥청)
// 승인 후: VITE_AGRI_API_KEY 환경변수 설정 + USE_MOCK = false
//
// 실제 엔드포인트: http://apis.data.go.kr/1390802/AgriChemInfoService/
//   getPestiRegistList  - 농약등록목록 (cropName, pestiName)
//   getPestiApplyList   - 작물·병해충별 적용농약
//   getPestiInfoList    - 농약 상세정보
// 공통 파라미터: serviceKey, _type=json, numOfRows, pageNo

const USE_MOCK = !import.meta.env.VITE_AGRI_API_KEY

export async function searchPesticides({ pestName = '', targetPest = '', page = 1, pageSize = 20 } = {}) {
  if (USE_MOCK) return mockSearch({ pestName, targetPest, page, pageSize })

  const sp = new URLSearchParams({
    serviceKey: import.meta.env.VITE_AGRI_API_KEY,
    _type: 'json',
    cropName: '감귤',
    numOfRows: pageSize,
    pageNo: page,
  })
  if (pestName) sp.set('pestiName', pestName)
  if (targetPest) sp.set('pestiTrgtPest', targetPest)

  const res = await fetch(`/agri-api/1390802/AgriChemInfoService/getPestiRegistList?${sp}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const items = data?.response?.body?.items?.item ?? []
  return {
    total: data?.response?.body?.totalCount ?? 0,
    list: (Array.isArray(items) ? items : [items]).map(normalizeItem),
  }
}

function normalizeItem(item) {
  return {
    id: item.pestiRegstNo ?? item.regstNo,
    name: item.pestiNm ?? item.pestiName,
    ingredient: item.mainIngd ?? item.activeIngd,
    targetPest: item.pestiTrgtPest ?? item.targetPest,
    dilution: item.pestUseDilutRt ?? item.dilutionRate,
    period: item.useTimeCn ?? item.applicationPeriod,
    preHarvestDays: Number(item.sftyUsePrd ?? 0),
    modeOfActionCode: item.mefaCd ?? item.modeOfActionCode ?? '-',
    modeOfActionType: item.mefaType ?? '',
    manufacturer: item.mnfctNm ?? item.manufacturer ?? '',
    registNo: item.pestiRegstNo ?? '',
    pesticideType: item.pestiClCode ?? '',
  }
}

// ─── Mock Data ───────────────────────────────────────────────
// API 키 승인 후 제거

const MOCK_LIST = [
  {
    id: 'P001', name: '코사이드 WDG', ingredient: '수산화동 77.0%',
    targetPest: '궤양병', dilution: '1,000배', period: '발병 초부터 7~10일 간격',
    preHarvestDays: 7, modeOfActionCode: 'M01', modeOfActionType: '다부위접촉(구리)',
    manufacturer: '동방아그로', registNo: 'PD0000123', pesticideType: '살균',
  },
  {
    id: 'P002', name: '스타너 유제', ingredient: '디페노코나졸 25.0%',
    targetPest: '더뎅이병, 궤양병', dilution: '2,000배', period: '발병 초부터 10일 간격',
    preHarvestDays: 14, modeOfActionCode: '3', modeOfActionType: 'DMI계(트리아졸)',
    manufacturer: '신젠타', registNo: 'PD0000456', pesticideType: '살균',
  },
  {
    id: 'P003', name: '다코닐 수화제', ingredient: '클로로탈로닐 75.0%',
    targetPest: '검은점무늬병, 더뎅이병', dilution: '600배', period: '발병 전부터 예방적 살포',
    preHarvestDays: 30, modeOfActionCode: 'M05', modeOfActionType: '다부위접촉',
    manufacturer: '경농', registNo: 'PD0000789', pesticideType: '살균',
  },
  {
    id: 'P004', name: '스위치 입상수화제', ingredient: '시프로디닐 37.5%+플루디옥소닐 25.0%',
    targetPest: '잿빛곰팡이병', dilution: '1,500배', period: '발병 초 7~10일 간격',
    preHarvestDays: 3, modeOfActionCode: '9+12', modeOfActionType: '아닐리노피리미딘+페닐피롤',
    manufacturer: '신젠타', registNo: 'PD0001011', pesticideType: '살균',
  },
  {
    id: 'P005', name: '벨쿠트 수화제', ingredient: '이프로디온 50.0%',
    targetPest: '더뎅이병, 잿빛곰팡이병', dilution: '1,000배', period: '발병 전부터 7~14일 간격',
    preHarvestDays: 30, modeOfActionCode: '2', modeOfActionType: '디카복시미드계',
    manufacturer: '바이엘', registNo: 'PD0001213', pesticideType: '살균',
  },
  {
    id: 'P006', name: '코니도 수화제', ingredient: '이미다클로프리드 8.0%',
    targetPest: '귤굴나방, 진딧물, 깍지벌레', dilution: '2,000배', period: '발생 초기',
    preHarvestDays: 14, modeOfActionCode: '4A', modeOfActionType: '네오니코티노이드',
    manufacturer: '바이엘', registNo: 'PD0001415', pesticideType: '살충',
  },
  {
    id: 'P007', name: '버티맥 유제', ingredient: '아바멕틴 1.8%',
    targetPest: '귤응애, 점박이응애', dilution: '2,000배', period: '발생 초기',
    preHarvestDays: 14, modeOfActionCode: '6', modeOfActionType: '아버멕틴계',
    manufacturer: '신젠타', registNo: 'PD0001617', pesticideType: '살충',
  },
  {
    id: 'P008', name: '스피네이트 액상수화제', ingredient: '스피노사드 11.7%',
    targetPest: '귤굴나방, 귤응애', dilution: '2,500배', period: '발생 초기',
    preHarvestDays: 7, modeOfActionCode: '5', modeOfActionType: '스피노신계',
    manufacturer: '다우아그로', registNo: 'PD0001819', pesticideType: '살충',
  },
  {
    id: 'P009', name: '아타라 입상수화제', ingredient: '티아메톡삼 25.0%',
    targetPest: '진딧물, 총채벌레', dilution: '4,000배', period: '발생 초기',
    preHarvestDays: 7, modeOfActionCode: '4A', modeOfActionType: '네오니코티노이드',
    manufacturer: '신젠타', registNo: 'PD0002021', pesticideType: '살충',
  },
  {
    id: 'P010', name: '팔콘 유제', ingredient: '테부코나졸 16.7%+트리플록시스트로빈 8.3%',
    targetPest: '검은점무늬병, 더뎅이병', dilution: '2,000배', period: '발병 초부터 10~14일 간격',
    preHarvestDays: 14, modeOfActionCode: '3+11', modeOfActionType: 'DMI+QoI혼합',
    manufacturer: '바이엘', registNo: 'PD0002223', pesticideType: '살균',
  },
  {
    id: 'P011', name: '보르도액 수화제', ingredient: '염기성황산구리 57.6%',
    targetPest: '궤양병, 흑점병', dilution: '400배', period: '봄·가을 새순 전개기',
    preHarvestDays: 30, modeOfActionCode: 'M01', modeOfActionType: '다부위접촉(구리)',
    manufacturer: '농협케미컬', registNo: 'PD0002425', pesticideType: '살균',
  },
  {
    id: 'P012', name: '매치 유제', ingredient: '루페뉴론 5.0%',
    targetPest: '귤굴나방', dilution: '1,000배', period: '1세대 산란 초기',
    preHarvestDays: 14, modeOfActionCode: '15', modeOfActionType: '탈피억제(벤조일우레아)',
    manufacturer: '신젠타', registNo: 'PD0002627', pesticideType: '살충',
  },
]

function mockSearch({ pestName, targetPest, page, pageSize }) {
  let filtered = MOCK_LIST
  if (pestName) {
    const q = pestName.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) || p.ingredient.toLowerCase().includes(q)
    )
  }
  if (targetPest) {
    const q = targetPest.toLowerCase()
    filtered = filtered.filter(p => p.targetPest.toLowerCase().includes(q))
  }
  const start = (page - 1) * pageSize
  return {
    total: filtered.length,
    list: filtered.slice(start, start + pageSize),
  }
}

export function modeOfActionColor(code) {
  if (!code || code === '-') return 'var(--muted)'
  if (code.startsWith('M')) return '#607d8b'
  const num = parseInt(code)
  if (isNaN(num)) return '#607d8b'
  if (num <= 3) return '#e53935'
  if (num <= 7) return '#f08a24'
  if (num <= 12) return '#43a047'
  return '#1976d2'
}
