// 변경 이력 되돌리기 + 변경 이력 자체 삭제.
// registry에는 각 엔티티의 upsert/update 함수가 들어있다(farmStore.js가 모든 도메인
// 모듈을 만든 뒤 마지막에 이 모듈을 만들면서 넘겨준다 — 순환 참조를 피하기 위함).

// entity 문자열로 어느 목록·upsert 함수를 쓸지 찾는다. 비료/농약 재고는 entity가
// "비료재고"/"농약재고"처럼 카테고리에 따라 달라져서 접미사로 판단한다.
function revertTargetFor(state, registry, entity) {
  if (entity === '재배동') return { upsert: registry.upsertFacility, list: () => state.value.facilities }
  if (entity === '시설·장비') return { upsert: registry.upsertAncillary, list: () => state.value.ancillaries }
  if (entity === '묘목') return { upsert: registry.upsertSeedling, list: () => state.value.seedlings }
  if (entity === '작업') return { upsert: registry.upsertTask, list: () => state.value.tasks }
  if (entity === '작업 템플릿') return { upsert: registry.upsertChecklistTemplate, list: () => state.value.checklistTemplates }
  if (entity === '문제') return { upsert: registry.upsertIssue, list: () => state.value.issues }
  if (entity === '사용법') return { upsert: registry.upsertUsageGuide, list: () => state.value.usageGuides }
  if (entity.endsWith('재고')) return { upsert: registry.upsertInventoryItem, list: () => state.value.inventory }
  return null
}

// 작업 진행기록·묘목 생육기록·문제 해결단계·사용법 단계·재고 입출고처럼 상위 항목
// 안에 중첩된 하위 기록의 되돌리기 대상. refId는 "상위id:하위id" 형태로 저장되며,
// 하위id 자체가 (레거시 데이터의 경우) 콜론이 들어간 ISO 날짜일 수 있어 반드시
// 첫 번째 콜론에서만 나눠야 한다(parseSubRefId 참고).
function subRecordTargetFor(state, registry, entity) {
  if (entity === '작업 진행기록') {
    return {
      domainKey: 'tasks',
      findParent: (parentId) => state.value.tasks.find((t) => t.id === parentId),
      arrayKey: 'logs',
      update: registry.updateTaskLog,
      restore: (parent, snapshot) => { parent.logs = parent.logs || []; parent.logs.unshift(snapshot) },
    }
  }
  if (entity === '작업 체크리스트') {
    return {
      domainKey: 'tasks',
      findParent: (parentId) => state.value.tasks.find((t) => t.id === parentId),
      arrayKey: 'checklist',
      update: registry.updateChecklistItem,
      // 원래 순서(몇 번째 항목이었는지)는 저장해두지 않아 맨 뒤에 되살아난다.
      restore: (parent, snapshot) => { parent.checklist = [...(parent.checklist || []), snapshot] },
    }
  }
  if (entity === '묘목 생육기록') {
    return {
      domainKey: 'seedlings',
      findParent: (parentId) => state.value.seedlings.find((s) => s.id === parentId),
      arrayKey: 'growthLogs',
      update: registry.updateSeedlingLog,
      restore: (parent, snapshot) => { parent.growthLogs = parent.growthLogs || []; parent.growthLogs.unshift(snapshot) },
    }
  }
  if (entity === '문제 해결단계') {
    return {
      domainKey: 'issues',
      findParent: (parentId) => state.value.issues.find((i) => i.id === parentId),
      arrayKey: 'resolutionSteps',
      update: registry.updateIssueResolutionStep,
      restore: (parent, snapshot) => {
        parent.resolutionSteps = parent.resolutionSteps || []
        parent.resolutionSteps.push(snapshot)
      },
    }
  }
  if (entity === '사용법 단계') {
    return {
      domainKey: 'usageGuides',
      findParent: (parentId) => state.value.usageGuides.find((g) => g.id === parentId),
      arrayKey: 'steps',
      update: registry.updateUsageGuideStep,
      // 원래 순서(몇 번째 단계였는지)는 저장해두지 않아 맨 뒤에 되살아난다 — 필요하면 손으로 옮긴다.
      restore: (parent, snapshot) => { parent.steps = [...(parent.steps || []), snapshot] },
    }
  }
  if (entity.endsWith('재고 입출고')) {
    return {
      domainKey: 'inventory',
      findParent: (parentId) => state.value.inventory.find((i) => i.id === parentId),
      arrayKey: 'txns',
      update: registry.updateInventoryTxn,
      restore: (parent, snapshot) => { parent.txns = parent.txns || []; parent.txns.unshift(snapshot) },
    }
  }
  return null
}

// "상위id:하위id"를 나눈다. 하위id가 (레거시 데이터의 경우) ISO 날짜 문자열이면 그 안에도
// 콜론이 있으므로, 상위id 뒤의 첫 번째 콜론에서만 자른다(상위id 자체는 uuid라 콜론이 없다).
function parseSubRefId(refId) {
  const sep = String(refId || '').indexOf(':')
  if (sep < 0) return null
  return { parentId: refId.slice(0, sep), subId: refId.slice(sep + 1) }
}

