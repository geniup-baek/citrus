<script setup>
import { ref, computed, watch } from 'vue'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'

const recSettingsStore = useRecommendSettingsStore()

const selectedVariety = ref('hallabong')

const varieties = {
  hallabong: {
    name: '한라봉',
    nameEn: 'Hallabong (Dekopon)',
    parentage: '키요미 탄고르 × 폰칸 만다린',
    origin: '일본 1972년 교배, 한국 1990년대 도입',
    harvestPeriod: '1월 중순 ~ 2월 중순',
    brix: '13° Brix 이상',
    acidity: '1.0% 이하',
    weight: '300 ~ 600g',
    storageTemp: '5 ~ 7°C',
    color: '#e8740a',
    traits: [
      { label: '외관', value: '과정부(꼭지 위) 돌출, 표면 요철이 뚜렷함' },
      { label: '과육', value: '과즙 풍부, 씨 없음, 중과피 약간 두꺼움' },
      { label: '향미', value: '진하고 달콤한 향, 산미 낮음' },
      { label: '내한성', value: '약함 (최저 −2°C). 시설 재배 필수' },
      { label: '수세', value: '강건, 격년결실 경향 있음' },
      { label: '착색', value: '11월 착색 시작, 내부 성숙은 1~2월' },
    ],
    notes: [
      '당도가 충분히 오르지 않으면 과피가 착색되어도 산미가 강하게 남음 — 수확 전 브릭스 확인 필수',
      '착과 부담이 크면 격년결실로 이어지므로 6월 적과를 철저히 시행',
      '저온 저장 전 7~10°C 예냉(2~3일) 후 본 저장으로 이행',
    ],
  },
  karahyang: {
    name: '카라향',
    nameEn: 'Kara mandarin (南津海)',
    parentage: '카라만다린 — 킹(King) 오렌지 × 오와리(Owari) 온주밀감 교잡종',
    origin: '일본 육성(1915년 교배), 한국 2008년 도입',
    harvestPeriod: '3월 중순 ~ 4월 중순(무가온 하우스) · 5월 상순 ~ 6월 중순(노지)',
    brix: '13 ~ 16° Brix',
    acidity: '수확 직후 산도 높은 편 — 후숙으로 낮아짐',
    weight: '200 ~ 350g',
    storageTemp: '4 ~ 6°C',
    color: '#e67e22',
    traits: [
      { label: '외관', value: '편구형, 표면이 다소 울퉁불퉁, 속껍질(중과피)이 두꺼운 편' },
      { label: '과육', value: '과즙 매우 풍부, 씨는 인근 수분수 유무에 따라 편차 있음' },
      { label: '향미', value: '수확 직후는 산미가 강하나 후숙 후 산미가 줄고 단맛·향이 살아남' },
      { label: '내한성', value: '한라봉보다 약간 강함. 시설(무가온 하우스) 재배 권장' },
      { label: '수세', value: '수세 약함, 가지 약해 착과 과다 시 가지 꺾임 주의' },
      { label: '착색', value: '착색 완료 후에도 나무에 달린 채로 계속 비대·숙성 진행' },
    ],
    notes: [
      '수확 직후는 산미가 강해 바로 유통하지 않고 후숙(큐어링) 과정을 거쳐 산미를 낮춘 뒤 출하',
      '가지가 약해 착과 조기 조절이 중요 — 1차 적과를 늦추지 말 것',
      '만감류 중 수확이 가장 늦어(하우스 3~4월, 노지 5~6월) 저장성이 길고 틈새 출하가 가능',
    ],
  },
  cheonhyehyang: {
    name: '천혜향',
    nameEn: 'Cheonhyehyang (Setoka, せとか)',
    parentage: '구치노쓰(청견 × 앙코르 2호) × 머콧(Murcott)',
    origin: '일본 육성(1984년 교배), 한국 2000년대 초 도입 · 2005년 "천혜향" 명칭 확정',
    harvestPeriod: '하우스 재배 1~4월(2~3월이 제철) · 노지는 3월 ~ 5월 초',
    brix: '13° Brix 이상',
    acidity: '1.0% 이하 (목표 기준)',
    weight: '250 ~ 350g',
    storageTemp: '5 ~ 7°C',
    color: '#a0522d',
    traits: [
      { label: '외관', value: '껍질이 얇고 매끄러워 손으로 벗기기 편함' },
      { label: '과육', value: '한라봉과 비슷한 크기, 과즙 풍부' },
      { label: '향미', value: '만감류 중 향이 가장 강한 편 — 자몽 같은 새콤달콤한 맛' },
      { label: '내한성', value: '약함 — 냉해를 입으면 쓴맛이 강해짐. 시설 재배 필수' },
    ],
    notes: [
      '냉해를 입으면 쓴맛이 강해지므로 시설 내 저온 방지가 특히 중요',
      '수확 후 서늘하고 통풍이 잘되는 곳에서 며칠 후숙하면 산미가 줄고 당도가 살아남',
      '만감류 중 향이 가장 강한 편이라 향을 중시하는 소비자에게 인기',
    ],
  },
}

