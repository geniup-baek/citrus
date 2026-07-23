import { watch, onUnmounted } from 'vue'

// 사진 확대(라이트박스) 표시 중 브라우저의 "뒤로가기" 제스처/버튼이 페이지 이동이
// 아니라 확대 사진 닫기로 동작하도록 한다.
// 라이트박스를 열 때 히스토리 항목을 하나 쌓아두고, 그 상태에서 뒤로가기가 들어오면
// (popstate) 이미 우리가 쌓아둔 항목을 소비한 것이므로 실제 페이지 이동 없이
// 확대 사진만 닫는다. 사용자가 직접 닫기/배경 클릭으로 닫을 때는 반대로 쌓아둔
// 히스토리 항목을 되돌려(history.back) 다음 실제 뒤로가기가 헛돌지 않게 한다.
export function useLightboxBack(photoRef) {
  let pushedByUs = false

  function handlePopState() {
    if (photoRef.value) {
      pushedByUs = false // 브라우저가 이미 소비했으므로 우리 쪽에서 다시 되돌리지 않는다
      photoRef.value = null
    }
  }

  window.addEventListener('popstate', handlePopState)
  onUnmounted(() => window.removeEventListener('popstate', handlePopState))

  watch(photoRef, (val, prev) => {
    if (val && !prev) {
      history.pushState({ lightbox: true }, '')
      pushedByUs = true
    } else if (!val && prev && pushedByUs) {
      pushedByUs = false
      history.back()
    }
  })
}
