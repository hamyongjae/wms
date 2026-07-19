package com.example.wms.auth.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

/** 직원 주거래 계좌 등록·수정 요청 (관리자 전용) */
@Getter
@NoArgsConstructor
public class StaffAccountRequest {
    private String bankName;
    private String accountNumber;
    private String accountHolder;
}
