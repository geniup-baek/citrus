// 농장 재고 중 "농약" 카테고리 항목 + 로트별 현재 재고 계산.
// 방제이력·농약추천·가용농약 탭이 전부 이 파생값을 각자 계산해 갖고 있던 것을 여기로 모았다.
import { computed } from 'vue'
import { useFarmStore } from '../stores/farmStore'

export function usePesticideInventoryStock() {
  const farmStore = useFarmStore()

  const inventoryPesticides = computed(() =>
    (farmStore.state?.inventory ?? []).filter((i) => i.category === '농약'),
  )

  // 재고 수량 맵: item.name → [{vol, expiry, qty}] (로트별 재고 > 0인 것만)
  const inventoryStockMap = computed(() => {
    const map = {}
    for (const item of inventoryPesticides.value) {
      const byLot = {}
      for (const t of item.txns ?? []) {
        const key = `${t.volume || '기본'}__${t.expiryDate || ''}`
        byLot[key] = (byLot[key] ?? 0) + (t.type === '입고' ? t.amount : -t.amount)
      }
      const lots = Object.entries(byLot)
        .filter(([, qty]) => qty > 0)
        .map(([key, qty]) => {
          const [vol, expiry] = key.split('__')
          return { vol, expiry, qty }
        })
      if (lots.length) map[item.name] = lots
    }
    return map
  })

  // 가용농약에 재고로 반영할 품목 — 다 써서 남은 수량이 0인 품목은 재고농약으로 취급하지 않는다.
  const inStockPesticides = computed(() =>
    inventoryPesticides.value.filter((i) => Object.hasOwn(inventoryStockMap.value, i.name)),
  )

  function fmtExpiry(date) {
    if (!date) return ''
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return date
    return `~${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function stockLotLabel(lot) {
    return [lot.vol === '기본' ? '' : lot.vol, lot.expiry ? fmtExpiry(lot.expiry) : '', `${lot.qty}개`]
      .filter(Boolean).join(' ')
  }

  function hasStock(brandName) {
    return (inventoryStockMap.value[brandName]?.length ?? 0) > 0
  }

  return { inventoryPesticides, inventoryStockMap, inStockPesticides, fmtExpiry, stockLotLabel, hasStock }
}
