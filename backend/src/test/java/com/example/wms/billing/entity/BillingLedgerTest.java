package com.example.wms.billing.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ===== [청구 원장 상태 전이·잔액 공식 회귀 테스트] =====
 *
 * {@link BillingLedger}는 "잔액 = base + carriedOverIn + adjustmentTotal - paidTotal" 공식과
 * DRAFT→ISSUED→PARTIALLY_PAID→PAID 자동 전이, 중도출고 재산정 스냅샷/원복, 환불 판별을 전부
 * 캡슐화한 도메인 엔티티인데 이전까지 단위 테스트가 하나도 없었다. Hibernate/DB 없이 순수
 * 객체로 검증 가능하므로 통합테스트가 아닌 빠른 단위테스트로 둔다.
 */
class BillingLedgerTest {

    private static final LocalDate START = LocalDate.of(2026, 1, 1);
    private static final LocalDate END = LocalDate.of(2026, 1, 31);

    private BillingLedger newLedger(BigDecimal base, BigDecimal carriedOver) {
        return new BillingLedger(null, null, null, "LDG-TEST-0001",
                BillingType.MONTHLY, SettlementType.POSTPAID,
                START, END, base, carriedOver, END);
    }

    private BillingLedger issuedLedger(BigDecimal base) {
        BillingLedger l = newLedger(base, BigDecimal.ZERO);
        l.issue(END);
        return l;
    }

    @Nested
    @DisplayName("생성 및 잔액 공식")
    class Construction {
        @Test
        @DisplayName("생성 직후 잔액 = base + carriedOverIn, 상태는 DRAFT")
        void initialBalanceAndStatus() {
            BillingLedger l = newLedger(new BigDecimal("100000"), new BigDecimal("5000"));
            assertThat(l.getBalance()).isEqualByComparingTo("105000.00");
            assertThat(l.getStatus()).isEqualTo(BillingStatus.DRAFT);
        }
    }

