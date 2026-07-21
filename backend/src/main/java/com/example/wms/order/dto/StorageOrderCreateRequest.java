package com.example.wms.order.dto;

import com.example.wms.billing.entity.SettlementType;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class StorageOrderCreateRequest {

    @NotNull(message = "고객 id는 필수입니다")
    private Long customerId;

    @NotNull(message = "창고 id는 필수입니다")
    private Long warehouseId;

    @NotNull(message = "보관 시작일은 필수입니다")
    private LocalDate storageStartDate;

    private LocalDate expectedEndDate;

    @NotNull(message = "월 보관료는 필수입니다")
    private Integer monthlyFee;

    private Double capacityTons;   // 보관 용량(톤)
    private String memo;

    // 결제 방식 — PREPAID(선불)면 계약 등록과 동시에 청구·수금까지 자동 처리. 미지정 시 후불.
    private SettlementType paymentType;

    // 납기일자 — 청구서의 대금 회수 기준일.
    //  · 미지정 시 결제 방식별 기본값으로 서버가 자동 세팅 (선불=보관 시작일, 후불=보관 종료일)
    //  · 프론트에서 결제 방식에 맞춰 기본값을 채워 보내되, 관리자가 특이 케이스에 수동 변경 가능
    private LocalDate dueDate;

    // 결제 수단 (계좌이체/현금/카드) — 미지정 시 계좌이체
    private com.example.wms.billing.entity.PaymentMethod paymentMethod;

    // 계좌이체 시 수납 계좌를 참조할 담당 직원 id
    private Long settlementUserId;
}