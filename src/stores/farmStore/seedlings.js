// 묘목 CRUD(+ 일괄 추가) + 생육기록 CRUD + 전체 초기화.
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, withDisplayFields, snapshotForRevert, truncateForLog } from './changeLogUtils.js'

export function createSeedlingActions(ctx) {
  const { state, persistAll, logChange, facilityNameById } = ctx

  function seedlingLabel(seedling) {
    const greenhouse = state.value.facilities.find((item) => item.id === seedling?.greenhouseId)
    return [seedling?.variety, greenhouse?.name].filter(Boolean).join(' · ') || '묘목'
  }

  async function upsertSeedling(payload) {
    const index = state.value.seedlings.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      const before = { ...state.value.seedlings[index] }
      state.value.seedlings[index] = { ...state.value.seedlings[index], ...payload }
      const after = state.value.seedlings[index]
      // fields는 되돌리기에 쓰이므로 재배동 id를 그대로 담고, 표시용 문자열만 이름으로 바꾼다.
      const fields = diffFields(before, after, {
        variety: '품종',
        rootstock: '대목',
        plantedAt: '식재일',
        greenhouseId: '재배동',
        notes: '메모',
      })
      const displayFields = withDisplayFields(fields, { greenhouseId: facilityNameById })
      logChange('묘목', seedlingLabel(after), 'update', formatFieldDiff(displayFields), { refId: payload.id, fields })
    } else {
      const created = {
        ...payload,
        id: payload.id || uuid(),
        growthLogs: Array.isArray(payload.growthLogs) ? payload.growthLogs : [],
      }
      state.value.seedlings.push(created)
      logChange('묘목', seedlingLabel(created), 'add')
    }

    await persistAll()
  }

  async function addSeedlingsBatch(payloads) {
    for (const payload of payloads) {
      state.value.seedlings.push({
        ...payload,
        id: payload.id || uuid(),
        growthLogs: Array.isArray(payload.growthLogs) ? payload.growthLogs : [],
      })
    }
    if (payloads.length > 0) logChange('묘목', `${payloads.length}그루 일괄 추가`, 'add')
    await persistAll()
  }

  async function removeSeedling(id) {
    const target = state.value.seedlings.find((item) => item.id === id)
    state.value.seedlings = state.value.seedlings.filter((item) => item.id !== id)
    if (target) logChange('묘목', seedlingLabel(target), 'delete', '', { snapshot: snapshotForRevert(target) })
    await persistAll()
  }

  async function addSeedlingLog(seedlingId, note, photos = []) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling) {
      return
    }

    seedling.growthLogs = seedling.growthLogs || []
    seedling.growthLogs.unshift({
      id: uuid(),
      date: new Date().toISOString(),
      note,
      photos: Array.isArray(photos) ? photos : [],
    })
    logChange('묘목 생육기록', seedlingLabel(seedling), 'add', truncateForLog(note))

    await persistAll()
  }

  async function updateSeedlingLog(seedlingId, logId, patch) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling || !Array.isArray(seedling.growthLogs)) {
      return
    }

    const log = seedling.growthLogs.find((item) => (item.id || item.date) === logId)
    if (!log) {
      return
    }

    const before = { ...log }
    if (patch.note !== undefined) {
      log.note = patch.note
    }
    if (patch.photos !== undefined) {
      log.photos = Array.isArray(patch.photos) ? patch.photos : []
    }

    // 사진은 값 자체가 참조라 표시·되돌리기에서 뺀다(재배동 등 다른 항목도 같은 방침).
    const fields = diffFields(before, log, { note: '메모' })
    logChange('묘목 생육기록', seedlingLabel(seedling), 'update', formatFieldDiff(fields), {
      refId: `${seedlingId}:${logId}`,
      fields,
    })

    await persistAll()
  }

  async function removeSeedlingLog(seedlingId, logId) {
    const seedling = state.value.seedlings.find((item) => item.id === seedlingId)
    if (!seedling || !Array.isArray(seedling.growthLogs)) {
      return
    }

    const target = seedling.growthLogs.find((item) => (item.id || item.date) === logId)
    seedling.growthLogs = seedling.growthLogs.filter((item) => (item.id || item.date) !== logId)
    if (target) {
      logChange('묘목 생육기록', seedlingLabel(seedling), 'delete', `메모: ${truncateForLog(target.note)}`, {
        refId: `${seedlingId}:${logId}`,
        snapshot: snapshotForRevert(target),
      })
    }
    await persistAll()
  }

  async function resetSeedlings() {
    const count = state.value.seedlings.length
    state.value.seedlings = []
    if (count > 0) logChange('묘목', `전체 초기화 (${count}그루)`, 'delete')
    await persistAll()
  }

  return {
    upsertSeedling,
    addSeedlingsBatch,
    removeSeedling,
    addSeedlingLog,
    updateSeedlingLog,
    removeSeedlingLog,
    resetSeedlings,
  }
}