const VARIETY_KEYS = Object.keys(varieties)

// 농장에서 재배 품종을 지정해 두면 그 품종만 표시하고, 지정이 없으면 전체를 보여준다.
const availableVarietyKeys = computed(() => {
  const grown = recSettingsStore.settings.grownVarieties
  if (!grown.length) return VARIETY_KEYS
  const filtered = VARIETY_KEYS.filter((key) => grown.includes(varieties[key].name))
  return filtered.length ? filtered : VARIETY_KEYS
})

watch(availableVarietyKeys, (keys) => {
  if (!keys.includes(selectedVariety.value)) selectedVariety.value = keys[0]
}, { immediate: true })

// stage/tasks/alert의 각 조각에 variety를 달아두면, 그 품종을 재배하지 않는 농장에는 숨긴다.
// variety가 없는 조각(일반 관리 작업)은 항상 표시한다.
const months = [
  {
    m: 12, label: '12월',
    stage: [{ text: '성숙·수확 시작' }],
    tasks: [
      { text: '카라향 착과 유지·비대 지속 (수확은 3~4월)', variety: 'karahyang' },
      { text: '기비(밑거름) 시작' },
      { text: '시설 보온 강화' },
    ],
    alert: { text: '야간 3°C 이하 → 난방 가동' },
  },
  {
    m: 1, label: '1월',
    stage: [
      { text: '한라봉 수확기', variety: 'hallabong' },
      { text: '천혜향 수확기', variety: 'cheonhyehyang' },
    ],
    tasks: [
      { text: '한라봉 수확 (브릭스 13° 이상)', variety: 'hallabong' },
      { text: '천혜향 수확 개시 (하우스, 브릭스 13° 이상)', variety: 'cheonhyehyang' },
      { text: '저온 저장 예냉 관리' },
      { text: '전정 계획 수립' },
    ],
    alert: { text: '동해 방지 — 최저 −2°C 경보 시 즉각 조치' },
  },
  {
    m: 2, label: '2월',
    stage: [
      { text: '수확 마무리·휴면' },
      { text: '천혜향 제철', variety: 'cheonhyehyang' },
    ],
    tasks: [
      { text: '한라봉 수확 마무리 및 저장고 정리', variety: 'hallabong' },
      { text: '천혜향 수확 지속 (제철, 냉해 주의)', variety: 'cheonhyehyang' },
      { text: '전정 실시 (도장지·고사지 제거)' },
      { text: '토양 개량재 시용' },
    ],
    alert: { text: '천혜향은 냉해를 입으면 쓴맛이 강해지므로 저온 특히 주의', variety: 'cheonhyehyang' },
  },
  {
    m: 3, label: '3월',
    stage: [
      { text: '발아 전 준비' },
      { text: '카라향 수확기', variety: 'karahyang' },
      { text: '천혜향 수확기', variety: 'cheonhyehyang' },
    ],
    tasks: [
      { text: '카라향 수확 개시 (무가온 하우스, 당도 13° 이상 확인)', variety: 'karahyang' },
      { text: '천혜향 수확 지속(노지는 이때부터 시작)', variety: 'cheonhyehyang' },
      { text: '봄 방제 (석회유황합제 도포)' },
      { text: '전정 마무리' },
      { text: '배수로 점검·정비' },
    ],
    alert: { text: '늦서리 주의 (3월 하순)' },
  },
  {
    m: 4, label: '4월',
    stage: [
      { text: '발아·꽃눈 분화' },
      { text: '카라향 수확 마무리', variety: 'karahyang' },
      { text: '천혜향 수확 마무리', variety: 'cheonhyehyang' },
    ],
    tasks: [
      { text: '카라향 수확 마무리 및 후숙 출하 준비', variety: 'karahyang' },
      { text: '천혜향 수확 마무리(노지는 5월 초까지)', variety: 'cheonhyehyang' },
      { text: '꽃눈 분화 상태 점검' },
      { text: '봄 추비 1차 (질소 위주)' },
      { text: '관수 라인 점검 및 재개' },
    ],
    alert: null,
  },
  {
    m: 5, label: '5월',
    stage: [{ text: '개화기' }],
    tasks: [
      { text: '개화 상태 확인, 수분 관리' },
      { text: '병해충 예찰 강화 (귤굴나방 첫 발생)' },
      { text: '환기 관리로 꽃 수분 촉진' },
    ],
    alert: { text: '개화기 강우·저온 → 착화 불량 위험' },
  },
  {
    m: 6, label: '6월',
    stage: [{ text: '유과기·적과' }],
    tasks: [
      { text: '1차 적과 실시 (과다 착과 교정)' },
      { text: '귤녹균 예방 방제' },
      { text: '추비 2차 (칼리·인산 위주)' },
    ],
    alert: { text: '장마 전 귤녹균 선제 방제' },
  },
  {
    m: 7, label: '7월',
    stage: [{ text: '과실 비대기' }],
    tasks: [
      { text: '2차 적과 (한라봉 과당 5~7개 기준)', variety: 'hallabong' },
      { text: '관수량 증가 (증발산 최대기)' },
      { text: '응애·깍지벌레 방제' },
    ],
    alert: { text: '고온 건조 → 응애 폭발적 증가 주의' },
  },
  {
    m: 8, label: '8월',
    stage: [{ text: '과실 비대 지속' }],
    tasks: [
      { text: '관수 지속, 토양 수분 유지' },
      { text: '태풍 대비 (지주·고정 점검)' },
      { text: '엽면 시비 (칼슘·붕소)' },
    ],
    alert: { text: '태풍 통과 후 즉시 방제 (상처 통한 감염)' },
  },
  {
    m: 9, label: '9월',
    stage: [{ text: '비대 완료·착색 준비' }],
    tasks: [
      { text: '봉지 씌우기 (카라향 선택 시)', variety: 'karahyang' },
      { text: '관수량 점진적 감소 시작' },
      { text: '추비 3차 (인산 위주, 착색 촉진)' },
    ],
    alert: null,
  },
  {
    m: 10, label: '10월',
    stage: [{ text: '착색기' }],
    tasks: [
      { text: '시설 보온 설비 점검' },
      { text: '당도 측정 시작 (주 1회)' },
      { text: '야간 온도 관리 (10°C 이상 유지)' },
    ],
    alert: null,
  },
  {
    m: 11, label: '11월',
    stage: [{ text: '착색 진행·품질 관리' }],
    tasks: [
      { text: '브릭스·산도 주간 추적' },
      { text: '수확 컨테이너·저장고 준비' },
      { text: '최종 방제 (수확 전 안전 사용 기간 준수)' },
    ],
    alert: { text: '야간 기온 5°C 이하 → 본격 보온 가동' },
  },
]

