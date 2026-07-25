// 조건부 className 을 합치는 아주 작은 유틸 (clsx 대체)
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
