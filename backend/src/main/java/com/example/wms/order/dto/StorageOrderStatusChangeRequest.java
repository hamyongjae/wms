package com.example.wms.order.dto;

import com.example.wms.order.entity.OrderStatus;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * [입/출고 유형별 처리] 계약 상태 전환 요청.
 *
 * - targetStatus: 전환할 상태(INBOUND/OUTBOUND). null이면 현재의 반대로 자동 판정.
 * - actualEndDate: 출고 처리 시 실제 출고일 (중도출고면 예정일보다 이른 날짜).
 * - actualStartDate: 입고(되돌리기) 시 실제 입고일 (지연입고면 조정된 날짜).
 * - settledAmount: 중도출고 실사용 보관료(있으면 이 금액으로 원장 재산정, 없으면 재산정 안 함).
 */
@Getter
@NoArgsConstructor
public class StorageOrderStatusChangeRequest {
    private OrderStatus targetStatus;
    private LocalDate actualEndDate;
    private LocalDate actualStartDate;
    private BigDecimal settledAmount;
}