const pests = [
  {
    category: '해충',
    items: [
      { name: '점박이응애', season: '4~9월 (7~8월 최성기)', threshold: '잎당 2마리 이상', action: '살비제 로테이션 (계통 교대), 포식성 천적(칠레이리응애) 방사' },
      { name: '귤굴나방', season: '5~10월 (신초 발생기)', threshold: '새순 가해율 5% 이상', action: '스피네토람 등 신경계 약제, 신초 발생 시기에 집중 방제' },
      { name: '깍지벌레류', season: '5~8월', threshold: '1가지당 5마리 이상', action: '기계유 유제 (발생 초기), 등록 약제 (약충기 방제가 효과적)' },
      { name: '귤나방', season: '6~10월', threshold: '성페로몬 트랩 주 5마리 이상', action: '교미 교란제(페로몬 방산기), 약충 발화기 약제 방제' },
      { name: '총채벌레', season: '4~6월, 9~10월', threshold: '꽃당 1마리 이상', action: '황색·청색 끈끈이 트랩, 스피네토람 계열' },
    ],
  },
  {
    category: '병해',
    items: [
      { name: '귤녹균 (감귤 황화병)', season: '6~8월 (고온다습)', threshold: '발병 초기 육안 확인', action: '동제 약제 예방 위주, 발병 후 치료 어려움 — 환기·습도 관리 우선' },
      { name: '더뎅이병', season: '4~6월 (봄비 시기)', threshold: '새순·유과 가해 확인', action: '개화 전·후 동제 방제, 강우 후 재방제' },
      { name: '역병 (Phytophthora)', season: '7~9월 (장마·집중호우)', threshold: '과실 갈변·수피 갈변', action: '배수 관리 최우선, 메타락실 계열 토양 처리' },
      { name: '그을음병', season: '6~9월', threshold: '잎·과실 흑색 그을음 착생', action: '깍지벌레·진딧물 방제로 간접 억제 (분비물 제거)' },
    ],
  },
  {
    category: '환경 장해',
    items: [
      { name: '저온 동해', season: '12~2월', threshold: '시설 내 −2°C 이하', action: '이중 피복, 전열선 가온, 입구·측창 밀폐' },
      { name: '일소 (고온 장해)', season: '7~8월 (직사광선)', threshold: '과실 표면 40°C 이상', action: '차광망 (40~50%) 설치, 엽면 살수' },
      { name: '열과 (과실 갈라짐)', season: '9~10월 (강우 후)', threshold: '과피 균열 육안 확인', action: '수분 균일 공급 (관수량 조절), 칼슘 엽면 시비' },
    ],
  },
]

