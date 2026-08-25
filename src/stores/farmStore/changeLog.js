// 변경 이력(감사 로그) 기록 — state.value.changeLog에 쓰는 부분만 여기 있다.
// 비교·서식(diffFields 등)은 changeLogUtils.js, 되돌리기 실행은 revert.js에 있다.
import { uuid } from '../../utils/uuid.js'
import { formatFieldDiff } from './changeLogUtils.js'

export const CHANGE_LOG_LIMIT = 300 // 농장별 변경 이력 최대 보관 건수(Firestore 문서 용량 보호)

// 같은 항목을 짧은 시간 안에 다시 바꾸면(예: 작업 상태를 예정→진행중→완료로 연달아 클릭)
// 한 줄로 합쳐서 기록한다. 그 시간이 지나면 서로 다른 사건으로 보고 각각 기록한다.
const CHANGE_LOG_MERGE_WINDOW_MS = 60 * 1000

// state/actorName(둘 다 ref)을 받아 이 농장 changeLog에 기록하는 함수와, 재배동 id를
// 표시용 이름으로 바꾸는 헬퍼(seedlings/issues의 재배동 필드 diff 표시에 쓰인다)를 만든다.
export function createChangeLogActions(state, actorName) {
  function facilityNameById(id) {
    return state.value.facilities.find((f) => f.id === id)?.name || id || ''
  }

  // action: 'add' | 'update' | 'delete' | 'stock-in' | 'stock-out'
  // detail: "필드: 이전값 → 새값, ..." 형태의 사람이 읽을 수 있는 변경 요약(선택)
  // mergeInfo: { refId, fields } 를 넘기면 — 바로 위 기록이 같은 항목(같은 entity+refId)의
  // update이고 CHANGE_LOG_MERGE_WINDOW_MS 안이면 새 줄을 추가하지 않고 그 기록을 갱신한다.
  // (예: 상태를 예정→진행중→완료로 두 번 클릭해도 "상태: 예정 → 완료" 한 줄만 남는다.
  //  값이 원래대로 돌아오면 — 예: 예정→진행중→예정 — 순변화가 없으므로 기록 자체를 지운다.)
  // mergeInfo.snapshot(action이 'delete'일 때)을 함께 넘기면 되돌리기(복원)에 쓰인다.
  function logChange(entity, name, action, detail = '', mergeInfo = null) {
    if (mergeInfo?.refId && action === 'update') {
      const prevEntries = Array.isArray(state.value.changeLog) ? state.value.changeLog : []
      const top = prevEntries[0]
      const withinWindow = top && Date.now() - new Date(top.at).getTime() < CHANGE_LOG_MERGE_WINDOW_MS
      if (top && withinWindow && top.entity === entity && top.refId === mergeInfo.refId && top.action === 'update') {
        const mergedFields = { ...(top.fields || {}) }
        for (const [key, field] of Object.entries(mergeInfo.fields)) {
          mergedFields[key] = { label: field.label, from: mergedFields[key]?.from ?? field.from, to: field.to }
        }
        // 값이 결국 원래대로 돌아온 필드는 변화가 없으므로 뺀다(예: A→B→A).
        const netFields = Object.fromEntries(
          Object.entries(mergedFields).filter(([, f]) => (f.from ?? '') !== (f.to ?? '')),
        )
        if (Object.keys(netFields).length === 0) {
          state.value.changeLog = prevEntries.slice(1)
          return
        }
        state.value.changeLog = [
          {
            ...top,
            name: name || top.name,
            at: new Date().toISOString(),
            actor: actorName.value || top.actor,
            detail: formatFieldDiff(netFields),
            fields: netFields,
          },
          ...prevEntries.slice(1),
        ]
        return
      }
    }

    const entry = {
      id: uuid(),
      at: new Date().toISOString(),
      entity,
      name: name || '',
      action,
      actor: actorName.value || '',
      detail: detail || '',
      // Firestore setDoc()은 값이 undefined인 필드가 있으면 문서 전체 저장을 거부한다.
      // refId만 있고 fields가 없는 경우(예: 하위 기록 삭제)에도 fields: undefined가
      // 섞여 들어가지 않도록 각 필드를 독립적으로 조건부 스프레드한다.
      ...(mergeInfo?.refId ? { refId: mergeInfo.refId } : {}),
      ...(mergeInfo?.fields ? { fields: mergeInfo.fields } : {}),
      ...(mergeInfo?.snapshot ? { snapshot: mergeInfo.snapshot } : {}),
    }
    const prev = Array.isArray(state.value.changeLog) ? state.value.changeLog : []
    state.value.changeLog = [entry, ...prev].slice(0, CHANGE_LOG_LIMIT)
  }

  return { logChange, facilityNameById }
}
