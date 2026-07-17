/**
 * 스마트 창고 · 컨테이너 보관창고 컨셉 일러스트 (순수 SVG, 무저작권).
 * 딥 네이비 히어로 배경 위에 얹히도록 밝은 스트로크와 브랜드 블루 톤으로 구성했다.
 * - 재사용: className 으로 크기 지정, 색은 자체 완결
 */
export default function WarehouseArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 300"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8eaedd" stopOpacity="0.10" />
          <stop offset="1" stopColor="#8eaedd" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wa-shed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a62b0" />
          <stop offset="1" stopColor="#243d76" />
        </linearGradient>
        <linearGradient id="wa-c1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5c86ca" />
          <stop offset="1" stopColor="#3a62b0" />
        </linearGradient>
        <linearGradient id="wa-c2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7aa2e3" />
          <stop offset="1" stopColor="#4f79bd" />
        </linearGradient>
      </defs>

      {/* 하늘 은은한 글로우 */}
      <circle cx="360" cy="70" r="120" fill="url(#wa-sky)" />

      {/* 스마트 노드 네트워크 (IoT 센서 느낌) */}
      <g stroke="#8eaedd" strokeOpacity="0.45" strokeWidth="1">
        <line x1="70" y1="52" x2="150" y2="86" />
        <line x1="150" y1="86" x2="250" y2="46" />
        <line x1="250" y1="46" x2="360" y2="78" />
        <line x1="360" y1="78" x2="420" y2="48" />
      </g>
      <g fill="#a9c4ee">
        <circle cx="70" cy="52" r="3" />
        <circle cx="150" cy="86" r="3" />
        <circle cx="250" cy="46" r="3" />
        <circle cx="360" cy="78" r="3" />
        <circle cx="420" cy="48" r="3" />
      </g>
      {/* 강조 노드 (앰버 포인트 1개) */}
      <circle cx="250" cy="46" r="5.5" fill="none" stroke="#f5b74e" strokeWidth="1.5" strokeOpacity="0.8" />

      {/* 갠트리 크레인 (창고 위 포털 크레인) */}
      <g stroke="#a9c4ee" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round">
        <line x1="118" y1="96" x2="118" y2="196" />
        <line x1="212" y1="96" x2="212" y2="196" />
        <line x1="106" y1="96" x2="224" y2="96" />
      </g>
      <rect x="150" y="96" width="26" height="9" rx="2" fill="#a9c4ee" fillOpacity="0.75" />
      <line x1="163" y1="105" x2="163" y2="132" stroke="#a9c4ee" strokeOpacity="0.7" strokeWidth="1.5" />
      <rect x="152" y="132" width="22" height="14" rx="2" fill="#f5b74e" fillOpacity="0.85" />

      {/* 창고 본동 (아치 지붕 셰드) */}
      <path d="M250 196 V132 q47 -26 94 0 V196 Z" fill="url(#wa-shed)" />
      <path
        d="M250 132 q47 -26 94 0"
        stroke="#a9c4ee"
        strokeOpacity="0.5"
        strokeWidth="2"
        fill="none"
      />
      {/* 셔터 도어 */}
      <rect x="284" y="150" width="26" height="46" rx="2" fill="#16233d" fillOpacity="0.55" />
      <g stroke="#8eaedd" strokeOpacity="0.35" strokeWidth="1">
        <line x1="284" y1="160" x2="310" y2="160" />
        <line x1="284" y1="170" x2="310" y2="170" />
        <line x1="284" y1="180" x2="310" y2="180" />
      </g>

      {/* 적재 컨테이너 블록 */}
      {/* 좌측 2단 */}
      <Container x={120} y={158} fill="url(#wa-c1)" />
      <Container x={120} y={177} fill="url(#wa-c2)" />
      <Container x={166} y={177} fill="url(#wa-c1)" />
      {/* 우측 2단 */}
      <Container x={356} y={158} fill="url(#wa-c2)" />
      <Container x={356} y={177} fill="url(#wa-c1)" />
      <Container x={402} y={177} fill="url(#wa-c2)" />

      {/* 지면 라인 */}
      <line x1="24" y1="196" x2="456" y2="196" stroke="#a9c4ee" strokeOpacity="0.35" strokeWidth="2" />
      <g stroke="#8eaedd" strokeOpacity="0.18" strokeWidth="1">
        <line x1="60" y1="196" x2="44" y2="212" />
        <line x1="140" y1="196" x2="128" y2="212" />
        <line x1="330" y1="196" x2="318" y2="212" />
        <line x1="420" y1="196" x2="408" y2="212" />
      </g>
    </svg>
  )
}

/* 개별 컨테이너 유닛 (골판 무늬 포함) */
function Container({ x, y, fill }: { x: number; y: number; fill: string }) {
  const w = 42
  const h = 18
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill={fill} />
      <rect
        x={x + 0.5}
        y={y + 0.5}
        width={w - 1}
        height={h - 1}
        rx="1.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.16"
      />
      <g stroke="#16233d" strokeOpacity="0.28" strokeWidth="1">
        <line x1={x + 8} y1={y + 3} x2={x + 8} y2={y + h - 3} />
        <line x1={x + 16} y1={y + 3} x2={x + 16} y2={y + h - 3} />
        <line x1={x + 26} y1={y + 3} x2={x + 26} y2={y + h - 3} />
        <line x1={x + 34} y1={y + 3} x2={x + 34} y2={y + h - 3} />
      </g>
    </g>
  )
}