// varietyNotes: 특정 품종에만 해당하는 보충 설명. 그 품종을 재배하지 않는 농장에는 숨긴다.
const fertilization = [
  {
    timing: '기비 (12~1월)',
    stage: '수확 후 ~ 휴면기',
    npk: 'N:P:K = 1:1:1 완효성',
    amount: '성목 기준 질소 150~200g/주',
    notes: '유기물(퇴비) 병용으로 토양 구조 개선. 시용 후 충분히 관수.',
    varietyNotes: [
      { text: '카라향은 수확이 3~4월이라 기비 시기도 그만큼 늦춰야 함', variety: 'karahyang' },
      { text: '천혜향은 수확이 4월까지 이어지므로 기비 시기도 그만큼 늦춰야 함', variety: 'cheonhyehyang' },
    ],
  },
  {
    timing: '봄 추비 (3~4월)',
    stage: '발아 전 ~ 발아기',
    npk: 'N:P:K = 2:1:1 속효성',
    amount: '질소 70~100g/주',
    notes: '새순·꽃눈 분화 촉진. 질소 과다 시 도장지 발생 증가 주의.',
    varietyNotes: [],
  },
  {
    timing: '여름 추비 (6~7월)',
    stage: '적과 후 ~ 과실 비대기',
    npk: 'N:P:K = 1:1:2 칼리 강화',
    amount: '칼리 80~120g/주',
    notes: '과실 비대·세포 충실에 칼리가 핵심. 질소 과다는 당도 저하 원인.',
    varietyNotes: [],
  },
  {
    timing: '가을 추비 (9~10월)',
    stage: '착색 준비기',
    npk: 'N:P:K = 0.5:1.5:1 인산 강화',
    amount: '인산 60~80g/주',
    notes: '착색 촉진 및 당도 상승. 질소는 최소화 (착색 방해 가능).',
    varietyNotes: [
      { text: '카라향은 수확이 훨씬 늦어 이 시기엔 아직 비대 진행 중', variety: 'karahyang' },
    ],
  },
  {
    timing: '엽면 시비 (수시)',
    stage: '생육 중',
    npk: '칼슘(Ca) · 붕소(B) · 마그네슘(Mg)',
    amount: '권장 배율 (제품별 상이)',
    notes: '칼슘: 열과 방지 / 붕소: 꽃 수정 촉진 / Mg: 황화 방지. 고온·직사광선 시간 엽면 시비 회피.',
    varietyNotes: [],
  },
]

