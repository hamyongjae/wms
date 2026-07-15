package com.example.wms.common.exception;

import com.example.wms.common.dto.ErrorResponse;
import org.springframework.dao.CannotAcquireLockException;
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

    // @Valid 검증 실패 처리 (필수값 누락 등) → 400
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().get(0).getDefaultMessage();
        ErrorResponse error = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), message);
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
}
