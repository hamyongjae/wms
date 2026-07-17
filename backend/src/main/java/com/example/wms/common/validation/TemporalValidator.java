package com.example.wms.common.validation;

import com.example.wms.common.exception.InvalidInputException;

import java.time.LocalDate;

/**
 * 물류 계약·입출고 날짜 정합성 검증 (서비스 계층 최전선 2차 방어).
 *
 * 프론트 검증을 우회한 원시 요청까지 막아 데이터 왜곡(음수 보관료·기간 역전)을 원천 차단한다.
 * 위반 시 InvalidInputException → GlobalExceptionHandler에서 400.
 */
public final class TemporalValidator {

    private TemporalValidator() {
    }

    /** 계약 기간: 종료일 >= 시작일 (당일 계약 허용). */
    public static void validateContractPeriod(LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new InvalidInputException("계약 종료일은 시작일보다 빠를 수 없습니다. 날짜를 다시 확인해 주세요.");
        }
    }

    /** 실제 입고 확정일은 미래일 수 없다. (예약 건은 이 검증을 호출하지 않는다) */
    public static void validateInboundNotFuture(LocalDate inbound) {
        if (inbound != null && inbound.isAfter(LocalDate.now())) {
            throw new InvalidInputException("입고일은 오늘 이후로 지정할 수 없습니다.");
        }
    }

    /** 출고(예정)일은 입고일보다 과거일 수 없다. */
    public static void validateOutboundAfterInbound(LocalDate inbound, LocalDate outbound) {
        if (inbound != null && outbound != null && outbound.isBefore(inbound)) {
            throw new InvalidInputException("출고일은 입고일보다 빠를 수 없습니다. 입출고 일시를 다시 확인해 주세요.");
        }
    }
}
