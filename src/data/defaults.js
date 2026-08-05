export const annualTaskTemplates = [
  // ── 겨울 (12~2월) ──────────────────────────────────────────────────────────
  {
    id: 'tpl-dec-facility',
    title: '동계 시설 보온 준비',
    recommendedMonth: 12,
    category: '시설',
    notes: '난방기·피복재·보온커튼 점검. 한파 대비 최저 온도(5℃ 이상) 유지 체계 확인.',
  },
  {
    id: 'tpl-dec-spray',
    title: '동계 방제',
    recommendedMonth: 12,
    category: '방제',
    notes: '월동 병해충 밀도 저하. 석회유황합제 살포 검토(낙엽 후 시행).',
  },
  {
    id: 'tpl-jan-harvest-close',
    title: '수확 마무리·선별·출하',
    recommendedMonth: 1,
    category: '저장·출하',
    notes: '한라봉·카라향 최종 수확 완료. 등급별 선별 후 저장·출하 관리.',
  },
  {
    id: 'tpl-jan-pruning-prep',
    title: '동계 전정 준비',
    recommendedMonth: 1,
    category: '전정',
    notes: '전정가위·톱 소독·정비. 수형 목표 설정 및 전정 순서 계획 수립.',
  },
  {
    id: 'tpl-feb-pruning',
    title: '동계 전정',
    recommendedMonth: 2,
    category: '전정',
    notes: '햇빛·통풍 개선을 위한 수형 정리. 약전지 → 강전지 순 진행. 절단면 도포제 처리.',
  },
  {
    id: 'tpl-feb-basal-fert',
    title: '동계 기비(밑거름)',
    recommendedMonth: 2,
    category: '시비',
    notes: '유기물 위주 균형 비료 투입(질소 감량). 전정 후 수세 회복 촉진.',
  },
  // ── 봄 (3~5월) ─────────────────────────────────────────────────────────────
  {
    id: 'tpl-mar-spring-fert',
    title: '봄 기비',
    recommendedMonth: 3,
    category: '시비',
    notes: '발아 전 균형 비료(N-P-K) 투입. 액비 관비와 병행 가능. EC 1.2~1.5 유지.',
  },
  {
    id: 'tpl-mar-pest-start',
    title: '병해충 예찰 개시',
    recommendedMonth: 3,
    category: '방제',
    notes: '월동 해충 서식 현황 확인. 응애·총채벌레 끈끈이 트랩 설치 및 기록 시작.',
  },
  {
    id: 'tpl-mar-irrigation-check',
    title: '관수 시스템 점검',
    recommendedMonth: 3,
    category: '관수',
    notes: '점적관 막힘·수압 불균일 점검. 관비 EC·pH 기준값 확인. 필터 세척.',
  },
  {
    id: 'tpl-apr-spray-1',
    title: '1차 방제',
    recommendedMonth: 4,
    category: '방제',
    notes: '응애·총채벌레 약제 방제. 개화 전 완료 필수. 살충제와 살균제 혼용 가능.',
  },
  {
    id: 'tpl-apr-bud-mgmt',
    title: '신초·발아 관리',
    recommendedMonth: 4,
    category: '생육관리',
    notes: '동별 발아율·신초 생장량 기록. 생장 불량 구간 파악 후 원인 분석.',
  },
  {
    id: 'tpl-may-drop-watch',
    title: '생리적 낙과 관찰',
    recommendedMonth: 5,
    category: '생육관리',
    notes: '1~2차 생리 낙과 시기. 과도 낙과 시 칼슘 엽면 시비 및 관수량 조절 검토.',
  },
  {
    id: 'tpl-may-spray-2',
    title: '2차 방제',
    recommendedMonth: 5,
    category: '방제',
    notes: '깍지벌레·굴나방 방제. 전착제 병용하여 약효 향상. 신초 보호 집중.',
  },
  // ── 초여름 (6~7월) ─────────────────────────────────────────────────────────
  {
    id: 'tpl-jun-thin-1',
    title: '1차 적과',
    recommendedMonth: 6,
    category: '적과',
    notes: '과다 착과 조절. 목표: 잎 25~30매당 과실 1개. 기형과·병충해 피해과 우선 제거.',
  },
  {
    id: 'tpl-jun-summer-prune',
    title: '도장지 여름 전정',
    recommendedMonth: 6,
    category: '전정',
    notes: '도장지·직립지 제거로 통풍 개선. 강전정 자제. 절단면 도포제 처리.',
  },
  {
    id: 'tpl-jun-spray-3',
    title: '3차 방제',
    recommendedMonth: 6,
    category: '방제',
    notes: '더뎅이병·검은점무늬병 예방 방제. 강우 후 7일 이내 살포 권장.',
  },
  {
    id: 'tpl-jul-thin-2',
    title: '2차 적과',
    recommendedMonth: 7,
    category: '적과',
    notes: '최종 착과량 조정. 변형과·소과·밀착과 제거. 과실 크기 균일화 목표.',
  },
  {
    id: 'tpl-jul-bag',
    title: '봉지 씌우기',
    recommendedMonth: 7,
    category: '봉지',
    notes: '착색·품질 보호용 봉지 작업. 방제 후 건조 확인 후 씌울 것. 적과 완료 후 진행.',
  },
  // ── 여름·가을 (8~11월) ──────────────────────────────────────────────────────
  {
    id: 'tpl-aug-fert',
    title: '하계 추비(칼리 증량)',
    recommendedMonth: 8,
    category: '시비',
    notes: '당도·착색 향상을 위한 칼리 중심 추비. 질소 과다 금지. 고형 비료 또는 액비 관비.',
  },
  {
    id: 'tpl-aug-spray-4',
    title: '4차 방제',
    recommendedMonth: 8,
    category: '방제',
    notes: '여름철 병해(더뎅이병·갈색부패병) 방제. 봉지 내부 상태 확인 병행.',
  },
  {
    id: 'tpl-sep-coloring',
    title: '착색 관리',
    recommendedMonth: 9,
    category: '생육관리',
    notes: '과면 착색 진행 상황 동별 기록. 야간 온도 15~18℃ 유지. 관수량 점진적 감소.',
  },
  {
    id: 'tpl-sep-calcium',
    title: '칼슘·붕소 엽면 시비',
    recommendedMonth: 9,
    category: '시비',
    notes: '과피 장해(엽소·거피) 예방. 칼슘제 0.3~0.5% 희석 엽면 살포. 이른 아침 시행.',
  },
  {
    id: 'tpl-oct-brix',
    title: '수확 전 당도 측정',
    recommendedMonth: 10,
    category: '측정',
    notes: '동별 3~5개 샘플링. 브릭스 13° 이상 확인 후 수확 일정 확정. 산도 측정 병행.',
  },
  {
    id: 'tpl-oct-spray-5',
    title: '5차 방제(수확 전)',
    recommendedMonth: 10,
    category: '방제',
    notes: '수확 전 안전성 확보. 농약 안전 사용 기준 준수. 수확 전 안전 간격 엄수.',
  },
  {
    id: 'tpl-nov-harvest',
    title: '주요 수확기',
    recommendedMonth: 11,
    category: '수확',
    notes: '한라봉·카라향 본격 수확. 선별·등급 분류·저장 병행. 상처 과실 별도 관리.',
  },
]

