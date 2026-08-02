package com.example.wms.billing.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ===== [금액 정책 회귀 테스트] =====
 *
 * 원장의 모든 금액이 이 정책을 통과한다. 반올림 방향이 한 번 바뀌면
 * 과거 청구서와 신규 청구서의 끝자리가 달라져 정산 대사(reconciliation)가 깨진다.
 * 그래서 "무엇을 어느 방향으로 반올림하는가"를 표로 못 박아 둔다.
 */
class MoneyPolicyTest {

    @Test
    @DisplayName("저장 스케일은 소수점 2자리, 반올림은 HALF_UP 으로 고정된다")
    void policyConstantsAreLocked() {
        assertThat(MoneyPolicy.SCALE).isEqualTo(2);
        assertThat(MoneyPolicy.CALC_SCALE).isEqualTo(10);
        assertThat(MoneyPolicy.ROUNDING).isEqualTo(java.math.RoundingMode.HALF_UP);
        assertThat(MoneyPolicy.ZERO.scale()).isEqualTo(2);
    }

    /**
     * HALF_UP 은 '5는 항상 올림'이다. HALF_EVEN(은행가 반올림)으로 바뀌면
     * 아래 표의 .005 케이스가 내림으로 바뀌므로 이 테스트가 잡아낸다.
     */
    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            "10.004,   10.00",
            "10.005,   10.01",    // HALF_UP: 5는 올림 (HALF_EVEN 이면 10.00 이 되어 실패)
            "10.015,   10.02",    // HALF_EVEN 이면 10.02, HALF_UP 도 10.02 (동일)
            "10.025,   10.03",    // HALF_EVEN 이면 10.02 → 여기서 갈린다
            "-10.005, -10.01",    // 음수도 절댓값 기준 올림
            "0,         0.00",
            "1000000.999, 1000001.00",
    })
    @DisplayName("normalize 는 2자리 HALF_UP 으로 반올림한다")
    void normalizeRoundsHalfUp(String input, String expected) {
        BigDecimal result = MoneyPolicy.normalize(new BigDecimal(input));

        assertThat(result).isEqualByComparingTo(new BigDecimal(expected));
        assertThat(result.scale()).isEqualTo(MoneyPolicy.SCALE);
    }

    @Test
    @DisplayName("null 금액은 0.00 으로 정규화된다 (합산 중 NPE 로 배치가 멈추지 않게)")
    void normalizeNullYieldsZero() {
        assertThat(MoneyPolicy.normalize(null)).isEqualByComparingTo(MoneyPolicy.ZERO);
        assertThat(MoneyPolicy.normalize(null).scale()).isEqualTo(MoneyPolicy.SCALE);
    }

    @Test
    @DisplayName("nvl 은 null 을 0 으로 바꾸고, 값이 있으면 그대로 통과시킨다")
    void nvlPassesThroughNonNull() {
        assertThat(MoneyPolicy.nvl(null)).isEqualByComparingTo(MoneyPolicy.ZERO);
        assertThat(MoneyPolicy.nvl(new BigDecimal("123.456"))).isEqualByComparingTo(new BigDecimal("123.456"));
    }

    @Test
    @DisplayName("ZERO 는 불변이며 스케일이 유지된다 (누적 계산의 시작점)")
    void zeroIsStable() {
        BigDecimal sum = MoneyPolicy.ZERO.add(new BigDecimal("100.00"));

        assertThat(MoneyPolicy.ZERO).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(sum).isEqualByComparingTo(new BigDecimal("100.00"));
    }
}
