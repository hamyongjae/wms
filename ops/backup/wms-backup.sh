#!/usr/bin/env bash
#
# ===== WMS 일일 백업 =====
#
# pg_dump 커스텀 포맷(-Fc)으로 전체 DB를 덤프하고 세대별로 보관한다.
#   · 일간(daily)  : 최근 7개
#   · 주간(weekly) : 일요일 덤프를 4개 (한 달치)
#
# 왜 -Fc(커스텀 포맷)인가
#   · 자체 압축된다(별도 gzip 불필요)
#   · pg_restore 로 "특정 테이블만" 골라 복구할 수 있다.
#     운영 사고는 대개 DB 전체가 아니라 테이블 하나가 망가진다.
#   · 병렬 복구(-j)가 가능해 복구 시간이 짧다
#
# cron 등록 예 (매일 새벽 3시 10분):
#   10 3 * * * /opt/wms/ops/backup/wms-backup.sh >> /var/log/wms-backup.log 2>&1
#
set -Eeuo pipefail

# ===== 설정 (환경변수로 덮어쓸 수 있음) =====
DB_NAME="${WMS_DB_NAME:-wms}"
DB_USER="${WMS_DB_USER:-postgres}"
DB_HOST="${WMS_DB_HOST:-localhost}"
DB_PORT="${WMS_DB_PORT:-5432}"
BACKUP_ROOT="${WMS_BACKUP_ROOT:-/var/backups/wms}"
DAILY_KEEP="${WMS_BACKUP_DAILY_KEEP:-7}"
WEEKLY_KEEP="${WMS_BACKUP_WEEKLY_KEEP:-4}"

# 비밀번호는 스크립트에 적지 않는다.
#   권장: postgres 계정의 ~/.pgpass (chmod 600) 사용
#   대안: PGPASSWORD 환경변수를 cron 이 아닌 별도 환경파일로 주입
DAILY_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${DAILY_DIR}/wms-${STAMP}.dump"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 어느 줄에서 죽었는지 로그에 남긴다 — 실패한 백업만큼 위험한 건 '실패한 줄 모르는 백업'이다
trap 'log "!! 백업 실패 (line ${LINENO}). 종료코드=$?"' ERR

mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

log "== 백업 시작: ${DB_NAME}@${DB_HOST}:${DB_PORT} =="

# ===== 1) 덤프 =====
# 먼저 .tmp 로 받고 완료 후 rename → 도중에 죽어도 '반쪽짜리 덤프'가 정상 파일로 남지 않는다
pg_dump \
  --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --file="${DUMP_FILE}.tmp" \
  "${DB_NAME}"
mv "${DUMP_FILE}.tmp" "${DUMP_FILE}"

SIZE="$(du -h "${DUMP_FILE}" | cut -f1)"
log "덤프 완료: ${DUMP_FILE} (${SIZE})"

# ===== 2) 무결성 확인 =====
# pg_restore --list 는 덤프의 목차를 읽는다. 파일이 깨졌으면 여기서 실패한다.
# "백업은 됐는데 열리지 않는" 최악의 상황을 매일 걸러내는 관문.
if ! pg_restore --list "${DUMP_FILE}" > /dev/null; then
  log "!! 덤프 파일이 손상되었습니다: ${DUMP_FILE}"
  exit 1
fi
log "무결성 확인 통과 (목차 판독 성공)"

# ===== 3) 주간 보관 =====
# 일요일(%u = 7) 덤프는 주간 보관함에도 복사해 한 달치 시계열을 유지한다.
if [[ "$(date +%u)" == "7" ]]; then
  cp -f "${DUMP_FILE}" "${WEEKLY_DIR}/"
  log "주간 보관본 복사"
fi

# ===== 4) 세대 정리 =====
# 오래된 것부터 지운다. ls -t 는 최신순이므로 tail 로 초과분만 남긴다.
prune() {
  local dir="$1" keep="$2" label="$3"
  local removed=0
  while IFS= read -r old; do
    [[ -z "${old}" ]] && continue
    rm -f "${dir}/${old}"
    removed=$((removed + 1))
  done < <(ls -1t "${dir}" 2>/dev/null | grep -E '\.dump$' | tail -n "+$((keep + 1))")
  log "${label} 정리: ${removed}개 삭제 (최근 ${keep}개 유지)"
}

prune "${DAILY_DIR}" "${DAILY_KEEP}" "일간"
prune "${WEEKLY_DIR}" "${WEEKLY_KEEP}" "주간"

log "== 백업 정상 종료 =="