export const defaultFacilities = [
  {
    id: 'house-1',
    name: '1동',
    notes: '한라봉·카라향 혼식 구역.',
  },
  {
    id: 'house-2',
    name: '2동',
    notes: '오전 습도 높음, 환기 상태 주의 관찰.',
  },
  {
    id: 'house-3',
    name: '3동',
    notes: '일조량 많음, 관수 관리 집중.',
  },
  {
    id: 'house-4',
    name: '4동',
    notes: '통풍 양호, 시범 재배 적합 구역.',
  },
]

export const defaultSeedlings = [
  {
    id: 'seedling-1',
    greenhouseId: 'house-1',
    variety: '한라봉',
    plantedAt: '2025-03-20',
    rootstock: '탱자',
    notes: '개화 안정적, 착과율 고름.',
  },
  {
    id: 'seedling-2',
    greenhouseId: 'house-1',
    variety: '카라향',
    plantedAt: '2025-03-20',
    rootstock: '시트란지',
    notes: '겨울철 온도 관리 철저히.',
  },
  {
    id: 'seedling-3',
    greenhouseId: 'house-2',
    variety: '한라봉',
    plantedAt: '2025-03-23',
    rootstock: '탱자',
    notes: '건조기 응애 발생 주의.',
  },
  {
    id: 'seedling-4',
    greenhouseId: 'house-2',
    variety: '카라향',
    plantedAt: '2025-03-23',
    rootstock: '시트란지',
    notes: '표준 관비 조건에서 생육 양호.',
  },
]

