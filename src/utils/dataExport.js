// 목록 내보내기 공용 유틸 (재고·방제이력·가용농약의 CSV 다운로드 / PDF 출력)
import { confirm } from '../composables/useConfirm'
import { t } from '../stores/localeStore'

const EXPORT_TEXT = {
  csv: { title: 'confirm.csvTitle', message: 'confirm.csvFiltered', label: 'common.download' },
  pdf: { title: 'confirm.pdfTitle', message: 'confirm.pdfFiltered', label: 'inventory.printReport' },
}

// 목록에 필터가 걸려 있으면 내보내는 것이 전체가 아님을 먼저 알린다.
// 반환값이 false면 내보내기를 중단한다.
export function confirmFilteredExport({ filtered, shown, total, kind = 'csv' }) {
  if (!filtered || shown >= total) return Promise.resolve(true)
  const text = EXPORT_TEXT[kind] ?? EXPORT_TEXT.csv
  return confirm({
    title: t(text.title),
    message: t(text.message, { shown, total }),
    confirmLabel: t(text.label),
  })
}

export function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

// ── PDF/인쇄 ────────────────────────────────────────────────────────────────
// 외부 라이브러리 없이 브라우저 인쇄 → 'PDF로 저장'을 사용한다(한글 폰트 문제 없음).
export function htmlCell(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
}

// rows: [값...] 배열, 또는 행 강조가 필요하면 { cells: [값...], cls: 'row-expired' }
export function openPrintReport({ title, meta = '', headers, rows, autoPrint = false }) {
  const bodyRows = rows.map((row) => {
    const cells = Array.isArray(row) ? row : row.cells
    const cls = Array.isArray(row) ? '' : (row.cls || '')
    return `<tr class="${cls}">${cells.map((c) => `<td>${htmlCell(c)}</td>`).join('')}</tr>`
  }).join('')

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>${htmlCell(title)}</title>
<style>
  * { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
  body { margin: 24px; color: #1a1a1a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  .row-expired td { color: #c0392b; font-weight: 700; }
  .row-soon td { color: #d35400; }
  @media print { body { margin: 0; } th { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h1>${htmlCell(title)}</h1>
<p class="meta">${htmlCell(meta)}</p>
<table><thead><tr>${headers.map((h) => `<th>${htmlCell(h)}</th>`).join('')}</tr></thead>
<tbody>${bodyRows}</tbody></table>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  if (autoPrint) setTimeout(() => win.print(), 300)
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// 파일명에 쓸 수 없는 문자(농장 이름에 섞여 있을 수 있다)를 걸러낸다.
function safeFileNamePart(value) {
  return String(value ?? '').replace(/[\\/:*?"<>|]/g, '').trim()
}

// "농장이름-내용-날짜.csv" — 농장 이름이 없으면(관리 모드 등) 그 부분을 생략한다.
export function exportFileName({ farmName, label, date, ext = 'csv' }) {
  return `${[safeFileNamePart(farmName), label, date].filter(Boolean).join('-')}.${ext}`
}

// rows: [[헤더...], [값...], ...]
export function downloadCsv(rows, fileName) {
  const BOM = String.fromCodePoint(0xfeff) // 엑셀에서 한글 깨짐 방지
  const csv = BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
