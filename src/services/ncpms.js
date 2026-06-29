// NCPMS (국가농작물병해충관리시스템) OpenAPI 서비스
//
// 실제 엔드포인트: http://ncpms.rda.go.kr/npmsAPI/service?serviceCode=SVC0X
// 응답 구조: { "service": { "totalCount": N, "list": [...] } }
// 오류 구조: { "service": { "errorCode": "ERR_XXX", "errorMsg": "..." } }
//
// 확인된 서비스 코드 (감귤 기준):
//   SVC02 - 병해 검색 (requires cropName)
//   SVC03 - 해충 검색 (requires cropName)
//   SVC17~SVC25 - 예측·예찰 (ERR_104: 추가 권한 신청 필요)

const API_KEY = import.meta.env.VITE_NCPMS_API_KEY
const CROP_NAME = '감귤'
const SIDO_CODE = '50' // 제주특별자치도

function buildUrl(serviceCode, params = {}) {
  const base = import.meta.env.DEV ? '/ncpms-api' : 'https://ncpms.rda.go.kr'
  const sp = new URLSearchParams()
  sp.set('apiKey', API_KEY)
  sp.set('serviceCode', serviceCode)
  // serviceType이 명시된 서비스(SVC51 등)는 해당 값 사용, 아니면 resCd=02(JSON) 사용
  if (!params.serviceType) sp.set('resCd', '02')
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') sp.set(k, String(v))
  }
  return `${base}/npmsAPI/service?${sp}`
}

async function ncpmsFetch(serviceCode, params = {}) {
  if (!API_KEY) throw new Error('VITE_NCPMS_API_KEY 환경변수가 설정되지 않았습니다.')
  const res = await fetch(buildUrl(serviceCode, params))
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`)
  const data = await res.json()
  const svc = data?.service
  if (svc?.errorCode) {
    if (svc.errorCode === 'ERR_104') {
      throw new Error(
        'ERR_104: 해당 서비스에 접근 권한이 없습니다. NCPMS 사이트(ncpms.rda.go.kr)에서 예측·예찰 서비스 권한을 추가 신청해 주세요. (문의: 063-238-1055)',
      )
    }
    throw new Error(`${svc.errorCode}: ${svc.errorMsg ?? '파라미터 오류'}`)
  }
  return data
}

export function normalizeList(data) {
  const svc = data?.service
  if (!svc) return []
  // SVC53: structList가 배열, list는 Java toString 문자열 → structList 우선
  if (Array.isArray(svc.structList)) return svc.structList
  if (Array.isArray(svc.list)) return svc.list
  return []
}

export function totalCount(data) {
  return Number(data?.service?.totalCount ?? 0)
}

// ─── 병해충검색 ──────────────────────────────────────────────
// SVC01: 병 검색 (serviceType=AA003 필수, cropName 또는 sickNameKor 중 1개 이상)
// 응답: sickNameKor, sickNameChn, sickNameEng, thumbImg, oriImg, sickKey
export async function searchDiseases({ page = 1, pageSize = 10 } = {}) {
  return ncpmsFetch('SVC01', {
    serviceType: 'AA003',
    cropName: CROP_NAME,
    displayCount: pageSize,
    startPoint: (page - 1) * pageSize,
  })
}

// SVC05: 병 상세정보 (sickKey 필수)
// 응답: symptoms, preventionMethod, developmentCondition, infectionRoute,
//       biologyPrvnbeMth, chemicalPrvnbeMth, imageList
export async function getDiseaseDetail({ sickKey } = {}) {
  return ncpmsFetch('SVC05', { sickKey })
}

// SVC02: 병원체 검색 (serviceType=AA003 필수, cropName/sickNameKor/virusName 중 1개 이상)
// 응답: virusName, virusGroup, sickNameKor, thumbImg, oriImg, virusKey
export async function searchPathogens({ page = 1, pageSize = 10 } = {}) {
  return ncpmsFetch('SVC02', {
    serviceType: 'AA003',
    cropName: CROP_NAME,
    displayCount: pageSize,
    startPoint: (page - 1) * pageSize,
  })
}

// SVC06: 병원체 상세정보 (virusKey 필수)
// 응답: virusCharacteristic, virusAbbreviation, virusClass, virusSubspecies,
//       virusAuthor, literature, imageList
export async function getPathogenDetail({ virusKey } = {}) {
  return ncpmsFetch('SVC06', { virusKey })
}

// SVC03: 해충 검색 (serviceType=AA003 필수, cropName 또는 insectKorName 중 1개 이상)
// 응답: insectKorName, speciesName, thumbImg, oriImg, insectKey
export async function searchInsects({ page = 1, pageSize = 10 } = {}) {
  return ncpmsFetch('SVC03', {
    serviceType: 'AA003',
    cropName: CROP_NAME,
    displayCount: pageSize,
    startPoint: (page - 1) * pageSize,
  })
}

// SVC07: 해충 상세정보 (insectKey 필수)
// 응답: ecologyInfo, damageInfo, preventMethod, biologyPrvnbeMth, chemicalPrvnbeMth, imageList, enemyInsect
export async function getInsectDetail({ insectKey } = {}) {
  return ncpmsFetch('SVC07', { insectKey })
}


// ─── 병해충예측 ──────────────────────────────────────────────
// SVC31: 병해충예측지도 — 감귤(FT060614) 예측 모델 목록 + 현재 위험 단계(validAlarmRiskIdex)
// pestConfigStr 형식: "!+@+!" 구분자, pairs [COLOR|단계명, 설명] (높은 위험→낮은 위험 순서)
export async function getPrediction() {
  const proxyUrl = import.meta.env.DEV
    ? 'http://localhost:5173'
    : 'https://citrus-collab-2026.web.app'
  return ncpmsFetch('SVC31', {
    proxyUrl,
    div_id: 'pest-predict',
    address: '제주특별자치도',
    zoomLevel: 10,
    cropList: CITRUS_CROP_CODE,
  })
}

function parsePestStages(configStr) {
  if (!configStr) return []
  const parts = decodeURIComponent(configStr).split('!+@+!')
  const stages = []
  for (let i = 2; i < parts.length - 1; i += 2) {
    const pipeIdx = parts[i].indexOf('|')
    if (pipeIdx === -1) continue
    const name = parts[i].slice(pipeIdx + 1).replaceAll('&nbsp;', ' ').trim()
    const desc = (parts[i + 1] ?? '').replaceAll('&nbsp;', ' ').trim()
    if (name) stages.push({ name, desc })
  }
  return stages
}

function formatDriveDate(dt) {
  // YYYYMMDDHH → YYYY-MM-DD HH:00
  if (!dt || dt.length < 8) return dt ?? ''
  const hh = dt.slice(8, 10) || '00'
  return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)} ${hh}:00`
}