// state/persist(핵심 저장 함수)과 registry(각 엔티티의 upsert/update 함수 모음)를 받아
// 되돌리기·이력 삭제 함수를 만든다.
export function createRevertActions(state, persist, registry) {
  // 변경 이력 한 줄을 되돌린다.
  // - 수정(update): 그때 바뀐 필드만 이전 값으로 되돌린다(다른 필드는 지금 값 그대로 유지).
  // - 삭제(delete): 저장해둔 스냅샷으로 그 항목을 원래 id 그대로 복원한다.
  // 되돌리기 자체도 보통의 수정/추가로 처리되므로, 그 결과로 새 변경 이력 한 줄이
  // 자연스럽게 남는다(되돌렸다는 사실 자체가 감사 로그에서 사라지지 않음).
  // 재배동 삭제 되돌리기는 재배동 자체만 복원하며, 함께 지워졌던 묘목·문제는 복원하지 않는다.
  async function revertChangeLogEntry(entryId) {
    const entry = (state.value.changeLog || []).find((e) => e.id === entryId)
    if (!entry) return { ok: false, reason: '이력을 찾을 수 없습니다.' }

    const target = revertTargetFor(state, registry, entry.entity)
    if (target) {
      if (entry.action === 'update') {
        if (!entry.refId || !entry.fields) return { ok: false, reason: '되돌릴 정보가 없습니다.' }
        if (!target.list().some((item) => item.id === entry.refId)) {
          return { ok: false, reason: '이미 삭제된 항목이라 되돌릴 수 없습니다.' }
        }
        const patch = { id: entry.refId }
        for (const [key, field] of Object.entries(entry.fields)) {
          patch[key] = field.from
        }
        await target.upsert(patch)
        return { ok: true }
      }

      if (entry.action === 'delete') {
        if (!entry.snapshot) return { ok: false, reason: '되돌릴 정보가 저장되어 있지 않습니다.' }
        if (target.list().some((item) => item.id === entry.snapshot.id)) {
          return { ok: false, reason: '이미 같은 항목이 존재합니다.' }
        }
        await target.upsert(entry.snapshot)
        return { ok: true }
      }

      return { ok: false, reason: '이 종류의 기록은 되돌리기를 지원하지 않습니다.' }
    }

    const subTarget = subRecordTargetFor(state, registry, entry.entity)
    if (subTarget) {
      if (entry.action === 'update') {
        if (!entry.refId || !entry.fields) return { ok: false, reason: '되돌릴 정보가 없습니다.' }
        const ref = parseSubRefId(entry.refId)
        const parent = ref && subTarget.findParent(ref.parentId)
        if (!parent) return { ok: false, reason: '상위 항목이 삭제되어 되돌릴 수 없습니다.' }
        const arr = parent[subTarget.arrayKey]
        if (!Array.isArray(arr) || !arr.some((x) => (x.id || x.date) === ref.subId)) {
          return { ok: false, reason: '이미 삭제된 기록이라 되돌릴 수 없습니다.' }
        }
        const patch = {}
        for (const [key, field] of Object.entries(entry.fields)) {
          patch[key] = field.from
        }
        await subTarget.update(ref.parentId, ref.subId, patch)
        return { ok: true }
      }

      if (entry.action === 'delete') {
        if (!entry.snapshot) return { ok: false, reason: '되돌릴 정보가 저장되어 있지 않습니다.' }
        const ref = parseSubRefId(entry.refId)
        const parent = ref && subTarget.findParent(ref.parentId)
        if (!parent) return { ok: false, reason: '상위 항목이 삭제되어 되돌릴 수 없습니다.' }
        const arr = parent[subTarget.arrayKey]
        const snapKey = entry.snapshot.id || entry.snapshot.date
        if (Array.isArray(arr) && arr.some((x) => (x.id || x.date) === snapKey)) {
          return { ok: false, reason: '이미 같은 기록이 존재합니다.' }
        }
        subTarget.restore(parent, entry.snapshot)
        await persist(subTarget.domainKey)
        return { ok: true }
      }

      return { ok: false, reason: '이 종류의 기록은 되돌리기를 지원하지 않습니다.' }
    }

    return { ok: false, reason: '이 항목은 되돌리기를 지원하지 않습니다.' }
  }

  // ── 변경 이력 삭제 (관리 모드에서 기능을 켜둔 경우에만 화면에 노출된다) ───────────
  // 이 삭제 동작 자체는 새 변경 이력을 남기지 않는다(이력을 정리하는 행위라 다시 이력이
  // 쌓이면 정리한 보람이 없다). "초기화"와 달리 흔적을 남기지 않고 그대로 지운다.
  async function removeChangeLogEntry(id) {
    state.value.changeLog = (state.value.changeLog || []).filter((entry) => entry.id !== id)
    await persist() // changeLog만 바뀌었다 — persist()는 인자 없이도 changeLog는 항상 저장한다.
  }

  async function clearChangeLog() {
    state.value.changeLog = []
    await persist()
  }

  return { revertChangeLogEntry, removeChangeLogEntry, clearChangeLog }
}
