// 비료·농약 재고(로트=규격+유효기간 기반) CRUD + 입출고 CRUD + 분류별 초기화.
// 품목은 메타데이터 + 입출고 이력(txns)만 보관한다.
// 현재 재고(로트별 수량)는 txns로부터 계산하므로 단일 출처라 편집/삭제가 단순하다.
import { format } from 'date-fns'
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, withDisplayFields, snapshotForRevert } from '../../utils/changeLogUtils.js'
import { normalizeInventoryItem } from '../../utils/farmDataSchema.js'

// 입출고 일자는 시각까지 포함한 ISO 문자열로 저장되지만, 변경 이력에는 시각까지 보여줄
// 필요가 없다 — 화면에서 날짜를 표시할 때 쓰는 형식(PesticideInventoryPanel.vue의
// formatTxnDate)과 맞춰 로컬 날짜만 보여준다(되돌리기용 fields 자체는 원본 그대로 둔다).
function formatTxnDateForLog(value) {
  if (!value) return value
  try { return format(new Date(value), 'yyyy-MM-dd') } catch { return value }
}

export function createInventoryActions(ctx) {
  const { state, persist, logChange } = ctx

  async function upsertInventoryItem(payload) {
    const index = state.value.inventory.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      // 메타데이터만 갱신 (재고/이력은 입출고로만 변경)
      const before = { ...state.value.inventory[index] }
      const { txns, ...meta } = payload
      state.value.inventory[index] = normalizeInventoryItem({
        ...state.value.inventory[index],
        ...meta,
      })
      const updated = state.value.inventory[index]
      const fields = diffFields(before, updated, {
        name: '이름',
        pesticideType: '구분',
        actionGroup: '계통',
        productName: '제품명',
        notes: '비고',
      })
      logChange(`${updated.category}재고`, updated.name, 'update', formatFieldDiff(fields), { refId: payload.id, fields })
    } else {
      const created = normalizeInventoryItem({
        ...payload,
        id: payload.id || uuid(),
        // 새 품목 등록 폼은 txns를 넘기지 않으므로 평소엔 항상 []. 삭제 되돌리기(복원)만
        // 스냅샷에 담긴 입출고 이력을 그대로 넘겨서, 복원 시 이력까지 함께 되살아나게 한다.
        txns: Array.isArray(payload.txns) ? payload.txns : [],
      })
      state.value.inventory.push(created)
      logChange(`${created.category}재고`, created.name, 'add')
    }

    await persist('inventory')
  }

  async function removeInventoryItem(id) {
    const target = state.value.inventory.find((item) => item.id === id)
    state.value.inventory = state.value.inventory.filter((item) => item.id !== id)
    if (target) logChange(`${target.category}재고`, target.name, 'delete', '', { snapshot: snapshotForRevert(target) })
    await persist('inventory')
  }

  // 입출고 1건 기록. 로트는 (규격 volume + 유효기간 expiryDate)로 식별된다.
  // date를 넘기면 그 날짜로 기록한다(입고·사용을 나중에 몰아서 입력하는 경우).
  async function addInventoryTxn(itemId, { type, volume, expiryDate, amount, note, date }) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item) return

    const qty = Math.abs(Number(amount) || 0)
    if (qty === 0) return

    const resolvedType = type === '사용' ? '사용' : '입고'
    item.txns = item.txns || []
    item.txns.unshift({
      id: uuid(),
      date: date || new Date().toISOString(),
      type: resolvedType,
      volume: volume || '기본',
      expiryDate: expiryDate || '',
      amount: qty,
      note: note || '',
    })

    logChange(
      `${item.category}재고 입출고`,
      `${item.name} ${qty}${volume ? ` (${volume})` : ''}`,
      resolvedType === '사용' ? 'stock-out' : 'stock-in',
    )

    await persist('inventory')
  }

  async function updateInventoryTxn(itemId, txnId, patch) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item || !Array.isArray(item.txns)) return

    const txn = item.txns.find((entry) => (entry.id || entry.date) === txnId)
    if (!txn) return

    const before = { ...txn }

    if (patch.date) txn.date = patch.date
    if (patch.type !== undefined) txn.type = patch.type === '사용' ? '사용' : '입고'
    if (patch.volume !== undefined) txn.volume = patch.volume || '기본'
    if (patch.expiryDate !== undefined) txn.expiryDate = patch.expiryDate || ''
    if (patch.amount !== undefined) {
      const amt = Math.abs(Number(patch.amount) || 0)
      if (amt > 0) txn.amount = amt
    }
    if (patch.note !== undefined) txn.note = patch.note

    const fields = diffFields(before, txn, {
      date: '일자',
      type: '구분',
      volume: '규격',
      expiryDate: '유효기간',
      amount: '수량',
      note: '비고',
    })
    const displayFields = withDisplayFields(fields, { date: formatTxnDateForLog })
    logChange(`${item.category}재고 입출고`, `${item.name} 입출고 수정`, 'update', formatFieldDiff(displayFields), {
      refId: `${itemId}:${txnId}`,
      fields,
    })
    await persist('inventory')
  }

  async function removeInventoryTxn(itemId, txnId) {
    const item = state.value.inventory.find((entry) => entry.id === itemId)
    if (!item || !Array.isArray(item.txns)) return

    const target = item.txns.find((entry) => (entry.id || entry.date) === txnId)
    item.txns = item.txns.filter((entry) => (entry.id || entry.date) !== txnId)
    if (target) {
      logChange(`${item.category}재고 입출고`, `${item.name} 입출고 삭제`, 'delete', '', {
        refId: `${itemId}:${txnId}`,
        snapshot: snapshotForRevert(target),
      })
    }
    await persist('inventory')
  }

  // 재고는 비료·농약이 한 배열에 섞여 있으므로 분류별로만 비운다.
  async function resetInventoryCategory(category) {
    const count = state.value.inventory.filter((item) => item.category === category).length
    state.value.inventory = state.value.inventory.filter((item) => item.category !== category)
    if (count > 0) logChange(`${category}재고`, `전체 초기화 (${count}개)`, 'delete')
    await persist('inventory')
  }

  return {
    upsertInventoryItem,
    removeInventoryItem,
    addInventoryTxn,
    updateInventoryTxn,
    removeInventoryTxn,
    resetInventoryCategory,
  }
}
