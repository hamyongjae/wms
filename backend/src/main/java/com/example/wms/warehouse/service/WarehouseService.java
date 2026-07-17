package com.example.wms.warehouse.service;

import com.example.wms.warehouse.dto.WarehouseCreateRequest;
import com.example.wms.warehouse.dto.WarehouseResponse;
import com.example.wms.warehouse.dto.WarehouseUpdateRequest;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.warehouse.repository.WarehouseRepository;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.yard.repository.YardSlotRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WarehouseService {

    private final WarehouseRepository warehouseRepository;
    private final TenantRepository tenantRepository;   // 업체 확인용
    private final ContainerRepository containerRepository; // 삭제 전 참조 검사
    private final YardSlotRepository yardSlotRepository;    // 창고 종속 슬롯 정리

    // 창고 등록
    @Transactional
    public WarehouseResponse createWarehouse(WarehouseCreateRequest request) {

        // [격리] 소속 업체는 로그인 토큰에서 결정
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. id=" + tenantId));

        // tenantId(숫자) → Tenant(객체)로 바꿔서 창고 생성
        Warehouse warehouse = new Warehouse(
                request.getName(),
                request.getAddress(),
                request.getPhone(),
                tenant
        );

        Warehouse saved = warehouseRepository.save(warehouse);
        return new WarehouseResponse(saved);
    }

    // 내 업체의 창고 목록 조회
    @Transactional(readOnly = true)
    public List<WarehouseResponse> getWarehouses() {
        Long tenantId = SecurityUtils.getCurrentTenantId();   // [격리]
        return warehouseRepository.findByTenantId(tenantId)
                .stream()
                .map(WarehouseResponse::new)
                .toList();
    }

    // 창고 정보 수정
    @Transactional
    public WarehouseResponse updateWarehouse(Long id, WarehouseUpdateRequest request) {
        Warehouse warehouse = findWarehouseOrThrow(id);

        warehouse.updateInfo(
                request.getName(),
                request.getAddress(),
                request.getPhone()
        );

        return new WarehouseResponse(warehouse);
    }

    // 창고 삭제
    // [규칙] 컨테이너가 등록돼 있으면 삭제 불가(개수 안내). 보관창고 슬롯(격자)은
    //   창고에 종속된 구조물이므로 창고와 함께 자동 정리한다.
    @Transactional
    public void deleteWarehouse(Long id) {
        Warehouse warehouse = findWarehouseOrThrow(id);
        Long tenantId = SecurityUtils.getCurrentTenantId();

        long containerCount = containerRepository.countByTenantIdAndWarehouseId(tenantId, id);
        if (containerCount > 0) {
            throw new IllegalStateException(
                    "이 창고에 등록된 컨테이너 " + containerCount + "개가 있어 삭제할 수 없습니다. "
                            + "컨테이너를 먼저 이동하거나 삭제한 뒤 다시 시도하세요.");
        }

        // 컨테이너가 없으므로 남은 슬롯은 모두 공실 — 창고와 함께 정리
        yardSlotRepository.deleteByTenantIdAndWarehouseId(tenantId, id);
        warehouseRepository.delete(warehouse);
    }

    // 공통: id로 창고 찾되 [격리] 내 tenant 소유일 때만
    private Warehouse findWarehouseOrThrow(Long id) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return warehouseRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 창고입니다. id=" + id));
    }
}