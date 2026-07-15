package com.example.wms.billing.support;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 금액 처리 정책 (금융 원장 레벨).
 *
 * [정책 결정]
 * - 저장/표현 스케일: 소수점 2자리(전(錢) 단위). 원장 정밀도를 위해 2자리를 유지한다.
 *   (원화 최종 표기가 필요하면 프레젠테이션 단에서 원 단위로 반올림)
 * - 반올림 모드: HALF_UP (사사오입). 사장님·고객 모두 직관적으로 이해 가능.
 * - 일할 계산 등 중간 연산은 스케일 10으로 넉넉히 계산한 뒤,
 *   마지막에 normalize()로 2자리 반올림 → 반올림 오차 누적을 방지.
 *
 * 모든 금액 필드는 이 정책의 SCALE/ROUNDING을 따른다.
 */
public final class MoneyPolicy {

    private MoneyPolicy() {
    }

    /** 저장/최종 금액 스케일 (소수점 2자리) */
    public static final int SCALE = 2;

    /** 중간 연산 스케일 (오차 방지용 여유) */
    public static final int CALC_SCALE = 10;

    /** 반올림 모드 */
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    public static final BigDecimal ZERO = BigDecimal.ZERO.setScale(SCALE, ROUNDING);

    /** 최종 금액을 정책 스케일로 정규화 */
    public static BigDecimal normalize(BigDecimal value) {
        if (value == null) {
            return ZERO;
        }
        return value.setScale(SCALE, ROUNDING);
    }

    /** null 을 0으로 안전 변환 (누적 계산용) */
    public static BigDecimal nvl(BigDecimal value) {
        return value == null ? ZERO : value;
    }
}
