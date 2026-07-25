// 접두사 없이 순번으로 컨테이너 번호 자동 채번.
// 기존 숫자 번호 중 최대값 + 1 (없으면 1001부터). 업체 내 유일 제약을 만족시키기 위한 클라이언트 사전 계산.
export function nextContainerNo(existing: Set<string>): string {
  let max = 1000
  for (const no of existing) {
    if (/^\d+$/.test(no)) {
      const n = parseInt(no, 10)
      if (n > max) max = n
    }
  }
  return String(max + 1)
}
