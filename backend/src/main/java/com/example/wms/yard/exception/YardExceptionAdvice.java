package com.example.wms.yard.exception;

import com.example.wms.common.dto.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 보관창고 도메인 예외 → 409 Conflict.
 * (이미 컨테이너가 있는 위치에 적재하려는 경우)
 */
@RestControllerAdvice
public class YardExceptionAdvice {

    @ExceptionHandler(LocationFullException.class)
    public ResponseEntity<ErrorResponse> handleLocationFull(LocationFullException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(HttpStatus.CONFLICT.value(), e.getMessage()));
    }
}
