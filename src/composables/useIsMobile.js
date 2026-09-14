import { ref, onMounted, onUnmounted } from 'vue'

// "모바일" 경계폭. src/style.css 의 `@media (max-width: 900px)` 블록(터치 타깃 확대·
// 필터 행 가로 스크롤·헤더 sticky)과 반드시 같은 값이어야 한다 — 여기서 쓰는 값이 바뀌면
// 그 순간 폼 Teleport 시점과 CSS 모바일 레이아웃 전환 시점이 어긋난다.
// (참고: 레이아웃이 2열→1열로 접히는 기준은 1080px 로 이것과는 다르다.)
export const MOBILE_MEDIA_QUERY = '(max-width: 900px)'

// 작은 화면(모바일) 여부를 반응형으로 제공한다.
export function useIsMobile(query = MOBILE_MEDIA_QUERY) {
  const isMobile = ref(false)
  let mql = null
  const update = () => {
    isMobile.value = mql ? mql.matches : false
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    update()
    mql.addEventListener('change', update)
  })

  onUnmounted(() => {
    if (mql) mql.removeEventListener('change', update)
  })

  return { isMobile }
}
