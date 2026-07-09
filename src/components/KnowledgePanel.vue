<script setup>
import { ref } from 'vue'

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
    nameEn: 'Karahyang (Asami)',
    parentage: '서계 × 마코트 (Kara)',
    origin: '일본 육성, 한국 2000년대 초 도입',
    harvestPeriod: '12월 하순 ~ 1월 하순',
    brix: '12° Brix 이상',
    acidity: '0.9% 이하',
    weight: '200 ~ 350g',
    storageTemp: '4 ~ 6°C',
    color: '#e67e22',
    traits: [
      { label: '외관', value: '편구형, 표면 매끄러움, 과정부 돌출 없음' },
      { label: '과육', value: '과즙 매우 풍부, 씨 극히 적음(0~2개)' },
      { label: '향미', value: '독특하고 강한 향, 당도·산도 균형 양호' },
      { label: '내한성', value: '한라봉보다 약간 강함. 시설 재배 권장' },
      { label: '수세', value: '수세 약함, 가지 약해 착과 과다 시 가지 꺾임 주의' },
      { label: '착색', value: '착색 완료 전 당도 먼저 올라오는 경향' },
    ],
    notes: [
      '수확 후 2주 큐어링(7~10°C, 습도 85%)으로 당도 추가 상승 가능',
      '가지가 약해 착과 조기 조절이 중요 — 1차 적과를 늦추지 말 것',
      '향 성분(리모넨 등)은 저온 저장 중 서서히 농축됨, 출하 시기 조율 필요',
    ],
  },
}

