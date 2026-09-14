<script setup>
// 모바일 전용 하단 시트의 기반 컴포넌트. MobileFilterBar/OverflowMenu 가 이걸 감싸 쓴다.
// 직접 쓸 일이 있다면: <BottomSheet v-model:open="open" title="...">내용<template #footer>…</template></BottomSheet>
import { ref, watch, onUnmounted } from 'vue'
import { useSheetBack } from '../composables/useSheetBack'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:open'])

// useSheetBack 이 직접 쓸 수 있게 로컬 ref 로 미러링한다(뒤로가기 시 이 ref 를 바로 끈다).
const openRef = ref(props.open)
watch(() => props.open, (v) => { openRef.value = v })
watch(openRef, (v) => { if (v !== props.open) emit('update:open', v) })
useSheetBack(openRef)

const panelEl = ref(null)
let restoreFocus = null

// 시트와 ConfirmDialog 가 동시에 뜰 수 있어(예: 시트 안에서 초기화 확인) 모듈
// 레벨 카운터로 스크롤 잠금을 겹쳐도 서로 풀지 않게 관리한다.
let locks = 0
let prevOverflow = ''
function lockScroll() {
  if (locks++ === 0) {
    prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
function unlockScroll() {
  if (locks > 0 && --locks === 0) {
    document.body.style.overflow = prevOverflow
  }
}

watch(() => props.open, (v) => {
  if (v) {
    restoreFocus = document.activeElement
    lockScroll()
    requestAnimationFrame(() => panelEl.value?.focus())
  } else {
    unlockScroll()
    restoreFocus?.focus?.()
    restoreFocus = null
  }
})

onUnmounted(() => {
  if (props.open) unlockScroll()
})

function close() {
  emit('update:open', false)
}
</script>

<template>
  <!-- .app-shell 의 진입 애니메이션(rise-in)이 로드 직후 잠깐 transform 을 걸기 때문에
       그 기준이 아니라 항상 뷰포트 기준으로 뜨도록 body 에 텔레포트한다. -->
  <Teleport to="body">
    <div v-if="open" class="sheet-overlay" @click.self="close">
      <div
        ref="panelEl"
        class="sheet-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        @keydown.esc="close"
      >
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="sheet-head">
          <h3 class="sheet-title">{{ title }}</h3>
          <button class="ghost icon-btn" type="button" aria-label="닫기" @click="close">✕</button>
        </div>
        <div class="sheet-body"><slot /></div>
        <div v-if="$slots.footer" class="sheet-footer"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1050; /* 라이트박스(1000) 위, ConfirmDialog(1100) 아래 */
  display: flex;
  align-items: flex-end;
}

.sheet-panel {
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: 1rem 1rem 0 0;
  padding: 0.5rem 1rem max(1rem, env(safe-area-inset-bottom));
  box-shadow: 0 -10px 30px rgba(104, 68, 20, 0.22);
  animation: sheet-up 0.18s ease-out;
}

@keyframes sheet-up {
  from { transform: translateY(12%); opacity: 0.6; }
  to { transform: none; opacity: 1; }
}

.sheet-handle {
  width: 2.5rem;
  height: 4px;
  border-radius: 999px;
  background: var(--line);
  margin: 0.35rem auto 0.65rem;
  flex-shrink: 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.sheet-title {
  margin: 0;
}

.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sheet-footer {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

.sheet-footer > * {
  flex: 1;
}
</style>
