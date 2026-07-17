package com.example.wms.customer.exception;

/**
 * 블랙리스트 고객 명의로 신규 계약을 등록하려 할 때 던지는 예외.
 *
 * 프론트 하드가드(등록 버튼 비활성)를 우회한 원시 요청까지 백엔드에서 차단해
 * 데이터 오염을 원천 방지한다. GlobalExceptionHandler에서 409로 변환.
 */
public class BlacklistedCustomerException extends RuntimeException {

    public BlacklistedCustomerException(String customerName) {
        super("블랙리스트 고객(" + customerName + ")은 신규 계약을 등록할 수 없습니다. "
                + "먼저 고객 상태를 정상으로 전환하세요.");
    }
}