    @Nested
    @DisplayName("발행(issue)")
    class Issue {
        @Test
        @DisplayName("DRAFT에서만 발행 가능 — 이미 발행된 원장을 다시 발행하면 예외")
        void cannotReissue() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThatThrownBy(() -> l.issue(END)).isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("발행 시 잔액이 0 이하면 곧바로 PAID로 전이한다(선불 0원 계약 등 경계값)")
        void issueWithZeroBalanceGoesStraightToPaid() {
            BillingLedger l = newLedger(BigDecimal.ZERO, BigDecimal.ZERO);
            l.issue(END);
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PAID);
        }
    }

    @Nested
    @DisplayName("수금(applyPayment)과 자동 상태 전이")
    class Payment {
        @Test
        @DisplayName("부분 수금 → PARTIALLY_PAID, 전액 수금 → PAID")
        void partialThenFullPayment() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));

            l.applyPayment(new BigDecimal("40000"));
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);
            assertThat(l.getBalance()).isEqualByComparingTo("60000.00");

            l.applyPayment(new BigDecimal("60000"));
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PAID);
            assertThat(l.getBalance()).isEqualByComparingTo("0.00");
        }

        @Test
        @DisplayName("0원 이하 수금은 거부한다")
        void rejectsNonPositivePayment() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThatThrownBy(() -> l.applyPayment(BigDecimal.ZERO)).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> l.applyPayment(new BigDecimal("-1"))).isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("취소/이월된 원장에는 수금을 반영할 수 없다")
        void cannotPayOnInactiveLedger() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.cancel();
            assertThatThrownBy(() -> l.applyPayment(new BigDecimal("1000")))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Nested
    @DisplayName("수금 취소(reversePayment)")
    class ReversePayment {
        @Test
        @DisplayName("수금 취소는 paidTotal을 되돌리고 잔액을 복원한다")
        void reversesPayment() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyPayment(new BigDecimal("100000"));
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PAID);

            l.reversePayment(new BigDecimal("30000"));
            assertThat(l.getBalance()).isEqualByComparingTo("30000.00");
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);
        }

        @Test
        @DisplayName("누적 수금액보다 큰 금액을 취소하려 하면 예외(음수 방지)")
        void cannotReverseMoreThanPaid() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyPayment(new BigDecimal("30000"));
            assertThatThrownBy(() -> l.reversePayment(new BigDecimal("30000.01")))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("조정(applyAdjustment)")
    class Adjustment {
        @Test
        @DisplayName("할인(음수 조정)은 잔액을 줄인다")
        void discountReducesBalance() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyAdjustment(new BigDecimal("-10000"));
            assertThat(l.getBalance()).isEqualByComparingTo("90000.00");
        }

        @Test
        @DisplayName("0원 조정은 거부한다")
        void rejectsZeroAdjustment() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThatThrownBy(() -> l.applyAdjustment(BigDecimal.ZERO)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("중도출고 재산정(reviseForMidRelease)과 원복(restoreFromMidRelease)")
    class MidRelease {
        @Test
        @DisplayName("재산정 시 원래 종료일·기본액을 스냅샷으로 보존하고 원복하면 정확히 되돌아온다")
        void revisesThenRestores() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            LocalDate midReleaseDate = LocalDate.of(2026, 1, 15);

            l.reviseForMidRelease(midReleaseDate, new BigDecimal("48387"));
            assertThat(l.getBillingPeriodEnd()).isEqualTo(midReleaseDate);
            assertThat(l.getBaseAmount()).isEqualByComparingTo("48387.00");

            l.restoreFromMidRelease();
            assertThat(l.getBillingPeriodEnd()).isEqualTo(END);
            assertThat(l.getBaseAmount()).isEqualByComparingTo("100000.00");
        }

        @Test
        @DisplayName("[회귀] 두 번째 재산정에서는 스냅샷을 덮어쓰지 않는다 — 최초 원래값이 유지돼야 원복이 정확하다")
        void secondRevisionDoesNotOverwriteOriginalSnapshot() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));

            l.reviseForMidRelease(LocalDate.of(2026, 1, 20), new BigDecimal("64516"));
            // 실무에서 두 번째 재산정이 일어날 일은 드물지만, 스냅샷 가드(if originalPeriodEnd == null)가
            // 깨지면 이 두 번째 호출이 스냅샷을 [1/20, 64516]으로 덮어써 최초 원복 기준을 잃어버린다.
            l.reviseForMidRelease(LocalDate.of(2026, 1, 10), new BigDecimal("32258"));

            l.restoreFromMidRelease();
            assertThat(l.getBillingPeriodEnd()).isEqualTo(END);
            assertThat(l.getBaseAmount()).isEqualByComparingTo("100000.00");
        }

        @Test
        @DisplayName("재산정된 적 없는 원장을 원복해도 아무 변화 없음(no-op)")
        void restoreWithoutRevisionIsNoop() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.restoreFromMidRelease();
            assertThat(l.getBillingPeriodEnd()).isEqualTo(END);
            assertThat(l.getBaseAmount()).isEqualByComparingTo("100000.00");
        }

        @Test
        @DisplayName("실사용 종료일이 청구 시작일보다 이르면 예외")
        void rejectsEffectiveEndBeforePeriodStart() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThatThrownBy(() -> l.reviseForMidRelease(START.minusDays(1), BigDecimal.ZERO))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("미수금(outstandingBalance) vs 환불대상(refundDue) — 부호 기반 분리")
    class OutstandingVsRefund {
        @Test
        @DisplayName("잔액이 양수면 미수금, 환불대상은 0")
        void positiveBalanceIsOutstanding() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThat(l.outstandingBalance()).isEqualByComparingTo("100000.00");
            assertThat(l.refundDue()).isEqualByComparingTo("0.00");
        }

        @Test
        @DisplayName("과오납으로 잔액이 음수면 환불대상, 미수금은 0")
        void negativeBalanceIsRefundDue() {
            // 선불 완납 후 중도출고로 기본액이 줄어들면 잔액이 음수(과오납)가 된다
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyPayment(new BigDecimal("100000"));
            l.reviseForMidRelease(LocalDate.of(2026, 1, 10), new BigDecimal("32258"));

            assertThat(l.getBalance()).isEqualByComparingTo("-67742.00");
            assertThat(l.outstandingBalance()).isEqualByComparingTo("0.00");
            assertThat(l.refundDue()).isEqualByComparingTo("67742.00");
        }
    }

    @Nested
    @DisplayName("환불 완료 처리(completeRefund)")
    class Refund {
        private BillingLedger overpaidLedger() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyPayment(new BigDecimal("100000"));
            l.reviseForMidRelease(LocalDate.of(2026, 1, 10), new BigDecimal("32258"));
            return l; // balance = -67742 (환불대상 67742)
        }

        @Test
        @DisplayName("환불 완료 처리하면 잔액이 0으로 마감되고 PAID + 환불시각이 기록된다")
        void completesRefund() {
            BillingLedger l = overpaidLedger();
            assertThat(l.isRefundCompleted()).isFalse();

            l.completeRefund();

            assertThat(l.getBalance()).isEqualByComparingTo("0.00");
            assertThat(l.getStatus()).isEqualTo(BillingStatus.PAID);
            assertThat(l.isRefundCompleted()).isTrue();
        }

        @Test
        @DisplayName("이미 환불 완료된 원장을 다시 환불 처리하면 예외(중복 방지)")
        void cannotRefundTwice() {
            BillingLedger l = overpaidLedger();
            l.completeRefund();
            assertThatThrownBy(l::completeRefund).isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("환불 대상 금액이 없는(잔액이 0 이상인) 원장은 환불 처리할 수 없다")
        void cannotRefundWithoutRefundDue() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            assertThatThrownBy(l::completeRefund).isInstanceOf(IllegalStateException.class);
        }
    }

    @Nested
    @DisplayName("취소(cancel)")
    class Cancel {
        @Test
        @DisplayName("완납(PAID) 원장은 취소할 수 없다")
        void cannotCancelPaid() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.applyPayment(new BigDecimal("100000"));
            assertThatThrownBy(l::cancel).isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("이월(CARRIED_OVER) 원장은 취소할 수 없다")
        void cannotCancelCarriedOver() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            BillingLedger next = issuedLedger(new BigDecimal("50000"));
            l.carryOverTo(next);
            assertThatThrownBy(l::cancel).isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("발행(ISSUED) 상태는 취소할 수 있다")
        void canCancelIssued() {
            BillingLedger l = issuedLedger(new BigDecimal("100000"));
            l.cancel();
            assertThat(l.getStatus()).isEqualTo(BillingStatus.CANCELED);
        }
    }
}
