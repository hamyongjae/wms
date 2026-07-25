import { useMemo, useState } from 'react'

/**
 * 회원가입 입력 유효성 검증 (프론트 1차 방어).
 * 백엔드 ValidationPatterns 와 "동일한 규칙"을 사용해야 하므로 정규식을 그대로 맞춘다.
 */

// [이메일 ID] 로그인 아이디 = 이메일. 백엔드 ValidationPatterns.EMAIL 과 동일 규칙.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 비밀번호: 영문(대/소) + 숫자 + 특수문자 각 1개 이상, 8~20자
export const PASSWORD_REGEX =
  /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,20}$/

export const EMAIL_MESSAGE = '이메일 형식이 올바르지 않습니다.'
export const PASSWORD_MESSAGE = '영문, 숫자, 특수문자를 혼합하여 8~20자로 입력해 주세요.'

/** 이메일 검증 — 통과 시 null, 실패 시 안내 메시지 반환. */
export function validateEmail(value: string): string | null {
  if (value.length === 0) return null // 미입력 상태에선 에러 미표시
  return EMAIL_REGEX.test(value) ? null : EMAIL_MESSAGE
}

/** 비밀번호 검증 — 통과 시 null, 실패 시 안내 메시지 반환. */
export function validatePassword(value: string): string | null {
  if (value.length === 0) return null
  return PASSWORD_REGEX.test(value) ? null : PASSWORD_MESSAGE
}

/** 비밀번호 확인 일치 검증. */
export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (confirm.length === 0) return null
  return password === confirm ? null : '비밀번호가 일치하지 않습니다.'
}

export interface CredentialState {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  confirm: string
  setConfirm: (v: string) => void

  emailError: string | null
  passwordError: string | null
  confirmError: string | null

  emailValid: boolean
  passwordValid: boolean
  confirmValid: boolean
  /** 세 필드 모두 규칙 통과 시 true (가입 버튼 활성화 기준). */
  allValid: boolean
}

/**
 * [이메일 ID] 이메일/비밀번호/비밀번호확인을 실시간 검증하는 커스텀 훅.
 * - 값 변경 시마다 정규식으로 즉시 체크
 * - 각 입력창 아래에 띄울 에러 메시지 제공
 * - allValid 로 가입 버튼 활성화/비활성화 제어
 */
export function useCredentialValidation(): CredentialState {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const emailError = useMemo(() => validateEmail(email), [email])
  const passwordError = useMemo(() => validatePassword(password), [password])
  const confirmError = useMemo(() => validatePasswordConfirm(password, confirm), [password, confirm])

  const emailValid = EMAIL_REGEX.test(email)
  const passwordValid = PASSWORD_REGEX.test(password)
  const confirmValid = confirm.length > 0 && password === confirm

  return {
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    emailError,
    passwordError,
    confirmError,
    emailValid,
    passwordValid,
    confirmValid,
    allValid: emailValid && passwordValid && confirmValid,
  }
}
