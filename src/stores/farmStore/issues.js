// 문제 CRUD + 해결단계 CRUD + 유사 사례 추천 + 전체 초기화.
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, withDisplayFields, snapshotForRevert, truncateForLog } from '../../utils/changeLogUtils.js'
import { normalizeIssue } from '../../utils/farmDataSchema.js'

function scoreSimilarity(base, sample) {
  const tokenize = (text) =>
    new Set(
      String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9가-힣]+/)
        .filter((token) => token.length > 2),
    )

  const a = tokenize(base)
  const b = tokenize(sample)

  if (!a.size || !b.size) {
    return 0
  }

  let overlap = 0

  a.forEach((token) => {
    if (b.has(token)) {
      overlap += 1
    }
  })

  return overlap / new Set([...a, ...b]).size
}

function createPhotoTokenSet(photos = []) {
  const tokens = []

  photos.forEach((photo) => {
    const source = [
      photo?.name,
      photo?.contentType,
      photo?.width ? `w${photo.width}` : '',
      photo?.height ? `h${photo.height}` : '',
      photo?.size ? `s${Math.round(photo.size / 10000)}` : '',
    ].join(' ')

    source
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((token) => token.length > 1)
      .forEach((token) => tokens.push(token))
  })

  return new Set(tokens)
}

function scoreTokenSetSimilarity(sourceSet, targetSet) {
  if (!sourceSet.size || !targetSet.size) {
    return 0
  }

  let hit = 0
  sourceSet.forEach((token) => {
    if (targetSet.has(token)) {
      hit += 1
    }
  })

  return hit / new Set([...sourceSet, ...targetSet]).size
}

export function createIssueActions(ctx) {
  const { state, persist, logChange, facilityNameById } = ctx

  async function upsertIssue(payload) {
    const index = state.value.issues.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      const before = { ...state.value.issues[index] }
      state.value.issues[index] = normalizeIssue({
        ...state.value.issues[index],
        ...payload,
      })
      const after = state.value.issues[index]
      // fields는 되돌리기에 쓰이므로 재배동 id를 그대로 담고, 표시용 문자열만 이름으로 바꾼다.
      const fields = diffFields(before, after, {
        title: '제목',
        status: '상태',
        occurredAt: '발생일',
        symptoms: '증상',
        greenhouseId: '재배동',
      })
      const displayFields = withDisplayFields(fields, { greenhouseId: facilityNameById })
      logChange('문제', after.title, 'update', formatFieldDiff(displayFields), { refId: payload.id, fields })
    } else {
      const created = normalizeIssue({
        ...payload,
        id: payload.id || uuid(),
        resolutionSteps: Array.isArray(payload.resolutionSteps) ? payload.resolutionSteps : [],
        photos: Array.isArray(payload.photos) ? payload.photos : [],
      })
      state.value.issues.unshift(created)
      logChange('문제', created.title, 'add')
    }

    await persist('issues')
  }

  async function addIssueResolutionStep(issueId, note, photos = []) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue) {
      return
    }

    issue.resolutionSteps = issue.resolutionSteps || []
    issue.resolutionSteps.push({
      id: uuid(),
      date: new Date().toISOString(),
      note,
      photos: Array.isArray(photos) ? photos : [],
    })
    logChange('문제 해결단계', issue.title, 'add', truncateForLog(note))
    await persist('issues')
  }

  async function updateIssueResolutionStep(issueId, stepId, patch) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue || !Array.isArray(issue.resolutionSteps)) {
      return
    }

    const step = issue.resolutionSteps.find((item) => (item.id || item.date) === stepId)
    if (!step) {
      return
    }

    const before = { ...step }
    if (patch.note !== undefined) {
      step.note = patch.note
    }
    if (patch.photos !== undefined) {
      step.photos = Array.isArray(patch.photos) ? patch.photos : []
    }

    const fields = diffFields(before, step, { note: '메모' })
    logChange('문제 해결단계', issue.title, 'update', formatFieldDiff(fields), {
      refId: `${issueId}:${stepId}`,
      fields,
    })
    await persist('issues')
  }

  async function removeIssueResolutionStep(issueId, stepId) {
    const issue = state.value.issues.find((item) => item.id === issueId)
    if (!issue || !Array.isArray(issue.resolutionSteps)) {
      return
    }

    const target = issue.resolutionSteps.find((item) => (item.id || item.date) === stepId)
    issue.resolutionSteps = issue.resolutionSteps.filter((item) => (item.id || item.date) !== stepId)
    if (target) {
      logChange('문제 해결단계', issue.title, 'delete', `메모: ${truncateForLog(target.note)}`, {
        refId: `${issueId}:${stepId}`,
        snapshot: snapshotForRevert(target),
      })
    }
    await persist('issues')
  }

  async function removeIssue(id) {
    const target = state.value.issues.find((item) => item.id === id)
    state.value.issues = state.value.issues.filter((item) => item.id !== id)
    if (target) logChange('문제', target.title, 'delete', '', { snapshot: snapshotForRevert(target) })
    await persist('issues')
  }

  async function resetIssues() {
    const count = state.value.issues.length
    state.value.issues = []
    if (count > 0) logChange('문제', `전체 초기화 (${count}건)`, 'delete')
    await persist('issues')
  }

  function suggestSimilarIssues(query) {
    const queryObject = typeof query === 'string' ? { query, photos: [] } : query || {}
    const queryText = queryObject.query || ''
    const queryPhotoTokens = createPhotoTokenSet(queryObject.photos || [])

    return state.value.issues
      .map((issue) => {
        const textCorpus = [
          issue.title,
          issue.symptoms,
          ...(issue.resolutionSteps || []).map((step) => step.note),
          ...(issue.photos || []).map((photo) => photo.name),
        ].join(' ')

        const textScore = scoreSimilarity(queryText, textCorpus)
        const issuePhotoTokens = createPhotoTokenSet(issue.photos || [])
        const photoScore = scoreTokenSetSimilarity(queryPhotoTokens, issuePhotoTokens)
        const blendedScore = queryPhotoTokens.size
          ? textScore * 0.75 + photoScore * 0.25
          : textScore

        return {
          issue,
          score: blendedScore,
          textScore,
          photoScore,
        }
      })
      .filter((item) => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  return {
    upsertIssue,
    addIssueResolutionStep,
    updateIssueResolutionStep,
    removeIssueResolutionStep,
    removeIssue,
    resetIssues,
    suggestSimilarIssues,
  }
}