const irrigation = [
  { period: '1~3월', guide: '최소 관수', detail: '휴면~전정기. 토양이 심하게 건조할 때만 소량 관수. 과습은 뿌리 부패 유발.', varietyNotes: [] },
  { period: '4~5월', guide: '발아기 적정 수분 공급', detail: '발아 시작 전 토양 수분 확인. 꽃눈 분화 촉진을 위해 이 시기 과도한 관수는 피함.', varietyNotes: [] },
  { period: '6~7월', guide: '관수 증가', detail: '유과기~비대기. 토양 수분 50~60% 유지. 고온기에는 이른 아침 관수로 증발 손실 최소화.', varietyNotes: [] },
  { period: '8월', guide: '최대 관수기', detail: '증발산량 최대. EC(전기전도도) 모니터링으로 염류 농도 관리. 점적관수 추천.', varietyNotes: [] },
  {
    period: '9~10월', guide: '점진적 감수',
    detail: '관수량 20~30% 줄여 당 농축 유도. 급격한 감수는 열과 발생 — 서서히 감량.',
    varietyNotes: [
      { text: '카라향은 아직 비대기라 감수 시기가 아님', variety: 'karahyang' },
    ],
  },
  {
    period: '11~12월', guide: '최소 관수 (수확기)',
    detail: '수확 전 2~3주 관수 중단 또는 최소화로 당도 상승. 단, 시설 내 건조 시 소량 보충.',
    varietyNotes: [
      { text: '카라향은 수확이 3~4월이라 감수 시점도 2~3월경으로 늦춰야 함', variety: 'karahyang' },
    ],
  },
]

const checklist = {
  daily: [
    '시설 내 온도·습도 확인 (아침·저녁)',
    '이상 징후(황화엽, 갈변, 낙엽) 육안 점검',
    '관수 라인 누수·막힘 확인',
    '난방 장치 작동 확인 (동절기)',
  ],
  weekly: [
    '트랩(끈끈이, 페로몬) 포획 수 기록 및 교체',
    '토양 수분 센서 또는 손가락 확인(5cm 깊이)',
    '새순 가해 여부 (귤굴나방)',
    '대표 과실 5~10개 브릭스 측정 (수확기)',
    '작업 일지 정리',
  ],
  monthly: [
    '비료 재고 확인 및 시비 계획 점검',
    '농약 잔여량·유효기간 확인',
    '시설 피복 파손·밀폐 상태 점검',
    '배수 시스템 작동 점검',
    '생육 기록 사진 촬영 (과실 크기, 착색 비교)',
  ],
}

const selectedCheckTab = ref('daily')
const checkTabs = [
  { key: 'daily', label: '매일' },
  { key: 'weekly', label: '매주' },
  { key: 'monthly', label: '매월' },
]

// onlyVarieties: 이 행 자체가 특정 품종 전용 시기일 때(그중 하나도 재배하지 않으면 행 전체를 숨김).
// notes: 비고 조각들 — variety가 있으면 그 품종을 재배할 때만 표시.
// 천혜향 수치는 제주특별자치도농업기술원 「천혜향 재배기술」(2017) 무가온재배 월별 품질조사 기준.
const brixGuide = [
  { stage: '6월 (적과 직전 유과)', hallabong: '—', karahyang: '—', cheonhyehyang: '—', notes: [{ text: '크기·무게 기준 적과' }] },
  { stage: '9월 중순', hallabong: '7~8°', karahyang: '8~9°', cheonhyehyang: '7~8°', notes: [{ text: '비대 완료 기준치 확인' }] },
  { stage: '10월 중순', hallabong: '9~10°', karahyang: '10~11°', cheonhyehyang: '8~9°', notes: [{ text: '착색 진행 중' }] },
  {
    stage: '11월 중순', hallabong: '11°', karahyang: '11~12°', cheonhyehyang: '9~10°',
    notes: [
      { text: '한라봉 착색 마무리', variety: 'hallabong' },
      { text: '카라향은 계속 비대·숙성 중', variety: 'karahyang' },
      { text: '천혜향은 계속 비대·숙성 중', variety: 'cheonhyehyang' },
    ],
  },
  {
    stage: '12월 하순', hallabong: '12°', karahyang: '12~13°', cheonhyehyang: '10~11°',
    notes: [
      { text: '카라향은 나무에 달린 채 계속 숙성 (수확 아님)', variety: 'karahyang' },
      { text: '천혜향은 나무에 달린 채 계속 숙성 (수확 아님)', variety: 'cheonhyehyang' },
    ],
  },
  {
    stage: '1월 중순', hallabong: '13° → 수확', karahyang: '13~14°', cheonhyehyang: '11~12°',
    notes: [{ text: '한라봉 수확 기준 도달', variety: 'hallabong' }],
  },
  {
    stage: '3~4월 (하우스 기준)', hallabong: '—', karahyang: '13~16° → 수확', cheonhyehyang: '12~13° → 수확',
    onlyVarieties: ['karahyang', 'cheonhyehyang'],
    notes: [
      { text: '카라향 수확기. 노지 재배는 5~6월', variety: 'karahyang' },
      { text: '천혜향 수확기(무가온 하우스 기준). 노지 재배는 5월 초까지', variety: 'cheonhyehyang' },
    ],
  },
]

