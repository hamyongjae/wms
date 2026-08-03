// 앱 포인트 컬러(테마) 관리 유틸.
// <html data-theme="..."> 를 바꾸면 index.css 의 --brand-* 변수가 교체되어 전역 색이 실시간으로 바뀐다.

export type ThemeId = 'teal' | 'blue' | 'violet' | 'emerald' | 'rose' | 'indigo' | 'amber' | 'sky' | 'slate'

export interface ThemeOption {
  id: ThemeId
  label: string
  color: string // 스와치 대표색 (600)
}

export const THEMES: ThemeOption[] = [
  { id: 'teal', label: '틸', color: '#0d8a89' },
  { id: 'blue', label: '블루', color: '#2563eb' },
  { id: 'sky', label: '스카이', color: '#0284c7' },
  { id: 'indigo', label: '인디고', color: '#4f46e5' },
  { id: 'violet', label: '바이올렛', color: '#7c3aed' },
  { id: 'rose', label: '로즈', color: '#e11d48' },
  { id: 'amber', label: '앰버', color: '#d97706' },
  { id: 'emerald', label: '그린', color: '#059669' },
  { id: 'slate', label: '슬레이트', color: '#475569' },
]

const KEY = 'wms.theme'
export const DEFAULT_THEME: ThemeId = 'teal'

export function getTheme(): ThemeId {
  const v = localStorage.getItem(KEY) as ThemeId | null
  return v && THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME
}

/** 미리보기만 적용(저장하지 않음) — 설정 팝업에서 고르는 즉시 화면에 비춰보기 위함 */
export function previewTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}

/** 테마 적용 + 저장 */
export function applyTheme(id: ThemeId): void {
  previewTheme(id)
  localStorage.setItem(KEY, id)
}

/** 앱 시작 시 저장된 테마를 즉시 반영 (플래시 방지) */
export function initTheme(): void {
  document.documentElement.dataset.theme = getTheme()
}
