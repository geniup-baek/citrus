// 사용법(작업 단계별 사진·설명 안내) CRUD + 단계 CRUD + 내보내기/불러오기 + 전체 초기화.
import { doc, getDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from '../../services/firebase'
import { uuid } from '../../utils/uuid.js'
import { diffFields, formatFieldDiff, snapshotForRevert, truncateForLog } from '../../utils/changeLogUtils.js'
import { normalizeUsageGuide } from '../../utils/farmDataSchema.js'

const USAGE_GUIDE_FILE_TYPE = 'citrus-usage-guide'

export function createUsageGuideActions(ctx) {
  const { state, persist, logChange, photoCache, savePhotos } = ctx

  async function upsertUsageGuide(payload) {
    const index = state.value.usageGuides.findIndex((item) => item.id === payload.id)

    if (index >= 0) {
      const before = { ...state.value.usageGuides[index] }
      state.value.usageGuides[index] = normalizeUsageGuide({
        ...state.value.usageGuides[index],
        ...payload,
      })
      const fields = diffFields(before, state.value.usageGuides[index], { title: '제목', description: '설명' })
      logChange('사용법', state.value.usageGuides[index].title, 'update', formatFieldDiff(fields), { refId: payload.id, fields })
    } else {
      const created = normalizeUsageGuide({
        ...payload,
        id: payload.id || uuid(),
      })
      state.value.usageGuides.push(created)
      logChange('사용법', created.title, 'add')
    }

    await persist('usageGuides')
  }

  async function removeUsageGuide(id) {
    const target = state.value.usageGuides.find((item) => item.id === id)
    state.value.usageGuides = state.value.usageGuides.filter((item) => item.id !== id)
    if (target) logChange('사용법', target.title, 'delete', '', { snapshot: snapshotForRevert(target) })
    await persist('usageGuides')
  }

  async function reorderUsageGuides(newList) {
    state.value.usageGuides = newList
    await persist('usageGuides')
  }

  async function addUsageGuideStep(guideId, text, photos = []) {
    const guide = state.value.usageGuides.find((item) => item.id === guideId)
    if (!guide) return

    guide.steps = [
      ...(guide.steps || []),
      { id: uuid(), text, photos: Array.isArray(photos) ? photos : [] },
    ]
    logChange('사용법 단계', guide.title, 'add', truncateForLog(text))
    await persist('usageGuides')
  }

  async function updateUsageGuideStep(guideId, stepId, patch) {
    const guide = state.value.usageGuides.find((item) => item.id === guideId)
    if (!guide || !Array.isArray(guide.steps)) return

    const step = guide.steps.find((item) => item.id === stepId)
    if (!step) return

    const before = { ...step }
    if (patch.text !== undefined) step.text = patch.text
    if (patch.photos !== undefined) step.photos = Array.isArray(patch.photos) ? patch.photos : []

    const fields = diffFields(before, step, { text: '내용' })
    logChange('사용법 단계', guide.title, 'update', formatFieldDiff(fields), {
      refId: `${guideId}:${stepId}`,
      fields,
    })
    await persist('usageGuides')
  }

  async function removeUsageGuideStep(guideId, stepId) {
    const guide = state.value.usageGuides.find((item) => item.id === guideId)
    if (!guide || !Array.isArray(guide.steps)) return

    const target = guide.steps.find((item) => item.id === stepId)
    guide.steps = guide.steps.filter((item) => item.id !== stepId)
    if (target) {
      logChange('사용법 단계', guide.title, 'delete', `내용: ${truncateForLog(target.text)}`, {
        refId: `${guideId}:${stepId}`,
        snapshot: snapshotForRevert(target),
      })
    }
    await persist('usageGuides')
  }

  async function reorderUsageGuideSteps(guideId, newSteps) {
    const guide = state.value.usageGuides.find((item) => item.id === guideId)
    if (!guide) return

    guide.steps = newSteps
    await persist('usageGuides')
  }

  // 사진 본문(base64)까지 포함해 다른 농장에서도 그대로 복원되는 자기완결적 파일을 만든다.
  // (사진은 photos 컬렉션에 분산 저장되므로 메타데이터만으로는 다른 환경에서 이미지가 복원되지 않음)
  async function exportUsageGuide(id) {
    const guide = state.value.usageGuides.find((item) => item.id === id)
    if (!guide) throw new Error('usage-guide-not-found')

    const photoIds = new Set()
    guide.steps?.forEach((s) => s.photos?.forEach((p) => p?.id && photoIds.add(p.id)))

    const photos = {}
    for (const pid of photoIds) {
      let dataUrl = photoCache.value[pid]
      if (dataUrl === undefined && firebaseEnabled && db) {
        try {
          const snap = await getDoc(doc(db, 'photos', pid))
          dataUrl = snap.exists() ? snap.data().dataUrl : undefined
        } catch (e) {
          console.warn('[farmStore] 사용법 내보내기용 사진 로드 실패', pid, e)
        }
      }
      if (dataUrl) photos[pid] = { dataUrl }
    }

    return {
      type: USAGE_GUIDE_FILE_TYPE,
      version: 1,
      exportedAt: new Date().toISOString(),
      guide: {
        title: guide.title,
        description: guide.description || '',
        steps: (guide.steps || []).map((s) => ({
          text: s.text,
          photos: (s.photos || []).map((p) => ({ ...p })),
        })),
      },
      photos,
    }
  }

  function isValidUsageGuideFile(payload) {
    return Boolean(payload && payload.type === USAGE_GUIDE_FILE_TYPE && payload.guide && typeof payload.guide === 'object')
  }

  // 다른 농장에서 내보낸 사용법 파일을 이 농장에 새 항목으로 추가한다.
  // 사진은 항상 이 농장 소유의 새 id로 다시 저장한다 — 원본 사진 id를 그대로 쓰면 전역
  // photos 컬렉션을 공유하는 특성상 원본 농장이 나중에 그 사진을 정리(GC)할 때
  // 이 농장이 참조 중인 사진까지 함께 지워질 수 있다.
  async function importUsageGuide(payload) {
    if (!isValidUsageGuideFile(payload)) {
      throw new Error('invalid-usage-guide-file')
    }

    const photoMap = payload.photos || {}
    const idMap = new Map() // 원본 사진 id → 이 농장에 새로 저장된 메타데이터

    for (const step of payload.guide.steps || []) {
      for (const photo of step.photos || []) {
        if (!photo?.id || idMap.has(photo.id)) continue
        const src = photoMap[photo.id]
        if (!src?.dataUrl) continue
        const [saved] = await savePhotos([{
          id: uuid(),
          name: photo.name,
          dataUrl: src.dataUrl,
          contentType: photo.contentType,
          size: photo.size,
          width: photo.width,
          height: photo.height,
          originalSize: photo.originalSize,
        }])
        idMap.set(photo.id, saved)
      }
    }

    const steps = (payload.guide.steps || []).map((s) => ({
      id: uuid(),
      text: s.text || '',
      photos: (s.photos || []).map((p) => idMap.get(p.id)).filter(Boolean),
    }))

    await upsertUsageGuide({
      title: payload.guide.title || '',
      description: payload.guide.description || '',
      steps,
    })

    return payload.guide.title || ''
  }

  async function resetUsageGuides() {
    const count = state.value.usageGuides.length
    state.value.usageGuides = []
    if (count > 0) logChange('사용법', `전체 초기화 (${count}건)`, 'delete')
    await persist('usageGuides')
  }

  return {
    upsertUsageGuide,
    removeUsageGuide,
    reorderUsageGuides,
    addUsageGuideStep,
    updateUsageGuideStep,
    removeUsageGuideStep,
    reorderUsageGuideSteps,
    exportUsageGuide,
    isValidUsageGuideFile,
    importUsageGuide,
    resetUsageGuides,
  }
}