function isVarietyShown(key) {
  return !key || availableVarietyKeys.value.includes(key)
}
function joinShownText(fragments, sep = '·') {
  return fragments.filter((f) => isVarietyShown(f.variety)).map((f) => f.text).join(sep)
}

// 연간 생육 달력: 농장이 재배하지 않는 품종의 조각은 stage/tasks/alert에서 제외한다.
const filteredMonths = computed(() => months.map((mon) => ({
  ...mon,
  stageText: joinShownText(mon.stage),
  tasks: mon.tasks.filter((t) => isVarietyShown(t.variety)),
  alert: mon.alert && isVarietyShown(mon.alert.variety) ? mon.alert.text : null,
})))

// 브릭스 추이 기준표: 농장이 재배하지 않는 품종은 열을 통째로 숨기고, 그 품종들 전용 시기(onlyVarieties)는
// 그중 하나도 재배하지 않을 때만 행 자체를 숨긴다.
const showHallabongColumn = computed(() => isVarietyShown('hallabong'))
const showKarahyangColumn = computed(() => isVarietyShown('karahyang'))
const showCheonhyehyangColumn = computed(() => isVarietyShown('cheonhyehyang'))
const brixTableApplicable = computed(() =>
  showHallabongColumn.value || showKarahyangColumn.value || showCheonhyehyangColumn.value)
const filteredBrixGuide = computed(() => brixGuide
  .filter((row) => !row.onlyVarieties || row.onlyVarieties.some((v) => isVarietyShown(v)))
  .map((row) => ({ ...row, noteText: joinShownText(row.notes, ', ') })))

// 시비 가이드 / 관수 가이드: 품종 전용 보충 설명만 필터링(항목 자체는 모든 품종 공통이라 항상 표시).
const filteredFertilization = computed(() => fertilization.map((f) => ({
  ...f,
  varietyNoteText: joinShownText(f.varietyNotes, ' · '),
})))
const filteredIrrigation = computed(() => irrigation.map((i) => ({
  ...i,
  varietyNoteText: joinShownText(i.varietyNotes, ' · '),
})))
</script>

