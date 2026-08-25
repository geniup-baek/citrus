// 변경 이력(감사 로그) 표시·비교용 순수 함수 — state를 참조하지 않는다.
// state가 필요한 부분(logChange 자체, 되돌리기 실행)은 changeLog.js/revert.js에 있다.

// 값 하나를 로그에 넣기 좋은 짧은 문자열로 정리한다(너무 길면 잘라서 문서 용량을 아낀다).
export function truncateForLog(value) {
  if (value === undefined || value === null || value === '') return '(없음)'
  const text = String(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

// before/after 두 객체를 fieldLabels({필드키: 표시이름})에 정의된 필드만 비교해
// 바뀐 필드만 { 필드키: { label, from, to } } 형태로 모아 돌려준다.
export function diffFields(before, after, fieldLabels) {
  const fields = {}
  for (const [key, label] of Object.entries(fieldLabels)) {
    const prevValue = before?.[key] ?? ''
    const nextValue = after?.[key] ?? ''
    if (prevValue !== nextValue) {
      // Firestore는 undefined 값이 섞인 문서를 통째로 거부하므로, 필드가 아예 없던 경우
      // (before?.[key] === undefined)에도 null로 채워 저장 가능한 값만 담는다.
      fields[key] = { label, from: before?.[key] ?? null, to: after?.[key] ?? null }
    }
  }
  return fields
}

// diffFields 결과를 "표시이름: 이전값 → 새값, ..." 형태의 문자열로 렌더링한다.
export function formatFieldDiff(fields) {
  return Object.values(fields)
    .map((f) => `${f.label}: ${truncateForLog(f.from)} → ${truncateForLog(f.to)}`)
    .join(', ')
}

// 위 두 개를 한 번에 — 대부분의 호출부는 병합(refId) 없이 문자열 요약만 필요하다.
export function describeChanges(before, after, fieldLabels) {
  return formatFieldDiff(diffFields(before, after, fieldLabels))
}

// fields의 특정 키를 화면 표시용 값으로 바꾼 사본을 만든다(저장되는 fields 자체는 원본 유지).
// resolvers: { 필드키: (원본값) => 표시값 }
export function withDisplayFields(fields, resolvers) {
  const out = {}
  for (const [key, field] of Object.entries(fields)) {
    const resolve = resolvers?.[key]
    out[key] = resolve ? { ...field, from: resolve(field.from), to: resolve(field.to) } : field
  }
  return out
}

// 삭제 전 데이터를 되돌리기용으로 저장해둔다. Firestore 문서 용량(1MiB)을 보호하기 위해
// 너무 큰 항목(입출고·성장기록 등이 아주 많은 경우)은 스냅샷 없이 삭제만 기록한다
// — 그런 항목은 삭제 자체는 이력에 남지만 "되돌리기" 버튼은 뜨지 않는다.
const MAX_SNAPSHOT_JSON_LENGTH = 8000
export function snapshotForRevert(record) {
  if (!record) return null
  try {
    const json = JSON.stringify(record)
    if (json.length > MAX_SNAPSHOT_JSON_LENGTH) return null
    return JSON.parse(json)
  } catch {
    return null
  }
}