export const defaultTasks = [
  {
    id: 'task-1',
    title: '점적관 수압 점검',
    dueDate: '2026-06-22',
    frequency: '매주',
    category: '관수',
    priority: '보통',
    notes: '필터 세척 및 에미터 막힘 여부 확인.',
    status: '예정',
    progress: 0,
    logs: [],
  },
  {
    id: 'task-2',
    title: '굴나방 예찰',
    dueDate: '2026-06-24',
    frequency: '매주',
    category: '방제',
    priority: '높음',
    notes: '가장자리 열 집중 점검. 끈끈이 트랩 교체 간격 7일.',
    status: '진행중',
    progress: 30,
    logs: [
      {
        date: '2026-06-21T09:30:00.000Z',
        note: '가장자리 열 일부 피해 확인. 끈끈이 트랩 교체 완료.',
      },
    ],
  },
]

export const defaultScheduleRules = [
  {
    id: 'schedule-1',
    title: '주간 습도 점검',
    category: '환경',
    frequency: '매주',
    interval: 1,
    dayOfWeek: 1,
    dayOfMonth: 1,
    startDate: '2026-06-01',
    endDate: '',
    enabled: true,
  },
  {
    id: 'schedule-2',
    title: '월간 양액 EC 교정',
    category: '관수',
    frequency: '매월',
    interval: 1,
    dayOfWeek: 1,
    dayOfMonth: 5,
    startDate: '2026-06-01',
    endDate: '',
    enabled: true,
  },
]

export const defaultAncillaries = [
  {
    id: 'ancillary-1',
    name: '자재 창고',
    type: '창고',
    notes: '농기구·자재·농약 보관.',
  },
  {
    id: 'ancillary-2',
    name: '작업자 숙소',
    type: '숙소',
    notes: '수확기 임시 거주 공간.',
  },
]

export const defaultAppSettings = {
  ancillaryTypes: ['창고', '숙소', '사무실', '기타'],
  equipmentTypes: ['방제기', '트랙터', '관리기', '양수기', '선별기', '예초기', '기타'],
  seedlingVarieties: ['한라봉', '카라향', '천혜향'],
  rootstockTypes: ['탱자', '시트란지', '유자', '당귤', '기타'],
  taskCategories: ['방제', '시비', '관수', '전정', '적과', '봉지', '수확', '저장·출하', '생육관리', '측정', '환경', '시설', '토양', '기타'],
  pesticideTypes: [
    { name: '살충제',    abbr: '살충' },
    { name: '살균제',    abbr: '살균' },
    { name: '살비제',    abbr: '' },
    { name: '제초제',    abbr: '제초' },
    { name: '살균살충제', abbr: '균충' },
    { name: '생장조정제', abbr: '생조' },
    { name: '기타제',    abbr: '기타' },
  ],
}