<template>
  <section class="page-grid know-grid">
    <!-- ── 왼쪽 ─────────────────────────────────────── -->
    <div class="knowledge-left">

      <!-- 품종 탭 -->
      <article class="know-card">
        <div class="row-actions align-start" style="margin-bottom: 1rem;">
          <h2>품종 특성</h2>
          <div class="inline-filters">
            <button v-for="key in availableVarietyKeys" :key="key" :class="{ ghost: selectedVariety !== key }" @click="selectedVariety = key">{{ varieties[key].name }}</button>
          </div>
        </div>

        <div class="variety-hero">
          <div class="variety-title-row">
            <span class="variety-badge" :style="{ background: varieties[selectedVariety].color }">
              {{ varieties[selectedVariety].name }}
            </span>
            <span class="muted text-sm">{{ varieties[selectedVariety].nameEn }}</span>
          </div>
          <div class="variety-meta-grid">
            <div class="variety-meta-item">
              <span class="meta-key">계통</span>
              <span>{{ varieties[selectedVariety].parentage }}</span>
            </div>
            <div class="variety-meta-item">
              <span class="meta-key">수확기</span>
              <span>{{ varieties[selectedVariety].harvestPeriod }}</span>
            </div>
            <div class="variety-meta-item">
              <span class="meta-key">목표 당도</span>
              <span class="highlight-val">{{ varieties[selectedVariety].brix }}</span>
            </div>
            <div class="variety-meta-item">
              <span class="meta-key">목표 산도</span>
              <span>{{ varieties[selectedVariety].acidity }}</span>
            </div>
            <div class="variety-meta-item">
              <span class="meta-key">과실 무게</span>
              <span>{{ varieties[selectedVariety].weight }}</span>
            </div>
            <div class="variety-meta-item">
              <span class="meta-key">저장 온도</span>
              <span>{{ varieties[selectedVariety].storageTemp }}</span>
            </div>
          </div>
        </div>

        <ul class="trait-list">
          <li v-for="trait in varieties[selectedVariety].traits" :key="trait.label" class="trait-item">
            <span class="trait-key">{{ trait.label }}</span>
            <span class="trait-val">{{ trait.value }}</span>
          </li>
        </ul>

        <div class="note-box" style="margin-top: 1rem;">
          <p v-for="n in varieties[selectedVariety].notes" :key="n" class="note-line">
            <span class="note-bullet">!</span>{{ n }}
          </p>
        </div>
      </article>

      <!-- 연간 생육 달력 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 1rem;">연간 생육 달력</h2>
        <div class="month-grid">
          <div
            v-for="mon in filteredMonths"
            :key="mon.m"
            class="month-card"
            :class="{ 'has-alert': !!mon.alert }"
          >
            <div class="month-header">
              <span class="month-num">{{ mon.label }}</span>
              <span class="month-stage">{{ mon.stageText }}</span>
            </div>
            <ul class="month-tasks">
              <li v-for="task in mon.tasks" :key="task.text">{{ task.text }}</li>
            </ul>
            <p v-if="mon.alert" class="month-alert">⚠ {{ mon.alert }}</p>
          </div>
        </div>
      </article>

      <!-- 브릭스 추이 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">브릭스(당도) 추이 기준표</h2>
        <p class="muted text-sm" style="margin-bottom: 0.75rem;">수확 결정의 핵심 지표입니다. 대표 과실 5~10개 평균값을 주 1회 기록하세요.</p>
        <div v-if="brixTableApplicable" class="brix-table-wrap">
          <table class="brix-table">
            <thead>
              <tr>
                <th>시기</th>
                <th v-if="showHallabongColumn">한라봉</th>
                <th v-if="showKarahyangColumn">카라향</th>
                <th v-if="showCheonhyehyangColumn">천혜향</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredBrixGuide" :key="row.stage">
                <td>{{ row.stage }}</td>
                <td v-if="showHallabongColumn" class="brix-val">{{ row.hallabong }}</td>
                <td v-if="showKarahyangColumn" class="brix-val">{{ row.karahyang }}</td>
                <td v-if="showCheonhyehyangColumn" class="brix-val">{{ row.cheonhyehyang }}</td>
                <td class="muted text-sm">{{ row.noteText }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted text-sm">선택한 재배 품종에 대한 당도 추이 자료가 아직 없습니다.</p>
      </article>
    </div>

    <!-- ── 오른쪽 ────────────────────────────────────── -->
    <div class="knowledge-right">

      <!-- 병해충 방제 -->
      <article class="know-card">
        <h2 style="margin-bottom: 0.75rem;">병해충 · 환경 장해 관리</h2>
        <div v-for="group in pests" :key="group.category" class="pest-group">
          <p class="pest-category-label">{{ group.category }}</p>
          <ul class="list clean compact">
            <li v-for="pest in group.items" :key="pest.name" class="list-item card-like pest-item">
              <div class="pest-name-row">
                <strong>{{ pest.name }}</strong>
                <span class="pill text-xs">{{ pest.season }}</span>
              </div>
              <p class="muted text-sm">방제 기준: {{ pest.threshold }}</p>
              <p style="font-size: 0.85rem;">{{ pest.action }}</p>
            </li>
          </ul>
        </div>
      </article>

      <!-- 시비 가이드 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">시비 가이드 (성목 기준)</h2>
        <p class="muted text-sm" style="margin-bottom: 0.75rem;">수세 · 토양 분석 결과에 따라 가감. 아래 수치는 10a(1,000m²) 기준 참고값입니다.</p>
        <ul class="list clean compact">
          <li v-for="fert in filteredFertilization" :key="fert.timing" class="list-item card-like fert-item">
            <div class="fert-header">
              <strong>{{ fert.timing }}</strong>
              <span class="pill text-xs">{{ fert.stage }}</span>
            </div>
            <div class="fert-meta">
              <span class="meta-key">성분비</span><span>{{ fert.npk }}</span>
              <span class="meta-key">시용량</span><span>{{ fert.amount }}</span>
            </div>
            <p class="muted text-sm">{{ fert.notes }}</p>
            <p v-if="fert.varietyNoteText" class="muted text-sm">{{ fert.varietyNoteText }}</p>
          </li>
        </ul>
      </article>

      <!-- 관수 가이드 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">계절별 관수 가이드</h2>
        <ul class="list clean compact">
          <li v-for="irr in filteredIrrigation" :key="irr.period" class="list-item irr-item">
            <div class="irr-header">
              <span class="irr-period">{{ irr.period }}</span>
              <span class="irr-guide">{{ irr.guide }}</span>
            </div>
            <p class="muted text-sm">{{ irr.detail }}</p>
            <p v-if="irr.varietyNoteText" class="muted text-sm">{{ irr.varietyNoteText }}</p>
          </li>
        </ul>
      </article>

      <!-- 현장 체크리스트 -->
      <article class="know-card" style="margin-top: 1rem;">
        <div class="row-actions align-start" style="margin-bottom: 0.75rem;">
          <h2>현장 체크리스트</h2>
          <div class="inline-filters">
            <button
              v-for="tab in checkTabs"
              :key="tab.key"
              :class="{ ghost: selectedCheckTab !== tab.key }"
              @click="selectedCheckTab = tab.key"
            >{{ tab.label }}</button>
          </div>
        </div>
        <ul class="checklist">
          <li v-for="item in checklist[selectedCheckTab]" :key="item" class="checklist-item">
            <span class="check-box">☐</span>{{ item }}
          </li>
        </ul>
      </article>

    </div>
  </section>
</template>

<style scoped>
.know-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}
.know-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 1rem 1.1rem;
}
.knowledge-left,
.knowledge-right {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.variety-hero { margin-bottom: 0.75rem; }
.variety-title-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; }
.variety-badge {
  display: inline-block;
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.2rem 0.75rem;
  border-radius: 999px;
}
.variety-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem 1rem;
}
.variety-meta-item { display: flex; gap: 0.4rem; font-size: 0.88rem; align-items: baseline; }
.meta-key { color: var(--text-muted); font-size: 0.8rem; white-space: nowrap; flex-shrink: 0; }
.highlight-val { font-weight: 700; color: var(--accent); }

