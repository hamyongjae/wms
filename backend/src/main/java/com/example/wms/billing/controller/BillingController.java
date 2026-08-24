package com.example.wms.billing.controller;

import com.example.wms.billing.dto.*;
import com.example.wms.billing.service.BillingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 청구/미수금 정산 API.
 *
 * [격리] 모든 처리는 서비스 계층에서 현재 tenantId로 강제된다.
 * [권한] 돈에 영향을 주는 조정/이월/정산 확정은 ADMIN(사장님) 전용.
 *   단순 수금 기록·조회는 STAFF도 허용(현장에서 입금 확인).
 */
@RestController
@RequestMapping("/api/billing/ledgers")
@RequiredArgsConstructor
public class BillingController {

    private final BillingService billingService;

    // ===== 원장 생성/발행 =====

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<BillingLedgerResponse> createLedger(
            @Valid @RequestBody LedgerCreateRequest request) {
        BillingLedgerResponse response = billingService.createLedger(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/issue")
    public ResponseEntity<BillingLedgerResponse> issueLedger(
            @PathVariable Long id,
            @RequestBody(required = false) IssueRequest request) {
        return ResponseEntity.ok(billingService.issueLedger(id, request));
    }

    // ===== 조회 =====

    @GetMapping
    public ResponseEntity<Page<BillingLedgerResponse>> listLedgers(
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            Pageable pageable) {
        return ResponseEntity.ok(billingService.listLedgers(from, to, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BillingLedgerResponse> getLedger(@PathVariable Long id) {
        return ResponseEntity.ok(billingService.getLedger(id));
    }

    // [차트] 월별 청구·수금 추이 집계 (기본 6개월) — DB GROUP BY로 계산
    @GetMapping("/stats/monthly")
    public ResponseEntity<List<MonthlyRevenueResponse>> monthlyRevenue(
            @RequestParam(defaultValue = "6") int months) {
        return ResponseEntity.ok(billingService.getMonthlyRevenue(months));
    }

    @GetMapping("/{id}/detail")
    public ResponseEntity<BillingLedgerDetailResponse> getLedgerDetail(@PathVariable Long id) {
        return ResponseEntity.ok(billingService.getLedgerDetail(id));
    }

    @GetMapping("/{id}/payments")
    public ResponseEntity<List<PaymentHistoryResponse>> getPayments(@PathVariable Long id) {
        return ResponseEntity.ok(billingService.getPayments(id));
    }

    // [매출관리 - 입금일 기준] 청구기간 일할계산 없이 실제 입금일 그대로 집계하기 위한 원시 입금 전량
    @GetMapping("/payments/revenue")
    public ResponseEntity<List<RevenuePaymentResponse>> revenuePayments() {
        return ResponseEntity.ok(billingService.getRevenuePayments());
    }

    @GetMapping("/{id}/adjustments")
    public ResponseEntity<List<AdjustmentResponse>> getAdjustments(@PathVariable Long id) {
        return ResponseEntity.ok(billingService.getAdjustments(id));
    }

    // ===== 수금 (부분 수금) — STAFF도 허용 =====

    @PostMapping("/{id}/payments")
    public ResponseEntity<BillingLedgerResponse> recordPayment(
            @PathVariable Long id,
            @Valid @RequestBody PaymentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(billingService.recordPayment(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/payments/{paymentId}/reverse")
    public ResponseEntity<BillingLedgerResponse> reversePayment(@PathVariable Long paymentId) {
        return ResponseEntity.ok(billingService.reversePayment(paymentId));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/payments/{paymentId}/restore")
    public ResponseEntity<BillingLedgerResponse> restorePayment(@PathVariable Long paymentId) {
        return ResponseEntity.ok(billingService.restorePayment(paymentId));
    }

    // ===== 환불 완료 처리 — ADMIN 전용 (환불 대상 금액을 실제 지급 후 마감) =====
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/refund-complete")
    public ResponseEntity<BillingLedgerResponse> completeRefund(@PathVariable Long id) {
        return ResponseEntity.ok(billingService.completeRefund(id));
    }

    // ===== 세금계산서 발행 표시 — ADMIN 전용 (실제 발행은 이 시스템 밖에서, 여기는 체크만) =====
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/tax-invoice")
    public ResponseEntity<BillingLedgerResponse> setTaxInvoiceIssued(
            @PathVariable Long id,
            @Valid @RequestBody TaxInvoiceRequest request) {
        return ResponseEntity.ok(billingService.setTaxInvoiceIssued(id, request.getIssued()));
    }

    // ===== 납기일 변경 — ADMIN 전용 =====
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/due-date")
    public ResponseEntity<BillingLedgerResponse> changeDueDate(
            @PathVariable Long id,
            @Valid @RequestBody DueDateChangeRequest request) {
        return ResponseEntity.ok(billingService.changeDueDate(id, request.getDueDate()));
    }

    // ===== 정산 일정 수정 — ADMIN 전용 (청구기간·기본 청구액을 직접 정정) =====
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<BillingLedgerResponse> editLedger(
            @PathVariable Long id,
            @Valid @RequestBody LedgerEditRequest request) {
        return ResponseEntity.ok(billingService.editLedger(id, request));
    }

    // ===== 정산 기록 삭제 — ADMIN 전용 (입금·조정 내역이 없는 원장만 가능) =====
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteLedger(@PathVariable Long id) {
        billingService.deleteLedger(id);
        return ResponseEntity.noContent().build();
    }

    // ===== 조정/할인 — ADMIN 전용 =====

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/adjustments")
    public ResponseEntity<BillingLedgerResponse> applyAdjustment(
            @PathVariable Long id,
            @Valid @RequestBody AdjustmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(billingService.applyAdjustment(id, request));
    }

    // ===== 중도 출고 정산 =====

    @PostMapping("/{id}/mid-release/preview")
    public ResponseEntity<MidReleaseSettlementResponse> previewMidRelease(
            @PathVariable Long id,
            @Valid @RequestBody MidReleaseRequest request) {
        return ResponseEntity.ok(billingService.previewMidRelease(id, request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/mid-release/apply")
    public ResponseEntity<MidReleaseSettlementResponse> applyMidRelease(
            @PathVariable Long id,
            @Valid @RequestBody MidReleaseRequest request) {
        return ResponseEntity.ok(billingService.applyMidRelease(id, request));
    }

    // ===== 알림 발송 =====

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/notify/payment-request")
    public ResponseEntity<Void> sendPaymentRequest(@PathVariable Long id) {
        billingService.sendPaymentRequest(id);
        return ResponseEntity.accepted().build();
    }

}
