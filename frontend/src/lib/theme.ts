// 앱 포인트 컬러(테마) 관리 유틸.
// <html data-theme="..."> 를 바꾸면 index.css 의 --brand-* 변수가 교체되어 전역 색이 실시간으로 바뀐다.

export type ThemeId = 'teal' | 'blue' | 'violet' | 'emerald' | 'rose'

export interface ThemeOption {
  id: ThemeId
  label: string
  color: string // 스와치 대표색 (600)
}

export const THEMES: ThemeOption[] = [
  { id: 'teal', label: '틸', color: '#0d8a89' },
  { id: 'blue', label: '블루', color: '#2563eb' },
  { id: 'violet', label: '바이올렛', color: '#7c3aed' },
  { id: 'emerald', label: '그린', color: '#059669' },
  { id: 'rose', label: '로즈', color: '#e11d48' },
]

const KEY = 'wms.theme'
const DEFAULT: ThemeId = 'teal'

export function getTheme(): ThemeId {
  const v = localStorage.getItem(KEY) as ThemeId | null
  return v && THEMES.some((t) => t.id === v) ? v : DEFAULT
}

/** 테마 적용 + 저장 */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  localStorage.setItem(KEY, id)
}

/** 앱 시작 시 저장된 테마를 즉시 반영 (플래시 방지) */
export function initTheme(): void {
  document.documentElement.dataset.theme = getTheme()
}
