<script setup>
import { ref, computed, watch } from 'vue'
import { useTreatmentStore } from '../stores/treatmentStore.js'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore.js'
import { useAvailablePesticideStore } from '../stores/availablePesticideStore.js'
import { getRecommendations, moaColor } from '../services/recommend.js'
import { formatPreHarvest, formatFishToxic, formatFishToxicBadge } from '../services/pesticide.js'
import { usePesticideInventoryStock } from '../composables/usePesticideInventoryStock.js'
import { categoryClass, toxicClass, fishToxicClass } from '../utils/pesticideBadgeClass.js'
import { today } from '../utils/dataExport.js'

const treatStore    = useTreatmentStore()
const settingsStore = useRecommendSettingsStore()
const apStore       = useAvailablePesticideStore()
const { inventoryStockMap, stockLotLabel, hasStock } = usePesticideInventoryStock()

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
</script>

<template>
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
    <button type="button" @click="runRecommend">추천 조회</button>
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
</template>

<style scoped>
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
  border-radius: var(--radius-panel);
  padding: 0.65rem 0.9rem;
}
.rec-ok { background: var(--tone-green-bg); border-color: var(--tone-green-border); }
.rec-ng { background: var(--tone-red-bg); border-color: var(--tone-red-border); opacity: 0.85; }

.rec-top { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
.rec-brand { font-weight: 600; font-size: 0.88rem; }
.rec-pests { font-size: 0.78rem; color: var(--muted); }
.rec-usecount { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; }
.rec-reasons { margin: 0.25rem 0 0; padding-left: 1.2rem; font-size: 0.8rem; color: #9a3412; }
.rec-reasons li { margin-bottom: 0.15rem; }

.ap-safety { font-size: 0.78rem; color: var(--muted); }
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
  background: var(--tone-green-bg);
  color: var(--tone-green-text);
  border: 1px solid var(--tone-green-border);
  border-radius: 999px;
  padding: 0.08rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
}

.empty-msg.small { padding: 0.75rem; text-align: left; }
.hint { font-size: 0.8rem; }
</style>
