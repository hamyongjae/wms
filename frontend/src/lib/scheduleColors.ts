import type { ScheduleCategory } from '@/lib/orderSchedule'

/**
 * ===== [달력 상태 색상 — 사용자 지정] =====
 *
 * 대시보드 미니달력·입출고 일정 화면이 쓰는 5개 상태색을 사용자가 직접 고를 수 있게 한다.
 *
 * <h3>왜 CSS 변수인가</h3>
 * Tailwind 의 임의값 클래스(`bg-[#5A748F]`)는 빌드 시점에 CSS 로 컴파일된다.
 * 런타임에 만든 문자열은 클래스가 존재하지 않아 색이 아예 먹지 않는다.
 * 그래서 색은 CSS 변수(`--sched-IN_PENDING-bg` 등)로 <html> 에 심고,
 * 컴포넌트는 인라인 style 에서 `var(...)` 로 참조한다.
 *
 * 덤으로 얻는 것: 저장 즉시 전 화면이 다시 칠해진다. 리렌더 신호를 돌릴 필요가 없다
 * (CSS 변수는 브라우저가 스스로 전파한다) — 기존 테마(data-theme) 방식과 같은 원리다.
 *
 * <h3>저장 위치</h3>
 * localStorage. 포인트 컬러 테마와 동일한 정책이라 기기마다 따로 지정한다.
 */

/** 한 상태에서 파생되는 세 가지 색 (배지 배경 / 글자 / 테두리) */
export interface DerivedColor {
  bg: string
  fg: string
  ring: string
}

/* 상태별 기본 색 — 기존 하드코딩 값(뮤티드 톤)을 그대로 승계해 업그레이드 후에도 화면이 같아 보인다 */
export const DEFAULT_SCHEDULE_COLORS: Record<ScheduleCategory, string> = {
  IN_PENDING: '#5A748F',
  IN_DONE: '#3E5C76',
  IN_INDEFINITE: '#6B5B95',
  OUT_PENDING: '#A65B44',
  OUT_DONE: '#7A3F2D',
}

/**
 * 선택 팔레트 — 7개 색상 계열 × 5단계 농도.
 * 원색을 그대로 쓰면 현장 화면이 번잡해지므로 채도를 눌러 익힌 톤으로 구성했다.
 * 가로 = 계열, 세로 = 진한 것 → 옅은 것 (요청 화면과 동일한 배치).
 */
export const SCHEDULE_PALETTE: string[][] = [
  ['#8C4A4A', '#A9635F', '#C08A83', '#D6B0A9', '#EBD6D1'], // 레드
  ['#8A5133', '#A97049', '#C29173', '#D8B79F', '#EDDCCE'], // 브라운
  ['#8A6A2A', '#A98C46', '#C2AC72', '#D8C99F', '#EDE3CE'], // 올리브
  ['#3F6B5E', '#5A8C7B', '#83AC9C', '#AECABD', '#D7E5DC'], // 그린
  ['#3E5C76', '#5A748F', '#8095AC', '#AAB9C8', '#D4DDE7'], // 블루
  ['#584B7C', '#6B5B95', '#8E82AE', '#B4ACC8', '#DAD6E4'], // 퍼플
  ['#4A4F55', '#666C74', '#8D939A', '#B5BABF', '#DCDEE1'], // 그레이
]

const STORAGE_KEY = 'wms.scheduleColors'
const CATEGORIES: ScheduleCategory[] = ['IN_PENDING', 'IN_DONE', 'IN_INDEFINITE', 'OUT_PENDING', 'OUT_DONE']
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * 기준색에서 배지용 3색을 만든다.
 *   bg   = 흰색과 87% 섞은 아주 옅은 톤 (글자가 또렷하게 얹히는 바탕)
 *   ring = 흰색과 75% 섞은 톤 (경계만 살짝 잡아주는 테두리)
 *   fg   = 기준색 그대로 (가장 진한 값이라 대비를 확보)
 * 한 색만 고르면 세 값이 자동으로 따라오므로, 사용자는 색을 하나만 선택하면 된다.
 */
export function deriveColor(base: string): DerivedColor {
  return { bg: mixWithWhite(base, 0.87), fg: base, ring: mixWithWhite(base, 0.75) }
}

/** hex 를 흰색과 ratio(0~1) 만큼 섞는다. ratio 가 클수록 옅어진다. */
function mixWithWhite(hex: string, ratio: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (shift: number) => {
    const c = (n >> shift) & 0xff
    return Math.round(c + (255 - c) * ratio)
  }
  const [r, g, b] = [mix(16), mix(8), mix(0)]
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** 저장된 사용자 지정 색(없거나 손상됐으면 기본값으로 보정) */
export function getScheduleColors(): Record<ScheduleCategory, string> {
  const result = { ...DEFAULT_SCHEDULE_COLORS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const saved = JSON.parse(raw) as Partial<Record<ScheduleCategory, unknown>>
    for (const cat of CATEGORIES) {
      const v = saved[cat]
      // 손상된 값 하나 때문에 전체가 깨지지 않도록 항목 단위로 검증한다
      if (typeof v === 'string' && HEX.test(v)) result[cat] = v
    }
  } catch {
    // JSON 파싱 실패 등 — 조용히 기본값 유지 (색 설정 때문에 앱이 멈추면 안 된다)
  }
  return result
}

/** <html> 에 CSS 변수를 심는다. 저장은 하지 않는다(미리보기용). */
export function paintScheduleColors(colors: Record<ScheduleCategory, string>): void {
  const root = document.documentElement
  for (const cat of CATEGORIES) {
    const d = deriveColor(colors[cat])
    root.style.setProperty(`--sched-${cat}-bg`, d.bg)
    root.style.setProperty(`--sched-${cat}-fg`, d.fg)
    root.style.setProperty(`--sched-${cat}-ring`, d.ring)
  }
}

/** 색을 적용하고 저장한다. */
export function applyScheduleColors(colors: Record<ScheduleCategory, string>): void {
  paintScheduleColors(colors)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
}

/** 기본 색으로 되돌린다. */
export function resetScheduleColors(): Record<ScheduleCategory, string> {
  localStorage.removeItem(STORAGE_KEY)
  paintScheduleColors(DEFAULT_SCHEDULE_COLORS)
  return { ...DEFAULT_SCHEDULE_COLORS }
}

/** 앱 시작 시 저장된 색을 즉시 반영 (첫 렌더에서 기본색이 스쳤다 바뀌는 깜빡임 방지) */
export function initScheduleColors(): void {
  paintScheduleColors(getScheduleColors())
}
