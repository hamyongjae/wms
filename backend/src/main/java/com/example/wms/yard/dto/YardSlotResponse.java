package com.example.wms.yard.dto;

import com.example.wms.container.entity.Container;
import com.example.wms.yard.entity.YardSlot;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Getter
public class YardSlotResponse {

    private final Long id;
    private final Long tenantId;
    private final Long warehouseId;
    private final String warehouseName;
    private final String block;
    private final Integer rowNo;
    private final Integer columnNo;
    private final Integer tier;
    private final String locationLabel;
    private final boolean occupied;
    private final boolean active;   // false = 미사용(운영 중지)
    private final Long containerId;
    private final String containerNo;
    // [화주 표시] 계약 등록/수정의 위치 지정 격자에서 "사용중" 칸이 누구 것인지 바로 보이게 한다.
    private final String ownerName;
    private final Long version;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public YardSlotResponse(YardSlot s) {
        this.id = s.getId();
        this.tenantId = s.getTenant().getId();
        this.warehouseId = s.getWarehouse().getId();
        this.warehouseName = s.getWarehouse().getName();
        this.block = s.getBlock();
        this.rowNo = s.getRowNo();
        this.columnNo = s.getColumnNo();
        this.tier = s.getTier();
        this.locationLabel = s.getLocationLabel();
        this.occupied = s.isOccupied();
        this.active = s.isActive();
        this.containerId = s.getContainer() != null ? s.getContainer().getId() : null;
        this.containerNo = s.getContainer() != null ? s.getContainer().getContainerNo() : null;
        this.ownerName = resolveOwnerName(s.getContainer());
        this.version = s.getVersion();
        this.createdAt = s.getCreatedAt();
        this.updatedAt = s.getUpdatedAt();
    }

    /**
     * 화주명 해석: 계약에 정식으로 배정된 컨테이너면 그 계약의 고객명을 그대로 쓴다.
     * 정식 배정이 없으면(레거시 데이터) memo 앞머리의 "[화주명]" 태그에서 추출한다
     * (frontend/src/lib/owner.ts의 extractOwner와 동일 규칙 — 두 쪽을 함께 고쳐야 한다).
     */
    private static String resolveOwnerName(Container container) {
        if (container == null) return null;
        if (container.getCurrentOrder() != null) {
            return container.getCurrentOrder().getCustomer().getName();
        }
        return extractOwnerFromMemo(container.getMemo());
    }

    private static final Pattern MEMO_TAG = Pattern.compile("^\\[([^]]+)]");

    private static String extractOwnerFromMemo(String memo) {
        if (memo == null) return null;
        Matcher m = MEMO_TAG.matcher(memo);
        if (!m.find()) return null;
        StringBuilder sb = new StringBuilder();
        for (String raw : m.group(1).split("·")) {
            String t = raw.trim();
            if (t.isEmpty() || t.matches("(?i)\\d+ft") || t.equals("자가") || t.equals("임차")) continue;
            if (sb.length() > 0) sb.append(" · ");
            sb.append(t);
        }
        return sb.length() > 0 ? sb.toString() : null;
    }
}
