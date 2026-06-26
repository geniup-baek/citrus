import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage, firebaseEnabled } from '../services/firebase'

// 클라우드 동기화가 켜져 있고 Storage가 준비된 경우에만 사진을 Storage에 올린다.
// 그렇지 않으면(로컬 전용 모드) 기존처럼 base64를 그대로 보관한다.
export const photoStorageEnabled = firebaseEnabled && !!storage

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl)
  return res.blob()
}

async function uploadPhotoBlob(blob, folder, id) {
  const path = `photos/${folder}/${id}.jpg`
  const objectRef = storageRef(storage, path)
  await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' })
  const url = await getDownloadURL(objectRef)
  return { url, path }
}

/**
 * 미리보기(preview) 객체를 영구 저장용 사진 객체로 변환한다.
 * Storage 사용 시 사진을 업로드하고 dataUrl 자리에 다운로드 URL을 넣는다(표시 코드는 URL/base64 모두 처리 가능).
 * storagePath는 추후 삭제용 메타데이터로 보관한다.
 */
export async function finalizePreviewPhoto(preview, folder) {
  const base = {
    id: preview.id,
    name: preview.name,
    contentType: preview.contentType,
    size: preview.size,
    width: preview.width,
    height: preview.height,
    originalSize: preview.originalSize,
    createdAt: new Date().toISOString(),
  }

  if (!photoStorageEnabled) {
    return { ...base, dataUrl: preview.dataUrl }
  }

  const blob = await dataUrlToBlob(preview.dataUrl)
  const { url, path } = await uploadPhotoBlob(blob, folder, preview.id)
  return { ...base, dataUrl: url, storagePath: path }
}

export async function finalizePreviewPhotos(previews, folder) {
  return Promise.all(previews.map((preview) => finalizePreviewPhoto(preview, folder)))
}

export async function deletePhotoByPath(path) {
  if (!photoStorageEnabled || !path) return
  try {
    await deleteObject(storageRef(storage, path))
  } catch (e) {
    // 이미 삭제됐거나 권한 문제 등은 치명적이지 않으므로 경고만 남긴다.
    console.warn('[photoStorage] 사진 삭제 실패', e)
  }
}
