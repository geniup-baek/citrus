import { watch, onUnmounted } from 'vue'

// composables/useLightboxBack.js 와 의도적으로 거의 동일한 쌍둥이 파일이다 —
// 라이트박스는 photoRef(null이면 닫힘), 시트는 openRef(false면 닫힘)로 "닫힘"의
// 표현이 달라 하나로 합치면 오히려 양쪽 호출부에 조건 분기가 생긴다. 로직을 바꿀
// 일이 생기면 두 파일 모두 확인할 것.
//
// 바텀시트가 열려 있는 동안 브라우저의 "뒤로가기" 제스처/버튼이 페이지 이동이
// 아니라 시트 닫기로 동작하도록 한다. 자세한 동작 원리는 useLightboxBack.js 주석 참고.
export function useSheetBack(openRef) {
  let pushedByUs = false

  function handlePopState() {
    if (openRef.value) {
      pushedByUs = false // 브라우저가 이미 소비했으므로 우리 쪽에서 다시 되돌리지 않는다
      openRef.value = false
    }
  }

  window.addEventListener('popstate', handlePopState)
  onUnmounted(() => window.removeEventListener('popstate', handlePopState))

  watch(openRef, (val, prev) => {
    if (val && !prev) {
      history.pushState({ sheet: true }, '')
      pushedByUs = true
    } else if (!val && prev && pushedByUs) {
      pushedByUs = false
      history.back()
    }
  })
}
