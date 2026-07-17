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
        return ResponseEntit