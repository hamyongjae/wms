package com.example.wms.container.controller;

import com.example.wms.container.dto.*;
import com.example.wms.container.entity.ContainerStatus;
import com.example.wms.container.service.ContainerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 컨테이너 관리 API.
 *
 * [권한] 인프라 관리(등록/수정/삭제/상태변경)는 ADMIN 전용.
 *   일상 운영인 계약 배정/회수와 조회는 STAFF도 허용.
 */
@RestController
@RequestMapping("/api/containers")
@RequiredArgsConstructor
public class ContainerController {

    private final ContainerService containerService;

    // 컨테이너 등록 — ADMIN
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<ContainerResponse> createContainer(
            @Valid @RequestBody ContainerCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(containerService.createContainer(request));
    }

    // 목록 (창고/상태 필터) — 예: GET /api/containers?warehouseId=1&status=AVAILABLE
    @GetMapping
    public ResponseEntity<Page<ContainerResponse>> listContainers(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) ContainerStatus status,
            Pageable pageable) {
        return ResponseEntity.ok(containerService.listContainers(warehouseId, status, pageable));
    }

    // 단건 조회
    @GetMapping("/{id}")
    public ResponseEntity<ContainerResponse> getContainer(@PathVariable Long id) {
        return ResponseEntity.ok(containerService.getContainer(id));
    }

    // 기본 정보 수정 — ADMIN
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<ContainerResponse> updateContainer(
            @PathVariable Long id,
            @Valid @RequestBody ContainerUpdateRequest request) {
        return ResponseEntity.ok(containerService.updateContainer(id, request));
    }

    // 계약 배정 — 운영(STAFF 허용)
    @PostMapping("/{id}/assign")
    public ResponseEntity<ContainerResponse> assign(
            @PathVariable Long id,
            @Valid @RequestBody ContainerAssignRequest request) {
        return ResponseEntity.ok(containerService.assignToOrder(id, request));
    }

    // 계약 회수 — 운영(STAFF 허용)
    @PostMapping("/{id}/release")
    public ResponseEntity<ContainerResponse> release(@PathVariable Long id) {
        return ResponseEntity.ok(containerService.releaseContainer(id));
    }

    // 상태 변경(점검/폐기 등) — ADMIN
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/{id}/status")
    public ResponseEntity<ContainerResponse> changeStatus(
            @PathVariable Long id,
            @Valid @RequestBody ContainerStatusUpdateRequest request) {
        return ResponseEntity.ok(containerService.changeStatus(id, request));
    }

    // 삭제 — ADMIN
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContainer(@PathVariable Long id) {
        containerService.deleteContainer(id);
        return ResponseEntity.noContent().build();
    }
}
