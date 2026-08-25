<script setup>
import { computed, ref } from 'vue'
import { useFarmStore } from '../stores/farmStore'
import { useTreatmentStore } from '../stores/treatmentStore'
import { useRecommendSettingsStore } from '../stores/recommendSettingsStore'
import { useAppPolicyStore } from '../stores/appPolicyStore'
import { confirm } from '../composables/useConfirm'

const store = useFarmStore()
const treatStore = useTreatmentStore()
const recSettingsStore = useRecommendSettingsStore()
const policyStore = useAppPolicyStore()

const actorNameInput = ref(store.actorName)

function saveActorName() {
  store.setActorName(actorNameInput.value)
  actorNameInput.value = store.actorName
}

const historyEntityFilter = ref('전체')

const historyEntities = computed(() => {
  const seen = new Set()
  for (const entry of store.state.changeLog || []) seen.add(entry.entity)
  return ['전체', ...seen]
})

const filteredChangeLog = computed(() => {
  const list = Array.isArray(store.state.changeLog) ? store.state.changeLog : []
  return historyEntityFilter.value === '전체'
    ? list
    : list.filter((entry) => entry.entity === historyEntityFilter.value)
})

const historyActionLabels = {
  add: '추가',
  update: '수정',
  delete: '삭제',
  'stock-in': '입고',
  'stock-out': '사용',
}

function historyActionLabel(action) {
  return historyActionLabels[action] || action
}

function historyActionClass(action) {
  return `history-badge-${action}`
}

function formatHistoryAt(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const showChangeLogDeleteButton = computed(() =>
  policyStore.policy.enableChangeLogDeleteFeature && recSettingsStore.settings.showChangeLogDeleteButtons,
)

// 수정은 그때 바뀐 필드를, 삭제는 저장해둔 스냅샷을 되돌릴 수 있을 때만 버튼을 보여준다.
function canRevertEntry(entry) {
  if (entry.action === 'update') return !!(entry.refId && entry.fields)
  if (entry.action === 'delete') return !!entry.snapshot
  return false
}

const revertingId = ref('')
const revertMessage = ref('')

// 방제이력은 farmStore가 아니라 treatmentStore 소속이라 entity로 분기해서 되돌린다.
async function revertHistoryEntry(entry) {
  const ok = await confirm({
    message: '이 변경을 되돌립니다. 되돌리는 것도 새 변경 이력으로 남습니다. 계속할까요?',
    confirmLabel: '되돌리기',
  })
  if (!ok) return
  revertingId.value = entry.id
  revertMessage.value = ''
  try {
    const result = entry.entity === '방제이력'
      ? await treatStore.revertTreatmentLogEntry(entry)
      : await store.revertChangeLogEntry(entry.id)
    revertMessage.value = result.ok ? '되돌렸습니다.' : (result.reason || '되돌리지 못했습니다.')
  } finally {
    revertingId.value = ''
  }
}

async function removeChangeLogEntry(id) {
  const ok = await confirm({ message: '이 변경 이력 항목을 삭제합니다. 되돌릴 수 없습니다.' })
  if (!ok) return
  await store.removeChangeLogEntry(id)
}

async function clearAllChangeLog() {
  const total = store.state.changeLog?.length ?? 0
  if (!total) return
  const ok = await confirm({
    title: '변경 이력 삭제 확인',
    message: `변경 이력 ${total}건을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`,
    confirmLabel: '전체 삭제',
  })
  if (!ok) return
  await store.clearChangeLog()
}
</script>

<template>
  <div class="sub-card">
    <div class="settings-group-head">
      <h3>내 이름 표시</h3>
    </div>
    <p class="muted settings-group-hint">
      이 기기에서 변경 이력에 남길 이름입니다. 로그인 없이 기기에만 저장되며, 다른 기기와 공유되지 않습니다.
    </p>
    <div class="row-actions">
      <input
        v-model="actorNameInput"
        class="settings-edit-input"
        type="text"
        placeholder="예: 홍길동"
        style="max-width: 14rem;"
        @keydown.enter.prevent="saveActorName"
        @blur="saveActorName"
      />
      <button class="ghost compact-btn" type="button" @click="saveActorName">저장</button>
    </div>
  </div>

  <div class="sub-card">
    <div class="settings-group-head">
      <h3>변경 이력</h3>
      <div class="row-actions">
        <span class="pill">{{ filteredChangeLog.length }}건</span>
        <button
          v-if="showChangeLogDeleteButton && store.state.changeLog?.length"
          class="danger compact-btn"
          type="button"
          @click="clearAllChangeLog"
        >전체 삭제</button>
      </div>
    </div>
    <p class="muted settings-group-hint">
      재배동·시설장비·묘목·작업·문제·재고·사용법·방제이력의 추가·수정·삭제 및 입출고 기록입니다. 최근 300건까지 보관됩니다.
      수정·삭제 기록 중 되돌릴 정보가 남아있는 항목은 "되돌리기"로 이전 상태로 복원할 수 있습니다.
    </p>
    <p v-if="revertMessage" class="muted text-sm">{{ revertMessage }}</p>

    <div class="inline-filters history-filters">
      <button
        v-for="entity in historyEntities"
        :key="entity"
        type="button"
        :class="{ ghost: historyEntityFilter !== entity }"
        @click="historyEntityFilter = entity"
      >{{ entity }}</button>
    </div>

    <ul v-if="filteredChangeLog.length" class="list clean compact history-list">
      <li v-for="entry in filteredChangeLog" :key="entry.id" class="list-item">
        <div class="history-item">
          <span class="pill">{{ entry.entity }}</span>
          <span class="history-badge" :class="historyActionClass(entry.action)">{{ historyActionLabel(entry.action) }}</span>
          <span class="history-name">{{ entry.name }}</span>
          <span class="muted history-meta">
            {{ formatHistoryAt(entry.at) }}<template v-if="entry.actor"> · {{ entry.actor }}</template>
          </span>
          <button
            v-if="canRevertEntry(entry)"
            class="ghost compact-btn"
            type="button"
            :disabled="revertingId === entry.id"
            title="이 변경을 되돌리기"
            @click="revertHistoryEntry(entry)"
          >{{ revertingId === entry.id ? '되돌리는 중...' : '되돌리기' }}</button>
          <button
            v-if="showChangeLogDeleteButton"
            class="ghost compact-btn history-delete-btn"
            type="button"
            title="이 항목 삭제"
            @click="removeChangeLogEntry(entry.id)"
          >삭제</button>
        </div>
        <p v-if="entry.detail" class="muted history-detail">{{ entry.detail }}</p>
      </li>
    </ul>
    <p v-else class="muted text-sm">아직 기록된 변경 이력이 없습니다.</p>
  </div>
</template>
