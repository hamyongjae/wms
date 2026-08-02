package com.example.wms.billing.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ===== [일할 정산 회귀 테스트] =====
 *
 * 이 계산기가 틀리면 고객사의 청구서 금액이 틀린다. 남의 돈을 계산해 주는 코드라
 * "대충 맞는다"가 통하지 않으므로, 경계값을 표로 고정해 두고 회귀를 감시한다.
 *
 * 검증하는 규칙(도메인 계약):
 *  1. 기간은 시작·종료일 포함(inclusive). 하루짜리 계약도 1일로 센다.
 *  2. 일할 단가는 '그 달의 실제 일수'로 나눈다. 28·29·30·31일이 각각 다르게 나온다.
 *  3. 여러 달에 걸치면 달마다 따로 계산해 합산한다(달마다 단가가 다르므로).
 *  4. 중간 연산은 10자리, 최종만 2자리 반올림(HALF_UP) — 오차 누적 방지.
 *  5. 잘못된 기간(역전·null)은 조용히 0을 내지 않고 예외로 거부한다.
 */
class ProrationCalculatorTest {

    private final ProrationCalculator calculator = new ProrationCalculator();

    private static BigDecimal won(String v) {
        return new BigDecimal(v);
    }

    @Nested
    @DisplayName("월 보관료 일할 계산")
    class ProrateMonthly {

