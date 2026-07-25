export interface RevenuePoint {
  label: string // 예: '7월'
  billed: number // 청구 총액
  collected: number // 수금액
}

/**
 * 순수 SVG 경량 그룹 막대 차트 (외부 라이브러리 무의존).
 * 월별 '청구 총액' vs '수금액'을 나란히 비교한다.
 * viewBox 기반이라 컨테이너 폭에 맞춰 반응형으로 늘어난다.
 */
export default function RevenueBarChart({ data }: { data: RevenuePoint[] }) {
  const W = 720
  const H = 300
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const rawMax = Math.max(1, ...data.flatMap((d) => [d.billed, d.collected]))
  const max = niceCeil(rawMax)

  const n = Math.max(1, data.length)
  const groupW = plotW / n
  const barW = Math.min(26, groupW * 0.3)

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i)

  const yOf = (v: number) => padT + plotH - (v / max) * plotH

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="월별 청구·수금 차트">
        {/* 격자 + y축 라벨 */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="#eef2f6" strokeWidth={1} />
            <text x={padL - 8} y={yOf(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {compact(t)}
            </text>
          </g>
        ))}

        {/* 막대 */}
        {data.map((d, i) => {
          const cx = padL + groupW * (i + 0.5)
          const billedX = cx - barW - 2
          const collectedX = cx + 2
          const billedH = (d.billed / max) * plotH
          const collectedH = (d.collected / max) * plotH
          return (
            <g key={d.label}>
              <rect x={billedX} y={padT + plotH - billedH} width={barW} height={billedH} rx={3} fill="#6366f1">
                <title>{`${d.label} 청구 ${fmt(d.billed)}원`}</title>
              </rect>
              <rect x={collectedX} y={padT + plotH - collectedH} width={barW} height={collectedH} rx={3} fill="#10b981">
                <title>{`${d.label} 수금 ${fmt(d.collected)}원`}</title>
              </rect>
              <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#64748b">
                {d.label}
              </text>
            </g>
          )
        })}

        {/* x축 바닥선 */}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#e2e8f0" strokeWidth={1} />
      </svg>

      {/* 범례 */}
      <div className="mt-2 flex items-center justify-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> 청구 총액
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> 수금액
        </span>
      </div>
    </div>
  )
}

/* ===== 유틸 ===== */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

// 축 라벨용 축약: 1,200,000 → 120만
function compact(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1)}억`
  if (n >= 10000) return `${Math.round(n / 10000)}만`
  return String(Math.round(n))
}
