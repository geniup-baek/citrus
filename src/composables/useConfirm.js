import { reactive } from 'vue'

// 전역 확인 모달 상태 (싱글톤). App에 마운트된 ConfirmDialog가 이 상태를 렌더한다.
export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
})

let resolver = null

// 확인 모달을 띄우고, 사용자의 선택(true/false)으로 resolve되는 Promise를 반환한다.
// 사용: if (await confirm({ message: '...' })) { ...삭제... }
export function confirm(opts = {}) {
  confirmState.title = opts.title || ''
  confirmState.message = opts.message || ''
  confirmState.confirmLabel = opts.confirmLabel || ''
  confirmState.cancelLabel = opts.cancelLabel || ''
  confirmState.open = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function resolveConfirm(result) {
  confirmState.open = false
  const r = resolver
  resolver = null
  if (r) r(result)
}
