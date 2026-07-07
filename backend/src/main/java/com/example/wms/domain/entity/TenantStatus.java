package com.example.wms.domain.entity; // 💡 폴더 경로가 entity로 되어 있으므로 패키지명을 맞춰줍니다.

public enum TenantStatus {
    ACTIVE,   // 운영 중 (활성화)
    INACTIVE, // 일시 중지
    TERMINATED // 해지됨
}