package com.example.wms.order.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ===== [계약 출고↔출고취소 왕복 스냅샷 회귀 테스트] =====
 *
 * {@link StorageOrder#release}는 출고 처리 시 원래 종료일·보관료를 스냅샷해 두고,
 * {@link StorageOrder#unreleased}가 출고취소 시 그 값으로 되돌린다. 이 스냅샷은 release() 호출
 * 시점의 "현재 값"을 그대로 찍기 때문에, INBOUND가 아닌 상태에서(이미 출고된 계약에) 또
 * release()가 호출되면 이미 마감된 값을 "원래 값"으로 덮어써 버려 출고취소 시 잘못 복구된다.
 * 이 위험을 막는 가드(이번에 추가)와 정상 왕복 동작을 함께 검증한다.
 */
class StorageOrderTest {

    private static final LocalDate START = LocalDate.of(2026, 1, 1);
    private static final LocalDate EXPECTED_END = LocalDate.of(2026, 1, 31);

    private StorageOrder newOrder() {
        return new StorageOrder(null, null, null, START, EXPECTED_END, 100_000, null, null);
    }

    @Nested
    @DisplayName("생성")
    class Construction {
        @Test
        @DisplayName("신규 계약은 항상 INBOUND로 시작한다")
        void startsAsInbound() {
            StorageOrder order = newOrder();
            assertThat(order.isInbound()).isTrue();
            assertThat(order.isOutbound()).isFalse();
        }
    }

    @Nested
    @DisplayName("출고(release)")
    class Release {
        @Test
        @DisplayName("정상 출고: 상태가 OUTBOUND로 바뀌고 종료일이 실제 출고일로 마감된다")
        void marksOutboundAndClosesEndDate() {
            StorageOrder order = newOrder();
            LocalDate actualEnd = LocalDate.of(2026, 1, 20);

            order.release(actualEnd);

            assertThat(order.isOutbound()).isTrue();
            assertThat(order.getActualEndDate()).isEqualTo(actualEnd);
            assertThat(order.getExpectedEndDate()).isEqualTo(actualEnd);
        }

        @Test
        @DisplayName("[회귀] 이미 출고된 계약을 다시 출고 처리하면 예외 — 스냅샷이 잘못된 값으로 덮어써지는 것을 막는다")
        void rejectsDoubleRelease() {
            StorageOrder order = newOrder();
            order.release(LocalDate.of(2026, 1, 20));

            assertThatThrownBy(() -> order.release(LocalDate.of(2026, 1, 25)))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Nested
    @DisplayName("출고취소(unreleased) 왕복")
    class Unreleased {
        @Test
        @DisplayName("출고 후 출고취소하면 원래 종료일·보관료로 정확히 복구된다")
        void restoresOriginalEndDateAndFee() {
            StorageOrder order = newOrder();
            order.release(LocalDate.of(2026, 1, 20));
            order.applySettledFee(48_387); // 정산 서비스가 실사용분으로 보관료를 재산정했다고 가정

            order.unreleased();

            assertThat(order.isInbound()).isTrue();
            assertThat(order.getActualEndDate()).isNull();
            assertThat(order.getExpectedEndDate()).isEqualTo(EXPECTED_END);
            assertThat(order.getMonthlyFee()).isEqualTo(100_000);
        }

        @Test
        @DisplayName("출고취소 후 다시 출고하면 그 시점의(취소로 복구된) 값을 새로 스냅샷한다")
        void reReleaseAfterCancelSnapshotsFreshValues() {
            StorageOrder order = newOrder();
            order.release(LocalDate.of(2026, 1, 20));
            order.unreleased();

            LocalDate secondActualEnd = LocalDate.of(2026, 1, 25);
            order.release(secondActualEnd);
            order.unreleased();

            // 두 번째 출고취소도 원래(생성 시점) 값으로 정확히 돌아와야 한다 — 스냅샷이 누적 오염되지 않음
            assertThat(order.getExpectedEndDate()).isEqualTo(EXPECTED_END);
            assertThat(order.getMonthlyFee()).isEqualTo(100_000);
        }

        @Test
        @DisplayName("한 번도 출고된 적 없는 계약에 출고취소를 호출해도 안전한 no-op이다")
        void noopWhenNeverReleased() {
            StorageOrder order = newOrder();
            order.unreleased();

            assertThat(order.isInbound()).isTrue();
            assertThat(order.getExpectedEndDate()).isEqualTo(EXPECTED_END);
            assertThat(order.getMonthlyFee()).isEqualTo(100_000);
        }
    }
}