        @Test
        @DisplayName("한 달을 통째로 쓰면 월 보관료가 그대로 나온다 (일할이 원금을 갉지 않는다)")
        void fullMonthEqualsMonthlyFee() {
            BigDecimal result = calculator.prorateMonthly(
                    won("300000"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

            assertThat(result).isEqualByComparingTo(won("300000.00"));
        }

        /**
         * 같은 30만 원이라도 달의 길이에 따라 하루 값이 달라진다.
         * 이 표가 깨지면 "2월에만 청구가 이상하다" 류의 버그가 들어온 것이다.
         */
        @ParameterizedTest(name = "{0}-{1}-01 하루 사용 → {2}원 (그 달 {3}일)")
        @CsvSource({
                "2026, 1, 9677.42, 31",    // 300000/31 = 9677.419...  → 9677.42
                "2026, 2, 10714.29, 28",   // 300000/28 = 10714.2857.. → 10714.29
                "2024, 2, 10344.83, 29",   // 윤년 29일: 300000/29     → 10344.828..
                "2026, 4, 10000.00, 30",   // 300000/30 = 정확히 10000
        })
        @DisplayName("하루치 단가는 그 달의 실제 일수로 나눈다 (윤년 2월 포함)")
        void singleDayRateDependsOnMonthLength(int year, int month, String expected, int lengthOfMonth) {
            LocalDate day = LocalDate.of(year, month, 1);

            BigDecimal result = calculator.prorateMonthly(won("300000"), day, day);

            assertThat(LocalDate.of(year, month, 1).lengthOfMonth()).isEqualTo(lengthOfMonth);
            assertThat(result).isEqualByComparingTo(won(expected));
        }

        @Test
        @DisplayName("달을 걸치면 달마다 단가를 따로 적용해 합산한다")
        void spansTwoMonthsWithDifferentDailyRates() {
            // 1/30 ~ 2/2 = 1월 2일(30,31) + 2월 2일(1,2)
            //   1월분: 300000/31 * 2 = 19354.8387...
            //   2월분: 300000/28 * 2 = 21428.5714...
            //   합계 : 40783.4101... → 40783.41
            BigDecimal result = calculator.prorateMonthly(
                    won("300000"), LocalDate.of(2026, 1, 30), LocalDate.of(2026, 2, 2));

            assertThat(result).isEqualByComparingTo(won("40783.41"));
        }

        @Test
        @DisplayName("여러 달 전체를 쓰면 월 보관료 × 개월 수와 정확히 일치한다 (오차 누적 없음)")
        void wholeMonthsAccumulateWithoutDrift() {
            // 1/1 ~ 3/31 = 1·2·3월 전체 → 300000 * 3
            BigDecimal result = calculator.prorateMonthly(
                    won("300000"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 3, 31));

            assertThat(result).isEqualByComparingTo(won("900000.00"));
        }

        @Test
        @DisplayName("연을 넘겨도 달 경계로 정확히 잘린다")
        void spansYearBoundary() {
            // 12/31 하루 + 1/1 하루 → 300000/31 + 300000/31 = 19354.8387.. → 19354.84
            BigDecimal result = calculator.prorateMonthly(
                    won("300000"), LocalDate.of(2025, 12, 31), LocalDate.of(2026, 1, 1));

            assertThat(result).isEqualByComparingTo(won("19354.84"));
        }

        @Test
        @DisplayName("월 보관료가 null 이면 0원으로 다룬다 (NPE 로 배치가 멈추지 않게)")
        void nullFeeTreatedAsZero() {
            BigDecimal result = calculator.prorateMonthly(
                    null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

            assertThat(result).isEqualByComparingTo(MoneyPolicy.ZERO);
        }

        @Test
        @DisplayName("종료일이 시작일보다 앞서면 0원이 아니라 예외로 거부한다")
        void rejectsInvertedPeriod() {
            assertThatThrownBy(() -> calculator.prorateMonthly(
                    won("300000"), LocalDate.of(2026, 1, 31), LocalDate.of(2026, 1, 1)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("종료일");
        }

        @Test
        @DisplayName("기간이 null 이면 예외로 거부한다")
        void rejectsNullPeriod() {
            assertThatThrownBy(() -> calculator.prorateMonthly(won("300000"), null, LocalDate.of(2026, 1, 1)))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> calculator.prorateMonthly(won("300000"), LocalDate.of(2026, 1, 1), null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("결과는 항상 소수점 2자리로 정규화된다 (원장 스케일 고정)")
        void resultAlwaysScaledToTwo() {
            BigDecimal result = calculator.prorateMonthly(
                    won("100000"), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 3));

            assertThat(result.scale()).isEqualTo(MoneyPolicy.SCALE);
        }
    }

    @Nested
    @DisplayName("일 단가 계산")
    class ProrateDaily {

        @ParameterizedTest(name = "{0} ~ {1} → {2}일분")
        @CsvSource({
                "2026-01-01, 2026-01-01, 6000.00",    // 당일 = 1일
                "2026-01-01, 2026-01-02, 12000.00",   // 이틀
                "2026-01-01, 2026-01-31, 186000.00",  // 31일
        })
        @DisplayName("일수는 시작·종료일을 모두 포함해 센다")
        void countsBothEndpoints(String start, String end, String expected) {
            BigDecimal result = calculator.prorateDaily(
                    won("6000"), LocalDate.parse(start), LocalDate.parse(end));

            assertThat(result).isEqualByComparingTo(won(expected));
        }

        @Test
        @DisplayName("일 단가가 null 이면 0원")
        void nullRateTreatedAsZero() {
            LocalDate day = LocalDate.of(2026, 1, 1);
            assertThat(calculator.prorateDaily(null, day, day)).isEqualByComparingTo(MoneyPolicy.ZERO);
        }

        @Test
        @DisplayName("역전된 기간은 예외")
        void rejectsInvertedPeriod() {
            assertThatThrownBy(() -> calculator.prorateDaily(
                    won("6000"), LocalDate.of(2026, 1, 2), LocalDate.of(2026, 1, 1)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("중도 출고 정산")
    class MidRelease {

        @Test
        @DisplayName("조기 출고하면 안 쓴 만큼이 환급 대상이 된다")
        void earlyReleaseProducesRefund() {
            // 1월 전체(30만) 선청구 → 1/15까지만 사용
            //   실사용: 300000/31 * 15 = 145161.2903... → 145161.29
            //   환급  : 300000 - 145161.29 = 154838.71
            var result = calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 15));

            assertThat(result.actualUsageAmount()).isEqualByComparingTo(won("145161.29"));
            assertThat(result.refundAmount()).isEqualByComparingTo(won("154838.71"));
            assertThat(result.additionalChargeAmount()).isEqualByComparingTo(MoneyPolicy.ZERO);
            assertThat(result.effectiveEndDate()).isEqualTo(LocalDate.of(2026, 1, 15));
        }

        @Test
        @DisplayName("덜 청구돼 있었다면 환급이 아니라 추가 청구가 나온다 (부호가 뒤집히지 않는다)")
        void underBilledProducesAdditionalCharge() {
            // 실사용 30만인데 원장엔 10만만 잡혀 있던 경우 → 20만 추가 청구
            var result = calculator.computeMidRelease(
                    won("300000"), won("100000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 31));

            assertThat(result.actualUsageAmount()).isEqualByComparingTo(won("300000.00"));
            assertThat(result.refundAmount()).isEqualByComparingTo(MoneyPolicy.ZERO);
            assertThat(result.additionalChargeAmount()).isEqualByComparingTo(won("200000.00"));
        }

        @Test
        @DisplayName("정확히 맞아떨어지면 환급도 추가 청구도 0이다")
        void exactMatchProducesNeither() {
            var result = calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 31));

            assertThat(result.refundAmount()).isEqualByComparingTo(MoneyPolicy.ZERO);
            assertThat(result.additionalChargeAmount()).isEqualByComparingTo(MoneyPolicy.ZERO);
        }

        @Test
        @DisplayName("기간 종료일 이후에 출고하면 전체 기간 사용으로 클램프된다 (초과 청구 방지)")
        void releaseAfterPeriodEndIsClamped() {
            var result = calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 3, 15));   // 한참 뒤에 출고

            assertThat(result.effectiveEndDate()).isEqualTo(LocalDate.of(2026, 1, 31));
            assertThat(result.actualUsageAmount()).isEqualByComparingTo(won("300000.00"));
            assertThat(result.additionalChargeAmount()).isEqualByComparingTo(MoneyPolicy.ZERO);
        }

        @Test
        @DisplayName("당일 출고(시작일 == 출고일)도 1일분은 청구된다")
        void sameDayReleaseChargesOneDay() {
            var result = calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 1));

            assertThat(result.actualUsageAmount()).isEqualByComparingTo(won("9677.42"));
        }

        @Test
        @DisplayName("기간 시작 이전 출고일은 예외로 거부한다 (음수 사용일 차단)")
        void rejectsReleaseBeforePeriodStart() {
            assertThatThrownBy(() -> calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 9)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("출고일");
        }

        @Test
        @DisplayName("출고일이 null 이면 예외로 거부한다")
        void rejectsNullReleaseDate() {
            assertThatThrownBy(() -> calculator.computeMidRelease(
                    won("300000"), won("300000"),
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("환급 + 실사용 = 원래 청구액 (정산 항등식이 깨지지 않는다)")
        void refundPlusUsageEqualsBilled() {
            BigDecimal billed = won("300000");
            var result = calculator.computeMidRelease(
                    billed, billed,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31),
                    LocalDate.of(2026, 1, 17));

            assertThat(result.actualUsageAmount().add(result.refundAmount()))
                    .isEqualByComparingTo(MoneyPolicy.normalize(billed));
        }
    }
}
