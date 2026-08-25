// 재배동 CRUD + 정렬 + 전체 초기화.
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, snapshotForRevert } from '../../utils/changeLogUtils.js'

export function createFacilityActions(ctx) {
  const { state, persist, logChange } = ctx

  async function upsertFacility(payload) {
    const index = state.value.facilities.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      const before = { ...state.value.facilities[index] }
      state.value.facilities[index] = { ...state.value.facilities[index], ...payload }
      const fields = diffFields(before, state.value.facilities[index], { name: '이름', notes: '메모' })
      logChange('재배동', state.value.facilities[index].name, 'update', formatFieldDiff(fields), { refId: payload.id, fields })
    } else {
      const created = { ...payload, id: payload.id || uuid() }
      state.value.facilities.push(created)
      logChange('재배동', created.name, 'add')
    }

    await persist('facilities')
  }

  async function removeFacility(id) {
    const target = state.value.facilities.find((item) => item.id === id)
    state.value.facilities = state.value.facilities.filter((item) => item.id !== id)
    state.value.seedlings = state.value.seedlings.filter((item) => item.greenhouseId !== id)
    state.value.issues = state.value.issues.filter((item) => item.greenhouseId !== id)
    // 되돌리기는 재배동 자체만 복원한다 — 함께 지워진 묘목·문제까지는 복원하지 않는다.
    if (target) logChange('재배동', target.name, 'delete', '', { snapshot: snapshotForRevert(target) })
    await persist(['facilities', 'seedlings', 'issues'])
  }

  async function reorderFacilities(newList) {
    state.value.facilities = newList
    await persist('facilities')
  }

  // 관리모드 동작 설정에서 "초기화 버튼: 표시"일 때만 화면에 노출된다.
  // 항목을 하나씩 지우면 매번 저장이 일어나므로, 한 번에 비우고 한 번만 저장한다.
  // 개별 삭제와 같은 연쇄 삭제 규칙을 그대로 따른다(사진 정리는 persist가 알아서 한다).
  async function resetFacilities() {
    const count = state.value.facilities.length
    const ids = new Set(state.value.facilities.map((item) => item.id))
    state.value.facilities = []
    state.value.seedlings = state.value.seedlings.filter((item) => !ids.has(item.greenhouseId))
    state.value.issues = state.value.issues.filter((item) => !ids.has(item.greenhouseId))
    if (count > 0) logChange('재배동', `전체 초기화 (${count}개)`, 'delete')
    await persist(['facilities', 'seedlings', 'issues'])
  }

  return { upsertFacility, removeFacility, reorderFacilities, resetFacilities }
}
