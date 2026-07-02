<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTreatmentStore } from '../stores/treatmentStore.js'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore.js'
import { LOCAL_PESTICIDES, findByBrandName, getUniquePests } from '../data/localPesticides.js'
import { getRecommendations, moaColor, getMoaGroups } from '../services/recommend.js'

const treatStore = useTreatmentStore()
const settingsStore = useRecommendSettingsStore()

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
const formError = ref('')
const saving    = ref(false)
const editingId     = ref(null)   // null = 신규, string = 편집 중인 record id
const deleteConfirm = ref(null)
const formEl        = ref(null)   // form DOM ref for scroll

const allBrandNames = LOCAL_PESTICIDES.map(p => p.brandName)

let suppressBrandWatch = false
watch(fBrand, (val) => {
  if (suppressBrandWatch) { suppressBrandWatch = false; return }
  const found = findByBrandName(val)
  fMoa.value      = found?.moa ?? ''
  fCategory.value = found?.category ?? ''
})

function resetForm() {
  editingId.value = null
  fDate.value     = today()
  fBrand.value    = ''
  fMoa.value      = ''
  fCategory.value = ''
  fPest.value     = ''
  fMemo.value     = ''
  formError.value = ''
  deleteConfirm.value = null
}

function startEdit(t) {
  suppressBrandWatch  = true
  editingId.value     = t.id
  fDate.value         = t.date
  fBrand.value        = t.brandName
  fMoa.value          = t.moa      ?? ''
  fCategory.value     = t.category ?? ''
  fPest.value         = t.targetPest ?? ''
  fMemo.value         = t.memo       ?? ''
  formError.value     = ''
  deleteConfirm.value = null
  formEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function submitTreatment() {
  formError.value = ''
  if (!fDate.value)  { formError.value = '날짜를 입력하세요.'; return }
  if (!fBrand.value) { formError.value = '농약을 선택하세요.'; return }
  saving.value = true
  const record = {
    date:       fDate.value,
    brandName:  fBrand.value,
    moa:        fMoa.value,
    category:   fCategory.value,
    targetPest: fPest.value.trim(),
    memo:       fMemo.value.trim(),
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

async function confirmDelete(id) {
  if (deleteConfirm.value === id) {
    if (editingId.value === id) resetForm()
    await treatStore.deleteTreatment(id)
    deleteConfirm.value = null
  } else {
    deleteConfirm.value = id
  }
}

function formatDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

// ── 농약 추천 Tab ──────────────────────────────────────────────────────────
const recPest   = ref('')
const recResult = ref(null)
const uniquePests = getUniquePests()

function runRecommend() {
  if (!recPest.value.trim()) { recResult.value = null; return }
  recResult.value = getRecommendations({
    targetPest: recPest.value.trim(),
    treatments: treatStore.treatments,
    settings:   settingsStore.settings,
    today:      today(),
  })
}

// 이력이 바뀌면 추천 결과도 갱신
watch(() => treatStore.treatments.length, () => {
  if (recResult.value) runRecommend()
})

// ── computed helpers ───────────────────────────────────────────────────────
const categoryClass = (cat) => ({
  '살균제': 'cat-fungicide',
  '살비제': 'cat-miticide',
  '살충제': 'cat-insecticide',
}[cat] ?? '')

onMounted(() => treatStore.init())
</script>

<template>
  <div class="card recommend-view">
    <div class="view-header">
      <h2>농약 방제 추천</h2>
      <p class="subtitle">방제 이력 기반 작용기작 중복 방지 · 구입 가능 농약 목록 기준</p>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'history' }"   @click="activeTab = 'history'">방제 이력</button>
      <button class="tab-btn" :class="{ active: activeTab === 'recommend' }" @click="activeTab = 'recommend'">농약 추천</button>
      <button class="tab-btn" :class="{ active: activeTab === 'settings' }"  @click="activeTab = 'settings'">추천 설정</button>
    </div>

    <!-- ═══ 방제 이력 ═══════════════════════════════════════════════════════ -->
    <section v-if="activeTab === 'history'">
      <div ref="formEl" class="form-card" :class="{ 'form-card-editing': editingId }">
        <div class="form-card-header">
          <span class="form-card-title">{{ editingId ? '이력 편집' : '새 기록' }}</span>
          <button v-if="editingId" class="cancel-btn" @click="resetForm">취소</button>
        </div>
        <div class="form-row">
          <label>날짜</label>
          <input type="date" v-model="fDate" />
        </div>
        <div class="form-row">
          <label>농약</label>
          <input
            v-model="fBrand"
            list="brand-list"
            placeholder="상표명 입력 또는 선택"
            autocomplete="off"
          />
          <datalist id="brand-list">
            <option v-for="n in allBrandNames" :key="n" :value="n" />
          </datalist>
        </div>
        <div v-if="fMoa" class="form-row form-info">
          <label>작용기작</label>
          <span>
            <span class="moa-badge" :style="{ background: moaColor(fMoa) }">{{ fMoa }}</span>
            <span class="cat-badge" :class="categoryClass(fCategory)">{{ fCategory }}</span>
          </span>
        </div>
        <div class="form-row">
          <label>방제 대상</label>
          <input v-model="fPest" list="pest-list" placeholder="예: 귤굴나방" autocomplete="off" />
          <datalist id="pest-list">
            <option v-for="p in uniquePests" :key="p" :value="p" />
          </datalist>
        </div>
        <div class="form-row">
          <label>메모</label>
          <input v-model="fMemo" placeholder="희석배수, 날씨, 구역 등 (선택)" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <button class="primary-btn" :disabled="saving" @click="submitTreatment">
          {{ saving ? '저장 중...' : (editingId ? '저장' : '기록 추가') }}
        </button>
      </div>

      <!-- History list -->
      <div v-if="treatStore.treatments.length === 0" class="empty-msg">
        방제 이력이 없습니다. 위 양식으로 기록을 추가하세요.
      </div>
      <div v-else class="history-list">
        <div
          v-for="t in treatStore.treatments"
          :key="t.id"
          class="history-card"
          :class="{ 'history-card-editing': editingId === t.id }"
        >
          <div class="history-top">
            <span class="history-date">{{ formatDate(t.date) }}</span>
            <span class="moa-badge" :style="{ background: moaColor(t.moa) }">{{ t.moa || '—' }}</span>
            <span class="cat-badge" :class="categoryClass(t.category)">{{ t.category }}</span>
            <div class="history-actions">
              <button
                class="action-btn"
                :class="{ 'action-btn-active': editingId === t.id }"
                @click="editingId === t.id ? resetForm() : startEdit(t)"
              >{{ editingId === t.id ? '편집 중' : '편집' }}</button>
              <button
                class="del-btn"
                :class="{ 'del-btn-confirm': deleteConfirm === t.id }"
                @click="confirmDelete(t.id)"
                :title="deleteConfirm === t.id ? '한 번 더 누르면 삭제됩니다' : '삭제'"
              >{{ deleteConfirm === t.id ? '확인' : '삭제' }}</button>
            </div>
          </div>
          <div class="history-brand">{{ t.brandName }}</div>
          <div v-if="t.targetPest || t.memo" class="history-meta">
            <span v-if="t.targetPest">{{ t.targetPest }}</span>
            <span v-if="t.targetPest && t.memo" class="sep">·</span>
            <span v-if="t.memo" class="history-memo">{{ t.memo }}</span>
          </div>
        </div>
      </div>
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
          <option v-for="p in uniquePests" :key="p" :value="p" />
        </datalist>
        <button class="primary-btn" @click="runRecommend">추천 조회</button>
      </div>

      <div v-if="!recResult" class="empty-msg">
        방제 대상을 입력하고 추천 조회를 눌러주세요.<br>
        <span class="hint">설정의 제약사항이 반영됩니다 (현재 {{ settingsStore.settings.moaConflictDays }}일 이내 작용기작 중복 제외).</span>
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
              <div v-for="p in recResult.recommended" :key="p.brandName" class="rec-card rec-ok">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="moa-badge" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                </div>
                <div class="rec-pests">{{ p.targetPests.join(', ') }}</div>
                <div v-if="p.useCount > 0" class="rec-usecount">올해 {{ p.useCount }}회 사용</div>
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
              <div v-for="p in recResult.excluded" :key="p.brandName" class="rec-card rec-ng">
                <div class="rec-top">
                  <span class="rec-brand">{{ p.brandName }}</span>
                  <span class="moa-badge moa-faded" :style="{ background: moaColor(p.moa) }">{{ p.moa }}</span>
                  <span class="cat-badge" :class="categoryClass(p.category)">{{ p.category }}</span>
                </div>
                <ul class="rec-reasons">
                  <li v-for="(r, i) in p.reasons" :key="i">{{ r }}</li>
                </ul>
              </div>
            </div>
          </div>
        </template>
      </template>
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
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.max(14, settingsStore.settings.moaConflictDays - 7)">−</button>
            <span class="days-value">{{ settingsStore.settings.moaConflictDays }}일</span>
            <button class="ghost days-btn" @click="settingsStore.settings.moaConflictDays = Math.min(180, settingsStore.settings.moaConflictDays + 7)">+</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>연간 최대 사용 횟수 제한</span>
            <span class="setting-hint">동일 농약이 설정 횟수 이상 사용된 경우 제외</span>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="settingsStore.settings.enforceMaxApplications" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div v-if="settingsStore.settings.enforceMaxApplications" class="setting-row setting-sub">
          <div class="setting-label">
            <span>최대 허용 횟수</span>
          </div>
          <div class="setting-control days-control">
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.max(1, settingsStore.settings.maxApplicationsPerYear - 1)">−</button>
            <span class="days-value">{{ settingsStore.settings.maxApplicationsPerYear }}회/년</span>
            <button class="ghost days-btn" @click="settingsStore.settings.maxApplicationsPerYear = Math.min(10, settingsStore.settings.maxApplicationsPerYear + 1)">+</button>
          </div>
        </div>

        <div class="setting-reset">
          <button class="ghost" @click="settingsStore.reset()">기본값으로 초기화</button>
        </div>
      </div>

      <div class="settings-note">
        <p>수확 전 안전기간 · 독성 등급 필터는 농약정보서비스 API 데이터 연동 시 추가 지원 예정입니다.</p>
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
.form-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 1rem 1.1rem;
  margin-bottom: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.form-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 0.5rem;
}
.form-row label { font-size: 0.82rem; color: var(--muted); }
.form-info { font-size: 0.82rem; }
.form-info span { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.form-error { font-size: 0.82rem; color: var(--danger, #dc2626); }
.primary-btn {
  align-self: flex-end;
  padding: 0.45rem 1.2rem;
  background: var(--primary);
  color: var(--primary-ink);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  cursor: pointer;
  font-weight: 600;
}
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── History list ── */
.history-list { display: flex; flex-direction: column; gap: 0.55rem; }
.history-card {
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  padding: 0.7rem 1rem;
}
.history-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}
.history-date { font-size: 0.82rem; color: var(--muted); min-width: 72px; }
.history-brand { font-weight: 600; font-size: 0.9rem; }
.history-meta { font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; display: flex; gap: 0.35rem; flex-wrap: wrap; }
.history-memo { font-style: italic; }
.sep { opacity: 0.4; }

/* ── Form edit mode ── */
.form-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}
.form-card-title { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
.form-card-editing {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
}
.cancel-btn {
  font-size: 0.78rem;
  color: var(--muted);
  background: none;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  padding: 0.15rem 0.6rem;
  cursor: pointer;
}
.cancel-btn:hover { color: var(--text); border-color: var(--muted); }

/* ── History card actions ── */
.history-actions { margin-left: auto; display: flex; gap: 0.3rem; }
.action-btn {
  font-size: 0.75rem;
  color: var(--primary);
  background: none;
  border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
  border-radius: 0.4rem;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.action-btn-active { background: color-mix(in srgb, var(--primary) 12%, transparent); }
.history-card-editing { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, var(--bg-soft)); }

.del-btn {
  font-size: 0.75rem;
  color: var(--muted);
  background: none;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.del-btn-confirm { color: #dc2626; border-color: #fca5a5; background: #fff1f2; }

/* ── MOA / category badges ── */
.moa-badge {
  display: inline-block;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.moa-faded { opacity: 0.55; }
.cat-badge {
  font-size: 0.68rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid;
}
.cat-fungicide  { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.cat-insecticide { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
.cat-miticide   { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }

/* ── Recommend ── */
.rec-search { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
.rec-search input { flex: 1; min-width: 180px; }

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

.days-control { display: flex; align-items: center; gap: 0.5rem; }
.days-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
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

.settings-note {
  margin-top: 0.75rem;
  font-size: 0.78rem;
  color: var(--muted);
  padding: 0.5rem 0.75rem;
  border-left: 2px solid var(--line);
}
.settings-note p { margin: 0; }

/* ── Shared ── */
.empty-msg { color: var(--muted); font-size: 0.875rem; text-align: center; padding: 2rem; line-height: 1.6; }
.empty-msg.small { padding: 0.75rem; text-align: left; }
.hint { font-size: 0.8rem; }
</style>
