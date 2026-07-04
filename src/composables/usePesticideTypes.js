import { computed } from 'vue'
import { useFarmStore } from '../stores/farmStore'

export function usePesticideTypes() {
  const store = useFarmStore()

  const typeList = computed(() => {
    const raw = store.state.appSettings?.pesticideTypes ?? []
    return raw.map(v => (typeof v === 'string' ? { name: v, abbr: '' } : v))
  })

  const typeNames = computed(() => typeList.value.map(p => p.name))

  // abbr (OpenAPI 용어) 또는 이미 표시명인 경우 모두 표시명으로 변환
  function resolveType(raw) {
    if (!raw) return ''
    const byAbbr = typeList.value.find(p => p.abbr && p.abbr === raw)
    if (byAbbr) return byAbbr.name
    const byName = typeList.value.find(p => p.name === raw)
    if (byName) return byName.name
    return raw.endsWith('제') ? raw : raw + '제'
  }

  return { typeList, typeNames, resolveType }
}
