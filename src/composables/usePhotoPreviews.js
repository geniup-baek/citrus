// 사진 파일 여러 장을 압축해 미리보기 메타데이터 배열로 만든다.
// FacilitiesPanel/AncillaryPanel/SeedlingsPanel/UsageGuidePanel/TasksView/IssuesView가
// 전부 이 로직을 거의 그대로 복사해 갖고 있던 것을 여기 하나로 모았다.
import { compressImageFile } from '../utils/imageProcessing.js'
import { uuid } from '../utils/uuid.js'
import { useLocaleStore } from '../stores/localeStore'

// reportKey: 압축 결과 안내 문구("N장 압축, X→Y KB(Z%)")에 쓸 i18n 키.
// 화면마다 접두사만 다르고(예: 'facilities.compressedReport'), 문구 자체와 파라미터는 동일하다.
export function useFilesToPreviews(reportKey) {
  const localeStore = useLocaleStore()

  async function filesToPreviews(files) {
    let originalTotal = 0
    let compressedTotal = 0

    const previews = await Promise.all(
      files.map(async (file) => {
        const compressed = await compressImageFile(file)
        originalTotal += compressed.originalSize
        compressedTotal += compressed.compressedSize
        return {
          id: uuid(),
          name: file.name,
          dataUrl: compressed.dataUrl,
          contentType: compressed.contentType,
          size: compressed.compressedSize,
          width: compressed.width,
          height: compressed.height,
          originalSize: compressed.originalSize,
        }
      }),
    )

    const report = previews.length
      ? localeStore.t(reportKey, {
          count: previews.length,
          from: Math.round(originalTotal / 1024),
          to: Math.round(compressedTotal / 1024),
          ratio: originalTotal > 0 ? Math.round((compressedTotal / originalTotal) * 100) : 100,
        })
      : ''

    return { previews, report }
  }

  return { filesToPreviews }
}
