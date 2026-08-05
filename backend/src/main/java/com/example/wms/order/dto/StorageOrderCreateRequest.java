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

    // 정산서 생성 방식 — true(자동, 기본값): 매월 배치가 이 계약도 자동 청구. false(수동): 배치 대상에서 제외, 관리자가 직접 생성.
    // 미지정 시 true(자동)로 서버가 안전 기본값 적용(매출 구멍 방지). 폼 초기 선택값은 프론트에서 '수동'을 기본으로 노출하되 값은 항상 명시 전송한다.
    private Boolean autoBillingEnabled;

    // [정산서 생성 주기] autoBillingEnabled가 true일 때만 의미 있음. 미지정 시 1(개월).
    private Integer billingCycleMonths;
}