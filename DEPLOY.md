# 배포 가이드 — Oracle Cloud 무료 VM (1대에 전부)

한 대의 Ubuntu 서버에 **PostgreSQL + Spring Boot(jar) + Nginx**를 올린다.
Nginx가 프론트 정적파일을 서빙하고 `/api`만 백엔드(8080)로 프록시한다 → **같은 도메인 = CORS 불필요**.
모바일은 이 주소를 브라우저에서 "홈 화면에 추가"로 앱처럼 사용(PWA).

- 구조: `backend/` (Spring Boot) · `frontend/` (React/Vite)
- 비용: 서버 무료(Oracle Always Free) + 도메인 값(연 1~2만원)만

---

## 0. 준비물
- Oracle Cloud 계정(해외 결제카드로 본인확인, 과금은 Always Free 한도 내 0원)
- 도메인 1개 (가비아/Cloudflare 등). 없으면 우선 공인 IP로 테스트 가능(단 HTTPS·PWA는 도메인 필요)
- Gmail 앱 비밀번호 (비밀번호 재설정 메일 발송용, 2단계인증 후 발급)

---

## 1. VM 생성 (Oracle Cloud)
1. Compute → Instances → **Create Instance**
2. Image/Shape: **Ubuntu 22.04**, Shape는 **Ampere(ARM) VM.Standard.A1.Flex** (무료 한도: 2 OCPU / 12GB)
3. SSH 키 등록(공개키 업로드 또는 새로 생성해 개인키 저장)
4. 생성 후 **Public IP** 확인
5. 네트워킹 방화벽 열기(둘 다 필요):
   - **Oracle 콘솔**: VCN → Security List → Ingress Rule 추가: 0.0.0.0/0, TCP **22, 80, 443**
   - **서버 내부 iptables/ufw**: 아래 8번에서 처리
6. 접속: `ssh -i <개인키> ubuntu@<공인IP>`

---

## 2. 서버 기본 세팅
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y openjdk-21-jdk postgresql nginx certbot python3-certbot-nginx git
java -version   # 21 확인
```

---

## 3. PostgreSQL 준비
```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE wms;
CREATE USER wmsuser WITH ENCRYPTED PASSWORD '여기_강력한_비밀번호';
GRANT ALL PRIVILEGES ON DATABASE wms TO wmsuser;
ALTER DATABASE wms OWNER TO wmsuser;
SQL
```

---

## 4. 코드 받기 & 백엔드 빌드
```bash
cd ~
git clone https://github.com/hamyongjae/wms.git
cd wms/backend
./gradlew clean bootJar        # build/libs/*.jar 생성
ls build/libs/                 # jar 파일명 확인 (예: wms-0.0.1-SNAPSHOT.jar)
```

---

## 5. 백엔드 환경변수 + systemd 서비스
비밀·설정은 **환경변수 파일**로 분리한다.
```bash
sudo mkdir -p /etc/wms
sudo tee /etc/wms/wms.env >/dev/null <<'ENV'
DB_URL=jdbc:postgresql://localhost:5432/wms
DB_USERNAME=wmsuser
DB_PASSWORD=여기_3번에서_정한_비밀번호
# 32byte 이상 Base64. 아래 명령으로 생성해 붙여넣기: openssl rand -base64 48
JWT_SECRET=여기_랜덤시크릿
JWT_ACCESS_TOKEN_VALIDITY_MS=43200000
# 비밀번호 재설정 링크에 쓰는 실제 프론트 주소
APP_FRONTEND_BASE_URL=https://wms.내도메인.com
# (선택) 프론트를 다른 도메인에서 서빙할 때만. 같은 도메인이면 비워둠
APP_CORS_ORIGINS=
# 메일(SMTP)
MAIL_USERNAME=내지메일@gmail.com
MAIL_PASSWORD=구글_앱비밀번호_16자리
MAIL_FROM=내지메일@gmail.com
ENV
sudo chmod 600 /etc/wms/wms.env
```
서비스 등록(jar 파일명은 4번에서 확인한 실제 이름으로):
```bash
sudo tee /etc/systemd/system/wms.service >/dev/null <<'UNIT'
[Unit]
Description=WMS Spring Boot
After=network.target postgresql.service

