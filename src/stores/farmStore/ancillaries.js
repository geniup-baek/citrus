// 시설·장비 CRUD + 정렬 + 전체 초기화.
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, snapshotForRevert } from '../../utils/changeLogUtils.js'

export function createAncillaryActions(ctx) {
  const { state, persist, logChange } = ctx

  async function upsertAncillary(payload) {
    const index = state.value.ancillaries.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      const before = { ...state.value.ancillaries[index] }
      state.value.ancillaries[index] = { ...state.value.ancillaries[index], ...payload }
      const fields = diffFields(before, state.value.ancillaries[index], { name: '이름', type: '유형', notes: '메모' })
      logChange('시설·장비', state.value.ancillaries[index].name, 'update', formatFieldDiff(fields), { refId: payload.id, fields })
    } else {
      const created = { ...payload, id: payload.id || uuid() }
      state.value.ancillaries.push(created)
      logChange('시설·장비', created.name, 'add')
    }

    await persist('ancillaries')
  }

  async function removeAncillary(id) {
    const target = state.value.ancillaries.find((item) => item.id === id)
    state.value.ancillaries = state.value.ancillaries.filter((item) => item.id !== id)
    if (target) logChange('시설·장비', target.name, 'delete', '', { snapshot: snapshotForRevert(target) })
    await persist('ancillaries')
  }

  async function reorderAncillaries(newList) {
    state.value.ancillaries = newList
    await persist('ancillaries')
  }

  async function resetAncillaries() {
    const count = state.value.ancillaries.length
    state.value.ancillaries = []
    if (count > 0) logChange('시설·장비', `전체 초기화 (${count}개)`, 'delete')
    await persist('ancillaries')
  }

  return { upsertAncillary, removeAncillary, reorderAncillaries, resetAncillaries }
}
