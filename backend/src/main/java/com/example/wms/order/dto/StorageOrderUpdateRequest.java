package com.example.wms.order.dto;

import com.example.wms.billing.entity.PaymentMethod;
import com.example.wms.billing.entity.SettlementType;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class StorageOrderUpdateRequest {

    private LocalDate storageStartDate;   // 보관 시작일 (편집 허용)
    private LocalDate expectedEndDate;
    private Integer monthlyFee;
    private Double capacityTons;   // 보관 용량(톤)
    private String memo;

    // ===== 청구 조건 (등록 화면과 동일하게 수정 가능) =====
    private SettlementType paymentType;   // 선불/후불 — 변경 시 활성 원장 자동 재정산
    private PaymentMethod paymentMethod;  // 계좌이체/현금/카드
    private Long settlementUserId;        // 입금 계좌(담당 직원)
    private LocalDate dueDate;            // 납기일
}