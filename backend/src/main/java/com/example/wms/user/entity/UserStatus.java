package com.example.wms.user.entity;

public enum UserStatus {
    PENDING,    // 소셜 인증은 됐으나 아직 소속 업체(tenant) 미지정 — 가입 미완성
    ACTIVE,     // 정상 이용
    INACTIVE    // 비활성(퇴사/정지)
}
