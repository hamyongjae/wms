# WMS 백업·복구 운영 가이드

유료 고객 데이터를 받기 전에 반드시 끝내야 하는 항목입니다.
백업이 **있다는 것**과 복구가 **된다는 것**은 다른 얘기이고, 그 차이는 하필 진짜 사고가 났을 때 드러납니다.
그래서 이 폴더는 "백업"과 "복구 실증" 두 개를 짝으로 둡니다.

| 스크립트 | 주기 | 하는 일 |
|---|---|---|
| `wms-backup.sh` | 매일 03:10 | `pg_dump -Fc` 덤프 → 무결성 확인 → 세대 정리(일 7 / 주 4) |
| `wms-restore-drill.sh` | 매주 월 04:00 | 최신 덤프를 임시 DB에 **실제로 복구**하고 핵심 테이블 검증 후 폐기 |

## 1. 서버에 설치

```bash
# 저장소를 /opt/wms 에 두었다고 가정 (경로는 환경에 맞게)
sudo mkdir -p /var/backups/wms
sudo chown postgres:postgres /var/backups/wms
sudo chmod 700 /var/backups/wms          # 백업엔 고객 전체 데이터가 들어있다 — 권한을 좁게

chmod +x /opt/wms/ops/backup/*.sh
```

## 2. DB 접속 정보

비밀번호를 스크립트나 crontab에 적지 마세요. `.pgpass`를 씁니다.

```bash
sudo -u postgres bash -c 'echo "localhost:5432:*:postgres:여기에비밀번호" > ~/.pgpass && chmod 600 ~/.pgpass'
```

`chmod 600`이 아니면 psql이 파일을 **무시합니다**(경고도 조용합니다). 설치 후 아래로 확인하세요.

```bash
sudo -u postgres psql -h localhost -U postgres -d wms -c 'select 1'
```

## 3. cron 등록

```bash
sudo -u postgres crontab -e
```

```cron
# WMS 일일 백업
10 3 * * * /opt/wms/ops/backup/wms-backup.sh >> /var/log/wms-backup.log 2>&1
# WMS 주간 복구 리허설 (백업이 실제로 열리는지 실증)
0 4 * * 1 /opt/wms/ops/backup/wms-restore-drill.sh >> /var/log/wms-restore-drill.log 2>&1
```

로그 파일 권한을 미리 잡아둡니다.

```bash
sudo touch /var/log/wms-backup.log /var/log/wms-restore-drill.log
sudo chown postgres:postgres /var/log/wms-backup.log /var/log/wms-restore-drill.log
```

## 4. 최초 1회 수동 검증

cron에 맡기기 전에 손으로 한 번 돌려서 끝까지 가는지 봅니다.

```bash
sudo -u postgres /opt/wms/ops/backup/wms-backup.sh
sudo -u postgres /opt/wms/ops/backup/wms-restore-drill.sh
```

리허설 마지막 줄이 `== 리허설 성공: 이 백업은 실제로 복구 가능합니다 ==` 이어야 합니다.

## 5. 실제 사고 시 복구 절차

**당황해서 운영 DB에 곧바로 restore 하지 마세요.** 복구가 실패하면 남아있던 데이터까지 잃습니다.
순서는 항상 "지금 상태를 먼저 얼린다 → 옆에 복구한다 → 확인하고 바꿔치기" 입니다.

```bash
# 0) 애플리케이션 정지 — 복구 중 쓰기가 들어오면 정합성이 깨진다
sudo systemctl stop wms

# 1) 지금의 망가진 DB도 일단 백업 (사고 원인 분석용, 되돌릴 여지 확보)
sudo -u postgres pg_dump -Fc wms > /var/backups/wms/incident-$(date +%Y%m%d-%H%M).dump

# 2) 옆에 새 DB로 복구
sudo -u postgres createdb wms_recovered
sudo -u postgres pg_restore -d wms_recovered --no-owner --no-privileges --exit-on-error \
  /var/backups/wms/daily/wms-YYYYMMDD-HHMMSS.dump

# 3) 데이터 확인 (건수·최근 계약이 기대와 맞는지)
sudo -u postgres psql -d wms_recovered -c \
  "select (select count(*) from tenants) t, (select count(*) from storage_orders) o, (select max(created_at) from storage_orders) last"

# 4) 확인이 끝나면 이름을 바꿔치기
sudo -u postgres psql -d postgres -c "alter database wms rename to wms_broken"
sudo -u postgres psql -d postgres -c "alter database wms_recovered rename to wms"

sudo systemctl start wms
```

특정 테이블만 되살릴 때는 전체를 덮지 말고 그 테이블만 뽑습니다. 커스텀 포맷(`-Fc`)을 쓴 이유가 이것입니다.

```bash
sudo -u postgres pg_restore -d wms --data-only --table=billing_ledgers 덤프파일.dump
```

## 6. 알아둘 한계

- **복구 지점은 최대 24시간 전입니다.** 마지막 백업 이후의 입력은 사라집니다.
  이걸 줄이려면 WAL 아카이빙(PITR)이 필요하고, 그건 별도 작업입니다.
  유료 고객이 늘면 다음 단계로 검토하세요.
- **덤프가 서버 안에만 있습니다.** 디스크·서버가 통째로 죽으면 백업도 같이 죽습니다.
  오프사이트 업로드(S3 호환 스토리지)는 아직 붙이지 않았습니다.
  1호 유료 고객을 받는 시점에는 이걸 먼저 채우는 걸 권합니다.
- 백업 파일에는 **전 고객사의 계약·매출·연락처가 그대로** 들어 있습니다.
  로컬로 내려받아 방치하지 마세요. 권한(700)과 보관 위치를 계속 좁게 유지하세요.
