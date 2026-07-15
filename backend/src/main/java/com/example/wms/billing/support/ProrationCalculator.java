package com.example.wms.billing.support;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;

/**
 * 일할 계산(Proration) 엔진.
 *
 * [계산 원칙]
 * - 월 단위 계약: 일할 단가 = 그 달의 월 보관료 / 그 달의 실제 일수.
 *   여러 달에 걸치면 달마다 나눠 계산해 합산(달마다 일수가 달라 정확함).
 * - 일 단위 계약: 일할 단가 * 사용 일수.
 * - 기간 일수는 시작일·종료일 포함(inclusive). 예: 1일~1일 = 1일.
 * - 중간 연산은 CALC_SCALE로 계산하고 최종만 반올림 → 오차 누적 방지.
 *
 * 순수 계산기(상태 없음)라 단위 테스트가 쉽고 재사용 가능하다.
 */
@Component
public class ProrationCalculator {

    /**
     * 월 보관료 기준, 특정 기간(포함)의 일할 보관료.
     *
     * @param monthlyFee 월 보관료
     * @param startInclusive 시작일(포함)
     * @param endInclusive 종료일(포함)
     */
    public BigDecimal prorateMonthly(BigDecimal monthlyFee,
                                     LocalDate startInclusive,
                                     LocalDate endInclusive) {
        validatePeriod(startInclusive, endInclusive);
        BigDecimal fee = MoneyPolicy.nvl(monthlyFee);

        BigDecimal total = BigDecimal.ZERO;
        LocalDate cursor = startInclusive;

        // 달 경계로 잘라가며 달마다 (월요금 / 그달일수) * 그달사용일수 를 누적
        while (!cursor.isAfter(endInclusive)) {
            YearMonth ym = YearMonth.from(cursor);
            LocalDate monthEnd = ym.atEndOfMonth();
            LocalDate segmentEnd = monthEnd.isBefore(endInclusive) ? monthEnd : endInclusive;

            long daysInMonth = ym.lengthOfMonth();
            long usedDays = ChronoUnit.DAYS.between(cursor, segmentEnd) + 1;

            BigDecimal dailyRate = fee.divide(
                    BigDecimal.valueOf(daysInMonth), MoneyPolicy.CALC_SCALE, MoneyPolicy.ROUNDING);
            BigDecimal segmentAmount = dailyRate.multiply(BigDecimal.valueOf(usedDays));

            total = total.add(segmentAmount);
            cursor = segmentEnd.plusDays(1);
        }

        return MoneyPolicy.normalize(total);
    }

    /**
     * 일 단위 계약: 일 단가 * 기간(포함) 일수.
     */
    public BigDecimal prorateDaily(BigDecimal dailyRate,
                                   LocalDate startInclusive,
                                   LocalDate endInclusive) {
        validatePeriod(startInclusive, endInclusive);
        long usedDays = ChronoUnit.DAYS.between(startInclusive, endInclusive) + 1;
        BigDecimal amount = MoneyPolicy.nvl(dailyRate).multiply(BigDecimal.valueOf(usedDays));
        return MoneyPolicy.normalize(amount);
    }

    /**
     * 중도 출고 정산.
     *
     * 이미 산정된 원장 기간(periodStart~periodEnd)에 대해, 고객이 actualEndDate에
     * 조기 출고했을 때 "실제 사용분"과 "환급/추가 청구액"을 계산한다.
     *
     * @param monthlyFee 월 보관료
     * @param billedAmount 원장에 이미 잡힌(전체 기간 기준) 청구액
     * @param periodStart 원장 기간 시작(포함)
     * @param periodEnd 원장 기간 종료(포함)
     * @param actualEndDate 실제 출고일(포함, 이 날까지 사용)
     */
    public MidReleaseResult computeMidRelease(BigDecimal monthlyFee,
                                              BigDecimal billedAmount,
                                              LocalDate periodStart,
                                              LocalDate periodEnd,
                                              LocalDate actualEndDate) {
        validatePeriod(periodStart, periodEnd);
        if (actualEndDate == null || actualEndDate.isBefore(periodStart)) {
            throw new IllegalArgumentException("실제 출고일이 기간 시작보다 앞설 수 없습니다.");
        }
        // 출고일이 기간 종료 이후면 전체 기간 사용으로 간주
        LocalDate effectiveEnd = actualEndDate.isAfter(periodEnd) ? periodEnd : actualEndDate;

        BigDecimal actualUsage = prorateMonthly(monthlyFee, periodStart, effectiveEnd);
        BigDecimal billed = MoneyPolicy.normalize(billedAmount);

        // (전체 청구액 - 실제 사용분). 양수면 환급 대상, 음수면 추가 청구(0 이상으로 분리)
        BigDecimal diff = MoneyPolicy.normalize(billed.subtract(actualUsage));
        BigDecimal refund = diff.signum() > 0 ? diff : MoneyPolicy.ZERO;
        BigDecimal additionalCharge = diff.signum() < 0 ? diff.negate() : MoneyPolicy.ZERO;

        return new MidReleaseResult(actualUsage, refund, additionalCharge, effectiveEnd);
    }

    private void validatePeriod(LocalDate start, LocalDate end) {
        if (start == null || end == null) {
            throw new IllegalArgumentException("기간 시작/종료일은 필수입니다.");
        }
        if (end.isBefore(start)) {
            throw new IllegalArgumentException("종료일이 시작일보다 앞설 수 없습니다.");
        }
    }

    /**
     * 중도 출고 정산 결과.
     * @param actualUsageAmount 실제 사용분(일할)
     * @param refundAmount 환급 금액(선납분 초과 시)
     * @param additionalChargeAmount 추가 청구 금액
     * @param effectiveEndDate 정산에 적용된 실제 종료일
     */
    public record MidReleaseResult(BigDecimal actualUsageAmount,
                                   BigDecimal refundAmount,
                                   BigDecimal additionalChargeAmount,
                                   LocalDate effectiveEndDate) {
    }
}
