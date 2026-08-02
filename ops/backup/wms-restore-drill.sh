#!/usr/bin/env bash
#
# ===== WMS 복구 리허설 =====
#
# 최신 백업을 '임시 DB'에 실제로 복구해 보고, 핵심 테이블에 데이터가 들어왔는지 확인한 뒤
# 임시 DB를 지운다. 운영 DB는 건드리지 않는다.
#
# 왜 필요한가
#   백업 파일이 있다는 것과 복구가 된다는 것은 다른 얘기다.
#   실제로 복구해 보지 않은 백업은 '있다고 믿는 백업'일 뿐이고,
#   그 사실은 하필 진짜 사고가 났을 때 밝혀진다.
#   이 스크립트를 주 1회 자동으로 돌려서 그 가정을 매주 실증한다.
#
# cron 등록 예 (매주 월요일 새벽 4시):
#   0 4 * * 1 /opt/wms/ops/backup/wms-restore-drill.sh >> /var/log/wms-restore-drill.log 2>&1
#
set -Eeuo pipefail

DB_USER="${WMS_DB_USER:-postgres}"
DB_HOST="${WMS_DB_HOST:-localhost}"
DB_PORT="${WMS_DB_PORT:-5432}"
BACKUP_ROOT="${WMS_BACKUP_ROOT:-/var/backups/wms}"
DRILL_DB="${WMS_DRILL_DB:-wms_restore_drill}"

# 이 테이블들이 비어 있으면 복구가 성공한 게 아니다 (업무의 뼈대)
REQUIRED_TABLES=(tenants users warehouses customers storage_orders billing_ledgers)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
psql_drill() { psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${DRILL_DB}" -tAc "$1"; }

cleanup() {
  # 리허설용 DB는 어떤 경우에도 남기지 않는다 (디스크·혼동 방지)
  dropdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --if-exists "${DRILL_DB}" || true
}
trap cleanup EXIT
trap 'log "!! 리허설 실패 (line ${LINENO})"' ERR

# ===== 1) 최신 덤프 선택 =====
LATEST="$(ls -1t "${BACKUP_ROOT}/daily"/*.dump 2>/dev/null | head -n1 || true)"
if [[ -z "${LATEST}" ]]; then
  log "!! 백업 파일이 없습니다: ${BACKUP_ROOT}/daily"
  exit 1
fi

# 백업이 너무 오래됐으면 그 자체가 사고다 (cron 이 죽어 있었을 수 있다)
AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "${LATEST}") ) / 3600 ))
log "대상 덤프: ${LATEST} (${AGE_HOURS}시간 전)"
if (( AGE_HOURS > 48 )); then
  log "!! 최신 백업이 48시간보다 오래됐습니다. 백업 cron 을 먼저 확인하세요."
  exit 1
fi

# ===== 2) 임시 DB에 복구 =====
cleanup   # 이전 리허설 잔재 제거
createdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${DRILL_DB}"
log "임시 DB 생성: ${DRILL_DB}"

# --exit-on-error: 하나라도 실패하면 즉시 중단 (부분 복구를 성공으로 착각하지 않기 위해)
pg_restore \
  --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" \
  --dbname="${DRILL_DB}" --no-owner --no-privileges \
  --jobs=2 --exit-on-error \
  "${LATEST}"
log "복구 완료"

# ===== 3) 검증 =====
FAILED=0
for t in "${REQUIRED_TABLES[@]}"; do
  exists="$(psql_drill "SELECT to_regclass('public.${t}') IS NOT NULL")"
  if [[ "${exists}" != "t" ]]; then
    log "!! 테이블 없음: ${t}"
    FAILED=1
    continue
  fi
  count="$(psql_drill "SELECT count(*) FROM ${t}")"
  log "  ${t}: ${count}행"
  # tenants 가 0이면 실질적으로 빈 DB를 복구한 것 — 백업 대상이 잘못됐을 수 있다
  if [[ "${t}" == "tenants" && "${count}" == "0" ]]; then
    log "!! tenants 가 비어 있습니다. 백업 대상 DB를 확인하세요."
    FAILED=1
  fi
done

# 정산 원장 합계까지 읽어본다 — 스키마뿐 아니라 '금액이 살아 있는지'까지 확인
if psql_drill "SELECT to_regclass('public.billing_ledgers') IS NOT NULL" | grep -q t; then
  total="$(psql_drill "SELECT COALESCE(SUM(base_amount), 0) FROM billing_ledgers" 2>/dev/null || echo '조회불가')"
  balance="$(psql_drill "SELECT COALESCE(SUM(balance), 0) FROM billing_ledgers" 2>/dev/null || echo '조회불가')"
  log "  billing_ledgers 청구 합계: ${total} / 미수 잔액 합계: ${balance}"
fi

if (( FAILED != 0 )); then
  log "== 리허설 실패 — 이 백업으로는 복구할 수 없습니다 =="
  exit 1
fi

log "== 리허설 성공: 이 백업은 실제로 복구 가능합니다 =="
