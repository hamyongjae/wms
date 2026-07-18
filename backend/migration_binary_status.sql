-- ============================================================
-- [마이그레이션] 계약 상태를 입고/출고 2단계로 단순화
-- ============================================================
-- 실행 방법: PostgreSQL에서 이 스크립트를 한 번 실행하세요.
-- (Flyway 미사용 환경 - ddl-auto: update)
--
-- 안전성:
--  - 기존 데이터를 보존하면서 상태값만 변환합니다.
--  - RELEASED(출고완료) → OUTBOUND
--  - 그 외 모든 상태(PENDING/IN_STORAGE/PENDING_RELEASE/RECEIVED/CANCELLED) → INBOUND
-- ============================================================

BEGIN;

-- 1. 기존 CHECK 제약 조건 제거 (구 상태값 검증 해제)
ALTER TABLE storage_orders DROP CONSTRAINT IF EXISTS storage_orders_status_check;

-- 2. 기존 데이터 변환
--    출고완료였던 계약만 OUTBOUND, 나머지는 모두 INBOUND
UPDATE storage_orders SET status = 'OUTBOUND' WHERE status = 'RELEASED';
UPDATE storage_orders SET status = 'INBOUND'
 WHERE status IN ('PENDING', 'IN_STORAGE', 'PENDING_RELEASE', 'RECEIVED', 'CANCELLED');

-- 3. 혹시 남은 알 수 없는 값도 안전하게 INBOUND로 기본 처리
UPDATE storage_orders SET status = 'INBOUND'
 WHERE status NOT IN ('INBOUND', 'OUTBOUND');

-- 4. 신규 CHECK 제약 조건 추가 (입고/출고만 허용)
ALTER TABLE storage_orders
  ADD CONSTRAINT storage_orders_status_check
  CHECK (status IN ('INBOUND', 'OUTBOUND'));

-- 5. 더 이상 사용하지 않는 slot_assigned 컬럼 제거
ALTER TABLE storage_orders DROP COLUMN IF EXISTS slot_assigned;

COMMIT;

-- ============================================================
-- 완료 후 서버를 재시작하세요:  ./gradlew clean bootRun
-- ============================================================
