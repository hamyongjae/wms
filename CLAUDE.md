# WMS 프로젝트 작업 규칙

## 배포

Cowork 환경(격리된 리눅스 샌드박스)에서는 배포를 실행할 수 없다.
빌드용 `node_modules`가 Windows 네이티브 바이너리이고, SSH 키(`C:\Users\bbb12\id_wms`)와
git 자격증명이 샌드박스에 없기 때문이다. 또한 샌드박스 git은 `core.autocrlf`가 없어
`git add -A` 시 손대지 않은 파일 250여 개가 CRLF 변경으로 잡히므로 커밋해서는 안 된다.

**따라서 코드 변경을 마칠 때마다 응답 끝에 아래 배포 명령을 항상 포함한다.**
커밋 메시지는 그 작업 내용에 맞게 채워 넣는다.

```powershell
cd C:\Users\bbb12\Desktop\프로젝트\wms-clean
.\deploy.ps1 "작업 내용 요약"
```

`deploy.ps1` 동작: 프론트 빌드 검증 → `git add -A` + 커밋 + 푸시 → 서버 SSH 배포.
`all`/`back` 인자로 백엔드까지 배포 가능. 배포 후 브라우저에서 Ctrl+Shift+R.

## 검증

배포 전 샌드박스에서 가능한 검증은 여기까지다. 코드 변경 후 항상 실행한다.

```bash
npx tsc -b --pretty false     # 타입체크
npx eslint <변경한 파일>       # 린트
```

`npm run build`(vite)는 네이티브 바이너리 문제로 샌드박스에서 실패한다.
번들 빌드 검증은 `deploy.ps1`의 1단계가 대신한다.

## 프론트엔드 구조 메모

- 계약 등록/수정 폼의 시각 규격은 `src/components/order/orderFormUi.tsx` 한 곳에만 정의한다.
  등록(`OrdersPage`의 `CreateOrderModal`)과 수정(`components/order/EditOrderModal`)이 이를 상속받아
  파편화가 재발하지 않도록 한다.
- 계약 수정은 진입 경로(계약 관리 / 컨테이너 격자)와 무관하게 `EditOrderModal` 하나만 사용한다.
- 데이터 변경 후에는 `orderSync.emit()`을 호출한다. 6개 화면(계약·격자·대시보드·캘린더·매출·야드)이
  이 버스를 구독하므로 호출부에서 별도 `reload()`를 하면 중복 조회가 된다.
