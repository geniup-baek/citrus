// 사진 확대보기(라이트박스) 열기/닫기 상태 — 뒤로가기로 닫히는 동작(useLightboxBack)까지 포함한다.
// FacilitiesPanel/AncillaryPanel/SeedlingsPanel/UsageGuidePanel/TasksView/IssuesView가
// 전부 이 3줄짜리 상태를 복사해 갖고 있던 것을 여기 하나로 모았다.
import { ref } from 'vue'
import { useLightboxBack } from './useLightboxBack'

export function useLightbox() {
  const lightboxPhoto = ref(null)
  useLightboxBack(lightboxPhoto)

  function openLightbox(photo) {
    lightboxPhoto.value = photo
  }

  function closeLightbox() {
    lightboxPhoto.value = null
  }

  return { lightboxPhoto, openLightbox, closeLightbox }
}