.trait-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.trait-item { display: flex; gap: 0.6rem; font-size: 0.88rem; }
.trait-key {
  min-width: 3.5rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding-top: 0.05rem;
  flex-shrink: 0;
}
.trait-val { flex: 1; }

.note-box { background: var(--bg); border-radius: var(--radius); padding: 0.65rem 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
.note-line { display: flex; gap: 0.5rem; font-size: 0.85rem; }
.note-bullet {
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  background: var(--warning, #f39c12);
  color: #3d1f00;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.month-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.55rem 0.65rem;
  font-size: 0.83rem;
}
.month-card.has-alert { border-color: var(--warning, #f39c12); }
.month-header { display: flex; flex-direction: column; margin-bottom: 0.4rem; }
.month-num { font-weight: 700; font-size: 0.9rem; }
.month-stage { color: var(--text-muted); font-size: 0.75rem; }
.month-tasks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.month-tasks li::before { content: '·  '; color: var(--text-muted); }
.month-alert { margin-top: 0.4rem; font-size: 0.75rem; color: var(--warning, #e67e22); font-weight: 600; }

.brix-table-wrap { overflow-x: auto; }
.brix-table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
.brix-table th {
  text-align: left;
  padding: 0.4rem 0.6rem;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.brix-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); }
.brix-val { font-weight: 600; color: var(--accent); }

.pest-group { margin-bottom: 0.75rem; }
.pest-category-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.35rem;
}
.pest-item { flex-direction: column !important; align-items: flex-start !important; gap: 0.2rem; }
.pest-name-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.1rem; }

.fert-item { flex-direction: column !important; align-items: flex-start !important; gap: 0.2rem; }
.fert-header { display: flex; align-items: center; gap: 0.5rem; }
.fert-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  row-gap: 0.15rem;
  font-size: 0.84rem;
}

.irr-item { flex-direction: column; align-items: flex-start; gap: 0.15rem; padding: 0.55rem 0.65rem; }
.irr-header { display: flex; align-items: center; gap: 0.6rem; }
.irr-period { font-weight: 600; font-size: 0.9rem; white-space: nowrap; }
.irr-guide { color: var(--accent); font-size: 0.84rem; font-weight: 500; }

.checklist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.checklist-item { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.9rem; line-height: 1.4; }
.check-box { color: var(--text-muted); flex-shrink: 0; font-size: 1rem; }

@media (max-width: 900px) {
  .know-grid { grid-template-columns: 1fr; }
  .month-grid { grid-template-columns: repeat(2, 1fr); }
  .variety-meta-grid { grid-template-columns: 1fr; }
}
</style>
