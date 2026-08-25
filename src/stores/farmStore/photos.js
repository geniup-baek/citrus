// 사진 분산 저장 (Firestore 'photos' 컬렉션, 농장 무관 전역).
// 사진(base64)을 farmData 문서가 아닌 사진별 개별 문서에 저장해 문서 1 MiB 한도를 피한다.
import { ref } from 'vue'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db, firebaseEnabled } from '../../services/firebase'

// state/persistAll을 받아 사진 관련 함수 묶음을 만든다.
export function createPhotoActions(state, persistAll) {
  const photoCache = ref({}) // id -> dataUrl (메모리 캐시)
  const photoInflight = new Set()

  async function loadPhoto(id) {
    if (!firebaseEnabled || !db || !id) return
    if (photoCache.value[id] !== undefined) return
    try {
      const snap = await getDoc(doc(db, 'photos', id))
      photoCache.value = { ...photoCache.value, [id]: snap.exists() ? snap.data().dataUrl || '' : '' }
    } catch (e) {
      console.warn('[farmStore] 사진 로드 실패', id, e)
    }
  }

  // 템플릿에서 <img :src="store.photoSrc(photo)"> 형태로 사용.
  // 구버전/로컬 모드: 객체에 dataUrl이 박혀 있으면 그대로 사용.
  // 신버전: 캐시에서 찾고 없으면 지연 로드(렌더 사이드이펙트 회피 위해 microtask).
  function photoSrc(photo) {
    if (!photo) return ''
    if (photo.dataUrl) return photo.dataUrl
    if (!photo.id) return ''
    const cached = photoCache.value[photo.id]
    if (cached === undefined && !photoInflight.has(photo.id)) {
      photoInflight.add(photo.id)
      queueMicrotask(async () => {
        try {
          await loadPhoto(photo.id)
        } finally {
          photoInflight.delete(photo.id)
        }
      })
    }
    return cached || ''
  }

  // 미리보기 배열 → 저장용 메타데이터 배열. 사진 본문(base64)은 photos 컬렉션에 기록한다.
  async function savePhotos(previews = []) {
    const result = []
    for (const preview of previews) {
      const meta = {
        id: preview.id,
        name: preview.name,
        contentType: preview.contentType,
        size: preview.size,
        width: preview.width,
        height: preview.height,
        originalSize: preview.originalSize,
        createdAt: new Date().toISOString(),
      }
      if (firebaseEnabled && db) {
        await setDoc(doc(db, 'photos', preview.id), {
          dataUrl: preview.dataUrl,
          contentType: preview.contentType || 'image/jpeg',
          createdAt: meta.createdAt,
        })
        photoCache.value = { ...photoCache.value, [preview.id]: preview.dataUrl }
        result.push(meta)
      } else {
        // 로컬 전용 모드: 기존처럼 dataUrl을 그대로 보관.
        result.push({ ...meta, dataUrl: preview.dataUrl })
      }
    }
    return result
  }

  // 기존 farmData 문서에 인라인(base64)으로 박혀 있던 사진을 photos 컬렉션으로 1회 이전한다.
  function collectInlinePhotos() {
    const found = []
    const visit = (arr) => {
      if (!Array.isArray(arr)) return
      for (const p of arr) {
        if (p && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:')) found.push(p)
      }
    }
    state.value.facilities?.forEach((f) => visit(f.photos))
    state.value.ancillaries?.forEach((a) => visit(a.photos))
    state.value.seedlings?.forEach((s) => s.growthLogs?.forEach((l) => visit(l.photos)))
    state.value.tasks?.forEach((t) => t.logs?.forEach((l) => visit(l.photos)))
    state.value.issues?.forEach((i) => {
      visit(i.photos)
      i.resolutionSteps?.forEach((st) => visit(st.photos))
    })
    state.value.usageGuides?.forEach((g) => g.steps?.forEach((st) => visit(st.photos)))
    return found
  }

  let photosMigrating = false
  async function migrateInlinePhotos() {
    if (!firebaseEnabled || !db || photosMigrating) return
    const inline = collectInlinePhotos()
    if (!inline.length) return
    photosMigrating = true
    try {
      for (const p of inline) {
        if (p.id) {
          await setDoc(doc(db, 'photos', p.id), {
            dataUrl: p.dataUrl,
            contentType: p.contentType || 'image/jpeg',
            createdAt: p.createdAt || new Date().toISOString(),
          })
          photoCache.value = { ...photoCache.value, [p.id]: p.dataUrl }
        }
        delete p.dataUrl
      }
      await persistAll()
    } catch (e) {
      console.warn('[farmStore] 사진 이전 실패', e)
    } finally {
      photosMigrating = false
    }
  }

  // 현재 데이터가 참조하는 모든 사진 id 집합
  function currentReferencedPhotoIds() {
    const ids = new Set()
    const visit = (arr) => {
      if (!Array.isArray(arr)) return
      for (const p of arr) if (p?.id) ids.add(p.id)
    }
    state.value.facilities?.forEach((f) => visit(f.photos))
    state.value.ancillaries?.forEach((a) => visit(a.photos))
    state.value.seedlings?.forEach((s) => s.growthLogs?.forEach((l) => visit(l.photos)))
    state.value.tasks?.forEach((t) => t.logs?.forEach((l) => visit(l.photos)))
    state.value.issues?.forEach((i) => {
      visit(i.photos)
      i.resolutionSteps?.forEach((st) => visit(st.photos))
    })
    state.value.usageGuides?.forEach((g) => g.steps?.forEach((st) => visit(st.photos)))
    return ids
  }

  // 직전 저장 시점에 참조되던 사진 id (이전·로드 시 시드)
  let knownPhotoIds = new Set()

  // init()이 최초 로드 직후 호출해 "지금 참조 중인 사진" 스냅샷을 기준점으로 삼는다.
  function resetKnownPhotoIds() {
    knownPhotoIds = currentReferencedPhotoIds()
  }

  // persistAll 직후 호출: 더 이상 참조되지 않는 사진 문서를 정리한다.
  // 폼 취소는 state를 바꾸지 않으므로 자연히 삭제 대상에서 제외된다.
  // 사진은 전역 컬렉션이지만, 다른 농장이 참조하는 사진 id는 이 농장의 knownPhotoIds에
  // 애초에 포함되지 않으므로(활성 농장 데이터만 추적) 다른 농장 사진을 지우지 않는다.
  function gcOrphanPhotos() {
    if (!firebaseEnabled || !db) return
    const current = currentReferencedPhotoIds()
    const orphans = [...knownPhotoIds].filter((id) => !current.has(id))
    knownPhotoIds = current
    orphans.forEach((id) => {
      deleteDoc(doc(db, 'photos', id))
        .then(() => {
          const next = { ...photoCache.value }
          delete next[id]
          photoCache.value = next
        })
        .catch((e) => console.warn('[farmStore] 사진 문서 정리 실패', id, e))
    })
  }

  return {
    photoCache,
    loadPhoto,
    photoSrc,
    savePhotos,
    collectInlinePhotos,
    migrateInlinePhotos,
    currentReferencedPhotoIds,
    resetKnownPhotoIds,
    gcOrphanPhotos,
  }
}