const months = [
  {
    m: 12, label: '12월', stage: '성숙·수확 시작',
    tasks: ['카라향 수확 개시 (당도 12° 확인)', '기비(밑거름) 시작', '시설 보온 강화'],
    alert: '야간 3°C 이하 → 난방 가동',
  },
  {
    m: 1, label: '1월', stage: '한라봉 수확기',
    tasks: ['한라봉 수확 (브릭스 13° 이상)', '저온 저장 예냉 관리', '전정 계획 수립'],
    alert: '동해 방지 — 최저 −2°C 경보 시 즉각 조치',
  },
  {
    m: 2, label: '2월', stage: '수확 마무리·휴면',
    tasks: ['수확 마무리 및 저장고 정리', '전정 실시 (도장지·고사지 제거)', '토양 개량재 시용'],
    alert: null,
  },
  {
    m: 3, label: '3월', stage: '발아 전 준비',
    tasks: ['봄 방제 (석회유황합제 도포)', '전정 마무리', '배수로 점검·정비'],
    alert: '늦서리 주의 (3월 하순)',
  },
  {
    m: 4, label: '4월', stage: '발아·꽃눈 분화',
    tasks: ['꽃눈 분화 상태 점검', '봄 추비 1차 (질소 위주)', '관수 라인 점검 및 재개'],
    alert: null,
  },
  {
    m: 5, label: '5월', stage: '개화기',
    tasks: ['개화 상태 확인, 수분 관리', '병해충 예찰 강화 (귤굴나방 첫 발생)', '환기 관리로 꽃 수분 촉진'],
    alert: '개화기 강우·저온 → 착화 불량 위험',
  },
  {
    m: 6, label: '6월', stage: '유과기·적과',
    tasks: ['1차 적과 실시 (과다 착과 교정)', '귤녹균 예방 방제', '추비 2차 (칼리·인산 위주)'],
    alert: '장마 전 귤녹균 선제 방제',
  },
  {
    m: 7, label: '7월', stage: '과실 비대기',
    tasks: ['2차 적과 (한라봉 과당 5~7개 기준)', '관수량 증가 (증발산 최대기)', '응애·깍지벌레 방제'],
    alert: '고온 건조 → 응애 폭발적 증가 주의',
  },
  {
    m: 8, label: '8월', stage: '과실 비대 지속',
    tasks: ['관수 지속, 토양 수분 유지', '태풍 대비 (지주·고정 점검)', '엽면 시비 (칼슘·붕소)'],
    alert: '태풍 통과 후 즉시 방제 (상처 통한 감염)',
  },
  {
    m: 9, label: '9월', stage: '비대 완료·착색 준비',
    tasks: ['봉지 씌우기 (카라향 선택 시)', '관수량 점진적 감소 시작', '추비 3차 (인산 위주, 착색 촉진)'],
    alert: null,
  },
  {
    m: 10, label: '10월', stage: '착색기',
    tasks: ['시설 보온 설비 점검', '당도 측정 시작 (주 1회)', '야간 온도 관리 (10°C 이상 유지)'],
    alert: null,
  },
  {
    m: 11, label: '11월', stage: '착색 진행·품질 관리',
    tasks: ['브릭스·산도 주간 추적', '수확 컨테이너·저장고 준비', '최종 방제 (수확 전 안전 사용 기간 준수)'],
    alert: '야간 기온 5°C 이하 → 본격 보온 가동',
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

const fertilization = [
  {
    timing: '기비 (12~1월)',
    stage: '수확 후 ~ 휴면기',
    npk: 'N:P:K = 1:1:1 완효성',
    amount: '성목 기준 질소 150~200g/주',
    notes: '유기물(퇴비) 병용으로 토양 구조 개선. 시용 후 충분히 관수.',
  },
  {
    timing: '봄 추비 (3~4월)',
    stage: '발아 전 ~ 발아기',
    npk: 'N:P:K = 2:1:1 속효성',
    amount: '질소 70~100g/주',
    notes: '새순·꽃눈 분화 촉진. 질소 과다 시 도장지 발생 증가 주의.',
  },
  {
    timing: '여름 추비 (6~7월)',
    stage: '적과 후 ~ 과실 비대기',
    npk: 'N:P:K = 1:1:2 칼리 강화',
    amount: '칼리 80~120g/주',
    notes: '과실 비대·세포 충실에 칼리가 핵심. 질소 과다는 당도 저하 원인.',
  },
  {
    timing: '가을 추비 (9~10월)',
    stage: '착색 준비기',
    npk: 'N:P:K = 0.5:1.5:1 인산 강화',
    amount: '인산 60~80g/주',
    notes: '착색 촉진 및 당도 상승. 질소는 최소화 (착색 방해 가능).',
  },
  {
    timing: '엽면 시비 (수시)',
    stage: '생육 중',
    npk: '칼슘(Ca) · 붕소(B) · 마그네슘(Mg)',
    amount: '권장 배율 (제품별 상이)',
    notes: '칼슘: 열과 방지 / 붕소: 꽃 수정 촉진 / Mg: 황화 방지. 고온·직사광선 시간 엽면 시비 회피.',
  },
]

const irrigation = [
  { period: '1~3월', guide: '최소 관수', detail: '휴면~전정기. 토양이 심하게 건조할 때만 소량 관수. 과습은 뿌리 부패 유발.' },
  { period: '4~5월', guide: '발아기 적정 수분 공급', detail: '발아 시작 전 토양 수분 확인. 꽃눈 분화 촉진을 위해 이 시기 과도한 관수는 피함.' },
  { period: '6~7월', guide: '관수 증가', detail: '유과기~비대기. 토양 수분 50~60% 유지. 고온기에는 이른 아침 관수로 증발 손실 최소화.' },
  { period: '8월', guide: '최대 관수기', detail: '증발산량 최대. EC(전기전도도) 모니터링으로 염류 농도 관리. 점적관수 추천.' },
  { period: '9~10월', guide: '점진적 감수', detail: '관수량 20~30% 줄여 당 농축 유도. 급격한 감수는 열과 발생 — 서서히 감량.' },
  { period: '11~12월', guide: '최소 관수 (수확기)', detail: '수확 전 2~3주 관수 중단 또는 최소화로 당도 상승. 단, 시설 내 건조 시 소량 보충.' },
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

const brixGuide = [
  { stage: '6월 (적과 직전 유과)', hallabong: '—', karahyang: '—', note: '크기·무게 기준 적과' },
  { stage: '9월 중순', hallabong: '7~8°', karahyang: '8~9°', note: '비대 완료 기준치 확인' },
  { stage: '10월 중순', hallabong: '9~10°', karahyang: '10°', note: '착색 진행 중' },
  { stage: '11월 중순', hallabong: '11°', karahyang: '11.5°', note: '카라향 수확 준비 개시' },
  { stage: '12월 하순', hallabong: '12°', karahyang: '12° → 수확', note: '카라향 수확 기준 도달' },
  { stage: '1월 중순', hallabong: '13° → 수확', karahyang: '큐어링 중', note: '한라봉 수확 기준 도달' },
]
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
            <button :class="{ ghost: selectedVariety !== 'hallabong' }" @click="selectedVariety = 'hallabong'">한라봉</button>
            <button :class="{ ghost: selectedVariety !== 'karahyang' }" @click="selectedVariety = 'karahyang'">카라향</button>
          </div>
        </div>

        <div class="variety-hero">
          <div class="variety-title-row">
            <span class="variety-badge" :style="{ background: varieties[selectedVariety].color }">
              {{ varieties[selectedVariety].name }}
            </span>
            <span class="muted" style="font-size: 0.85rem;">{{ varieties[selectedVariety].nameEn }}</span>
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
            v-for="mon in months"
            :key="mon.m"
            class="month-card"
            :class="{ 'has-alert': !!mon.alert }"
          >
            <div class="month-header">
              <span class="month-num">{{ mon.label }}</span>
              <span class="month-stage">{{ mon.stage }}</span>
            </div>
            <ul class="month-tasks">
              <li v-for="task in mon.tasks" :key="task">{{ task }}</li>
            </ul>
            <p v-if="mon.alert" class="month-alert">⚠ {{ mon.alert }}</p>
          </div>
        </div>
      </article>

      <!-- 브릭스 추이 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">브릭스(당도) 추이 기준표</h2>
        <p class="muted" style="margin-bottom: 0.75rem; font-size: 0.85rem;">수확 결정의 핵심 지표입니다. 대표 과실 5~10개 평균값을 주 1회 기록하세요.</p>
        <div class="brix-table-wrap">
          <table class="brix-table">
            <thead>
              <tr>
                <th>시기</th>
                <th>한라봉</th>
                <th>카라향</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in brixGuide" :key="row.stage">
                <td>{{ row.stage }}</td>
                <td class="brix-val">{{ row.hallabong }}</td>
                <td class="brix-val">{{ row.karahyang }}</td>
                <td class="muted" style="font-size: 0.83rem;">{{ row.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
                <span class="pill" style="font-size: 0.73rem;">{{ pest.season }}</span>
              </div>
              <p class="muted" style="font-size: 0.83rem;">방제 기준: {{ pest.threshold }}</p>
              <p style="font-size: 0.85rem;">{{ pest.action }}</p>
            </li>
          </ul>
        </div>
      </article>

      <!-- 시비 가이드 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">시비 가이드 (성목 기준)</h2>
        <p class="muted" style="margin-bottom: 0.75rem; font-size: 0.85rem;">수세 · 토양 분석 결과에 따라 가감. 아래 수치는 10a(1,000m²) 기준 참고값입니다.</p>
        <ul class="list clean compact">
          <li v-for="fert in fertilization" :key="fert.timing" class="list-item card-like fert-item">
            <div class="fert-header">
              <strong>{{ fert.timing }}</strong>
              <span class="pill" style="font-size: 0.73rem;">{{ fert.stage }}</span>
            </div>
            <div class="fert-meta">
              <span class="meta-key">성분비</span><span>{{ fert.npk }}</span>
              <span class="meta-key">시용량</span><span>{{ fert.amount }}</span>
            </div>
            <p class="muted" style="font-size: 0.83rem;">{{ fert.notes }}</p>
          </li>
        </ul>
      </article>

      <!-- 관수 가이드 -->
      <article class="know-card" style="margin-top: 1rem;">
        <h2 style="margin-bottom: 0.75rem;">계절별 관수 가이드</h2>
        <ul class="list clean compact">
          <li v-for="irr in irrigation" :key="irr.period" class="list-item irr-item">
            <div class="irr-header">
              <span class="irr-period">{{ irr.period }}</span>
              <span class="irr-guide">{{ irr.guide }}</span>
            </div>
            <p class="muted" style="font-size: 0.83rem;">{{ irr.detail }}</p>
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
