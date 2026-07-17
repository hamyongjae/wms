package com.example.wms.container.entity;

public enum ContainerStatus {
    AVAILABLE,    // 빈 컨테이너 (배정 가능)
    OCCUPIED,     // 사용 중 (계약 배정됨)
    MAINTENANCE,  // 점검/수리 중
    RETIRED       // 폐기/사용 종료
}
