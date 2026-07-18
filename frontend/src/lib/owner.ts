// 컨테이너 memo 앞머리의 [ ... ] 태그에서 화주(고객)명을 추출하는 공용 유틸.
// 과거 데이터의 규격(20ft/40ft)·소유구분(자가/임차) 토큰은 걸러낸다.
// 예: "[20ft · 자가 · 대원] 특이사항" → "대원", "[대원]" → "대원", "[20ft · 자가]" → null

export function extractOwner(memo?: string | null): string | null {
  if (!memo) return null
  const m = memo.match(/^\[([^\]]+)\]/)
  if (!m) return null
  const tokens = m[1]
    .split('·')
    .map((t) => t.trim())
    .filter((t) => t && !/^\d+ft$/i.test(t) && t !== '자가' && t !== '임차')
  return tokens.length > 0 ? tokens.join(' · ') : null
}
