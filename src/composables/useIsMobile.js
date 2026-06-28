import { ref, onMounted, onUnmounted } from 'vue'

// 작은 화면(모바일) 여부를 반응형으로 제공한다. 기준폭은 레이아웃이 1열로 접히는 900px.
export function useIsMobile(query = '(max-width: 900px)') {
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