export function normalizePrediction(data) {
  return (data?.service?.pestModelByKncrList ?? [])
    .filter(m => m.kncrCode === CITRUS_CROP_CODE && m.useeAt === 'Y')
    .map(m => {
      const stages = parsePestStages(m.pestConfigStr)
      const riskIdx = Number(m.validAlarmRiskIdex ?? 0)
      // stages: 높은위험→낮은위험 순서이므로 현재 단계 = stages[stages.length - riskIdx]
      const currentStage = riskIdx > 0 ? (stages[stages.length - riskIdx] ?? null) : null
      return {
        code: m.dbyhsMdlCode,
        name: decodeURIComponent(m.dbyhsMdlNm),
        riskIdx,
        stageCount: stages.length,
        currentStage,
        stages,
        period: `${m.drveBeginMon}/${m.drveBeginDe} ~ ${m.drveEndMon}/${m.drveEndDe}`,
        lastRun: formatDriveDate(m.nowDrveDatetm),
      }
    })
}

// ─── 병해충예찰 ──────────────────────────────────────────────
// 감귤 작물코드: FT060614 (SVC02/SVC03 응답에서 확인)
const CITRUS_CROP_CODE = 'FT060614'

// SVC51: 병해충예찰검색 — 연도별 예찰 목록
// 응답: insectKey, examinYear, predictnSpchcknNm, kncrNm, examinSpchcknNm, examinTmrd, inputStdrDatetm
export async function getSurveillance({ year } = {}) {
  return ncpmsFetch('SVC51', {
    serviceType: 'AA003',
    searchExaminYear: year || String(new Date().getFullYear()),
    searchKncrCode: CITRUS_CROP_CODE,
  })
}

// SVC52: 병해충예찰검색상세(시도별) — insectKey로 시도별 발생 현황 조회
// 응답: insectKey, sidoCode, sidoNm, dbyhsNm, inqireValue
export async function getSurveillanceDetailBySido({ insectKey } = {}) {
  return ncpmsFetch('SVC52', {
    serviceType: 'AA003',
    insectKey,
  })
}

// SVC53: 병해충예찰검색상세(시군구별) — insectKey + sidoCode로 시군구별 발생 현황 조회
// 응답: insectKey, sidoCode, sigunguNm, dbyhsNm, inqireValue
export async function getSurveillanceDetailByGungu({ insectKey } = {}) {
  return ncpmsFetch('SVC53', {
    serviceType: 'AA003',
    insectKey,
    sidoCode: SIDO_CODE, // 50 = 제주특별자치도
  })
}