export const defaultScheduleSettings = {
  generationDays: 21,
  duplicatePolicy: 'rule-and-date',
}

export const defaultIssues = [
  {
    id: 'issue-1',
    title: '이른 아침 고습도',
    greenhouseId: 'house-2',
    occurredAt: '2026-06-18',
    status: '해결',
    symptoms: '잎 표면 결로 발생 및 증산 저하.',
    resolutionSteps: [
      {
        date: '2026-06-18T22:00:00.000Z',
        note: '일출 30분 전 환기구 개방 시간 앞당김.',
      },
      {
        date: '2026-06-20T22:00:00.000Z',
        note: '순환팬 매 시간 15분 가동 사이클 추가.',
      },
    ],
    photos: [],
  },
]

export const defaultInventory = [
  {
    id: 'inv-1',
    name: '복합비료 21-17-17',
    category: '비료',
    pesticideType: '',
    actionGroup: '',
    productName: '복합비료(21-17-17)',
    notes: '봄·여름 기비/추비용 균형 비료.',
    txns: [
      { id: 'inv-1-t1', date: '2026-03-05T01:00:00.000Z', type: '입고', volume: '20kg', expiryDate: '', amount: 20, note: '봄 영농철 대비 입고.' },
      { id: 'inv-1-t2', date: '2026-04-10T02:00:00.000Z', type: '사용', volume: '20kg', expiryDate: '', amount: 8, note: '봄 기비 살포(전 재배동).' },
    ],
  },
  {
    id: 'inv-2',
    name: '근사미',
    category: '농약',
    pesticideType: '제초제',
    actionGroup: '9',
    productName: '글루포시네이트암모늄 액제',
    notes: '비선택성 제초제. 규격·유효기간별로 재고 분리 관리.',
    txns: [
      { id: 'inv-2-t1', date: '2026-05-02T01:00:00.000Z', type: '입고', volume: '500ml', expiryDate: '2026-10-31', amount: 2, note: '봄 제초 대비 입고.' },
      { id: 'inv-2-t2', date: '2026-05-02T01:05:00.000Z', type: '입고', volume: '500ml', expiryDate: '2027-10-31', amount: 1, note: '신규 로트 입고.' },
      { id: 'inv-2-t3', date: '2026-05-02T01:10:00.000Z', type: '입고', volume: '300ml', expiryDate: '2026-10-31', amount: 1, note: '소포장 입고.' },
    ],
  },
  {
    id: 'inv-3',
    name: '올스타',
    category: '농약',
    pesticideType: '살충제',
    actionGroup: '6',
    productName: '아바멕틴 유제',
    notes: '응애·총채벌레 방제용 살충제. 안전사용기준 준수.',
    txns: [
      { id: 'inv-3-t1', date: '2026-04-01T01:00:00.000Z', type: '입고', volume: '500ml', expiryDate: '2027-08-31', amount: 4, note: '1차 방제 대비 입고.' },
      { id: 'inv-3-t2', date: '2026-04-15T02:00:00.000Z', type: '사용', volume: '500ml', expiryDate: '2027-08-31', amount: 2, note: '1차 방제 살포.' },
    ],
  },
  {
    id: 'inv-4',
    name: '다이센엠45',
    category: '농약',
    pesticideType: '살균제',
    actionGroup: 'M3',
    productName: '만코제브 수화제',
    notes: '더뎅이병·검은점무늬병 예방 살균제. 유효기간 임박.',
    txns: [
      { id: 'inv-4-t1', date: '2026-03-10T01:00:00.000Z', type: '입고', volume: '1kg', expiryDate: '2026-07-31', amount: 6, note: '예방 방제용 입고.' },
      { id: 'inv-4-t2', date: '2026-06-05T02:00:00.000Z', type: '사용', volume: '1kg', expiryDate: '2026-07-31', amount: 1, note: '3차 방제 살포.' },
    ],
  },
]
