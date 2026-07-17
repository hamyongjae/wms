package com.example.wms.auth.invite;

public enum InviteStatus {
    PENDING,    // 발송/등록됨, 아직 미수락
    ACCEPTED,   // 소셜 로그인으로 매핑 완료
    REVOKED     // 관리자가 취소
}
