package com.example.wms.common.exception;

import com.example.wms.auth.exception.DuplicateUsernameException;
import com.example.wms.auth.exception.LocalLoginNotAllowedException;
import com.example.wms.customer.exception.BlacklistedCustomerException;
import com.example.wms.common.dto.ErrorResponse;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // 우리가 던진 IllegalArgumentException 처리 (중복, 없는 id 등) → 400
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), e.getMessage());
        return ResponseEntity.badRequest().body(error);
    }

    // 아이디 중복 가입 시도 → 409 Conflict (리소스 상태 충돌)
    @ExceptionHandler(DuplicateUsernameException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateUsername(DuplicateUsernameException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.CONFLICT.value(), e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    // 블랙리스트 고객 계약 등록 시도 → 409 Conflict (업무 규칙 위반)
    @ExceptionHandler(BlacklistedCustomerException.class)
    public ResponseEntity<ErrorResponse> handleBlacklisted(BlacklistedCustomerException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.CONFLICT.value(), e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    // 소셜 계정으로 로컬 로그인 시도 → 401 Unauthorized (인증 방식 불일치)
    @ExceptionHandler(LocalLoginNotAllowedException.class)
    public ResponseEntity<ErrorResponse> handleLocalLoginNotAllowed(LocalLoginNotAllowedException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.UNAUTHORIZED.value(), e.getMessage());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
    }

    // @Valid 검증 실패 처리 (필수값 누락, @Pattern 규칙 위반 등) → 400
    // 첫 번째 위반 필드의 메시지를 그대로 노출 (아이디/비밀번호 규칙 안내 포함)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().get(0).getDefaultMessage();
        ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), message);
        return ResponseEntity.badRequest().body(error);
    }

    // 서비스 계층 2차 검증(정규식) 실패 → 400
    @ExceptionHandler(InvalidInputException.class)
    public ResponseEntity<ErrorResponse> handleInvalidInput(InvalidInputException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), e.getMessage());
        return ResponseEntity.badRequest().body(error);
    }

    // 도메인 규칙 위반(상태 전이 불가 등) → 409 Conflict
    // 예: 발행은 DRAFT에서만, 완납 원장 취소 불가, 이월할 미수금 없음
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(IllegalStateException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.CONFLICT.value(), e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    // 동시성 충돌: 낙관적 락(@Version) — 다른 트랜잭션이 먼저 수정함 → 409
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimisticLock(ObjectOptimisticLockingFailureException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.CONFLICT.value(),
                "다른 사용자가 먼저 처리했습니다. 최신 상태를 다시 불러온 뒤 시도하세요.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    // 동시성 충돌: 비관적 락 획득 실패(잠금 대기 초과 등) → 409
    @ExceptionHandler(CannotAcquireLockException.class)
    public ResponseEntity<ErrorResponse> handlePessimisticLock(CannotAcquireLockException e) {
        ErrorResponse error = new ErrorResponse(HttpStatus.CONFLICT.value(),
                "다른 처리가 진행 중입니다. 잠시 후 다시 시도하세요.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    // DB 무결성 위반 → 원인별로 메시지를 구분한다.
    //  - FK 위반: 다른 데이터가 참조 중(삭제 불가)
    //  - NOT NULL 위반: 필수 값 누락(보통 스키마 마이그레이션 누락)
    //  - 그 외: 일반 제약 위반
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException e) {
        String cause = e.getMostSpecificCause().getMessage();
        String lower = (cause == null) ? "" : cause.toLowerCase();

        String message;
        if (lower.contains("foreign key") || lower.contains("still referenced")) {
            message = "다른 데이터가 참조하고 있어 삭제할 수 없습니다. "
                    + "배치된 컨테이너·슬롯·계약 등을 먼저 정리한 뒤 다시 시도하세요.";
        } else if (lower.contains("not-null") || lower.contains("not null") || lower.contains("null value")) {
            message = "필수 항목이 비어 있어 저장할 수 없습니다. "
                    + "(DB 스키마가 최신이 아닐 수 있습니다 — 관리자에게 문의하세요)";
        } else if (lower.contains("unique") || lower.contains("duplicate")) {
            message = "이미 존재하는 값이라 저장할 수 없습니다.";
        } else {
            message = "데이터 제약 조건에 위배되어 처리할 수 없습니다.";
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(
                new ErrorResponse(HttpStatus.CONFLICT.value(), message));
    }
}
