/**
 * [엑셀 다운로드 공용] 표 데이터를 CSV로 내보낸다. 새 라이브러리(xlsx 등) 없이 브라우저
 * 다운로드만으로 끝내되, UTF-8 BOM을 앞에 붙여 엑셀에서 한글이 깨지지 않게 한다
 * (엑셀은 BOM이 없으면 CSV를 시스템 기본 코드페이지로 오인해 한글을 깨뜬다).
 */

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  // 쉼표·줄바꿈·쌍따옴표가 있으면 쌍따옴표로 감싸고, 내부 쌍따옴표는 두 개로 이스케이프
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