[Service]
User=ubuntu
EnvironmentFile=/etc/wms/wms.env
WorkingDirectory=/home/ubuntu/wms/backend
ExecStart=/usr/bin/java -jar /home/ubuntu/wms/backend/build/libs/wms-0.0.1-SNAPSHOT.jar
SuccessExitStatus=143
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now wms
sudo systemctl status wms          # active(running) 확인
sudo journalctl -u wms -f          # 기동 로그(정합화 러너 로그 등) 확인
```
> 참고: 이 앱은 `ddl-auto: update`라 첫 기동 시 테이블이 자동 생성된다.

---

## 6. 프론트 빌드 & Nginx 서빙
프론트는 **로컬 PC에서 빌드**해 결과물(`dist`)만 서버로 올려도 되고, 서버에서 빌드해도 된다.
서버에서 빌드하려면 Node 설치 후:
```bash
# (서버에 Node 설치 예: nvm 또는 apt)
cd ~/wms/frontend
cp .env.production.example .env.production
nano .env.production            # VITE_API_BASE_URL=https://wms.내도메인.com 로 수정
npm ci
npm run build                   # dist/ 생성
sudo mkdir -p /var/www/wms
sudo cp -r dist/* /var/www/wms/
```
Nginx 설정:
```bash
sudo tee /etc/nginx/sites-available/wms >/dev/null <<'NGINX'
server {
    listen 80;
    server_name wms.내도메인.com;   # 도메인 없으면 공인IP

    root /var/www/wms;
    index index.html;

    # SPA 라우팅: 없는 경로는 index.html로
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API는 백엔드로 프록시 (같은 도메인 → CORS 불필요)
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/wms /etc/nginx/sites-enabled/wms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 7. 도메인 연결 & HTTPS (무료)
1. 도메인 DNS에서 **A 레코드** → 서버 공인 IP 지정 (예: `wms` → IP)
2. 전파 후 무료 인증서 발급:
```bash
sudo certbot --nginx -d wms.내도메인.com
```
→ Nginx가 자동으로 443/HTTPS로 전환되고, 갱신도 자동 등록된다.
3. 접속 확인: `https://wms.내도메인.com`

---

## 8. 방화벽 (서버 내부)
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```
> Oracle 콘솔 Security List(1번)와 서버 ufw **둘 다** 열려 있어야 외부에서 접속된다.

---

## 9. 데이터 백업 (필수)
매일 새벽 DB 덤프:
```bash
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 3 * * * pg_dump -U wmsuser wms | gzip > ~/backups/wms_$(date +\%F).sql.gz' ) | crontab -
```

---

## 10. 모바일 앱 (PWA)
현재도 반응형이라 모바일 브라우저에서 바로 쓸 수 있다.
"앱처럼" 설치하려면 프론트에 PWA(매니페스트+서비스워커)를 추가하면 된다 → 아이폰/안드로이드에서 "홈 화면에 추가".
(원하면 이 단계는 별도로 세팅해 준다.)

---

## 업데이트 배포 (코드 수정 후)
```bash
cd ~/wms && git pull
# 백엔드
cd backend && ./gradlew clean bootJar && sudo systemctl restart wms
# 프론트
cd ../frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/wms/
```

---

## 환경변수 체크리스트
| 변수 | 용도 | 필수 |
|------|------|------|
| DB_URL / DB_USERNAME / DB_PASSWORD | DB 접속 | ✅ |
| JWT_SECRET | 토큰 서명키(Base64 32byte+) | ✅ |
| APP_FRONTEND_BASE_URL | 비밀번호 재설정 링크 도메인 | ✅ |
| MAIL_USERNAME / MAIL_PASSWORD / MAIL_FROM | SMTP 메일 발송 | 권장 |
| APP_CORS_ORIGINS | 프론트가 다른 도메인일 때만 | 선택 |
| JWT_ACCESS_TOKEN_VALIDITY_MS | 토큰 만료(ms) | 선택 |
