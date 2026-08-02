# 테넌트 격리 설계

## 왜 바꿨나

이전에는 격리가 **개발자의 습관**에 달려 있었습니다.

```java
// 리포지토리마다 손으로 붙이던 조건
List<StorageOrder> findByTenantIdAndStatus(Long tenantId, OrderStatus status);
```

메서드 하나에서 `tenantId`를 빠뜨리면 다른 업체의 계약·매출·고객 연락처가 그대로 응답에 실립니다.
코드 리뷰로는 못 막는 종류의 사고이고, SaaS에서 한 번 나면 그걸로 끝입니다.

이제는 **ORM이 자동으로** 겁니다. 조건을 깜빡하는 것이 기본적으로 안전해졌습니다.

## 구조

```
요청 → JWT 필터 → SecurityContext(UserPrincipal.tenantId)
                        ↓
                  TenantContext.current()
                        ↓
        WmsTenantIdentifierResolver (Hibernate가 매 세션 조회)
                        ↓
   @TenantId 엔티티의 모든 SELECT 에 tenant_id = ? 자동 삽입
   INSERT 시 tenant_id 자동 주입
```

### 적용 엔티티 (10개)

`StorageOrder` `BillingLedger` `BillingAdjustment` `PaymentHistory` `Container`
`Customer` `Warehouse` `YardSlot` `FloorPrice` `StaffInvite`

각 엔티티는 이렇게 생겼습니다.

```java
@TenantId
@Column(name = "tenant_id", nullable = false)
private Long tenantId;                      // 쓰기 주체 (Hibernate가 채움)

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "tenant_id", insertable = false, updatable = false)
private Tenant tenant;                      // 같은 컬럼을 읽기 전용으로
```

한 컬럼을 두 곳에서 매핑하므로 연관관계 쪽을 읽기 전용으로 내려야 합니다.
이게 빠지면 `Column 'tenant_id' is duplicated` 로 **기동 자체가 실패**하니, 조용히 잘못될 여지는 없습니다.

### User 는 의도적으로 제외

`User`만 `@TenantId`를 붙이지 않았습니다. 두 가지 성질이 정면으로 충돌하기 때문입니다.

| User 의 성질 | `@TenantId` 의 규칙 |
|---|---|
| 소셜 최초 진입 계정은 `tenant_id`가 NULL | 저장 시 반드시 값이 주입됨 |
| 회사 등록·초대 수락 시점에 tenant를 **나중에** 배정 | 한 번 정해지면 **불변** |

대신 계정 조회는 `findAllByTenantIdOrderByCreatedAtDesc` 등으로 명시 격리합니다.
User는 계약·매출 같은 영업 기밀이 아니라 위험도도 낮습니다.

## ROOT 컨텍스트

소속이 정해지기 전이거나, 의도적으로 전 테넌트를 봐야 하는 흐름이 있습니다.

| 흐름 | 컨텍스트 | 이유 |
|---|---|---|
| 로그인 (이메일로 계정 탐색) | ROOT (자동) | 아직 어느 회사인지 모름 |
| 회원가입·소셜 최초 진입 | ROOT (자동) | 인증 전 |
| 청구 배치 (전 계약 스캔) | ROOT (자동) | 전 테넌트를 가로질러 읽어야 함 |
| 중복 초대 검사 | `runAsRoot` (명시) | 전역 유일성 검사라 내 회사만 보면 의미 없음 |
| 배치의 원장 **저장** | `runAs(order.getTenantId())` | 아래 참조 |

인증 정보가 없으면 자동으로 ROOT가 되므로, 기존 미인증 경로의 동작은 **하나도 바뀌지 않습니다.**
필터는 인증된 요청에만 새로 걸립니다 — 위험이 실제로 있던 곳입니다.

### ROOT 상태에서의 저장은 실패한다 (의도된 설계)

ROOT(`-1`)로 새 엔티티를 저장하면 `tenant_id = -1`이 되는데, 이 컬럼은 `tenants`를 향한 FK입니다.
**DB가 즉시 거부합니다.** 그래서 배치는 저장 시점에만 해당 업체로 전환합니다.

```java
// BillingBatchService — 읽기는 전 테넌트, 저장은 그 계약의 업체로
TenantContext.runAs(order.getTenantId(), () -> ledgerRepository.save(ledger));
```

"테넌트 없이 데이터를 만드는 실수"가 조용히 새는 대신 예외로 터지는 쪽을 택했습니다.

## 한계 — 반드시 기억할 것

1. **네이티브 SQL에는 안 걸립니다.** `@Query(nativeQuery = true)`는 Hibernate가 파싱하지 않습니다.
   현재 유일한 네이티브 쿼리(`aggregateMonthlyRevenue`)는 이미 `where l.tenant_id = :tenantId`가 있습니다.
   앞으로 네이티브 쿼리를 추가할 때는 **직접 조건을 넣어야 합니다.**
2. **`TenantContext`는 ThreadLocal입니다.** `@Async`나 별도 스레드로 넘기면 컨텍스트가 따라가지 않습니다.
   비동기 작업을 도입하면 `runAs`로 명시 전달해야 합니다.
3. 기존 리포지토리의 `tenantId` 파라미터는 그대로 뒀습니다. 이제 이중 조건이 되지만
   해가 없고, 한꺼번에 걷어내면 검증 범위가 너무 넓어집니다. 점진적으로 정리하세요.

## 검증

```bash
cd backend
./gradlew test                    # TenantContextTest — 우선순위·복원·중첩
./gradlew bootRun                 # 기동 성공 = 매핑 정합성 통과
```

기동만 되면 매핑은 맞은 겁니다. 그다음 실제 확인은 이렇게 합니다.

1. A업체로 로그인 → 계약 목록의 id 하나를 확인
2. B업체로 로그인 → `GET /api/orders/{A업체의id}` 호출
3. **404가 나와야 정상**입니다. 데이터가 보이면 그 경로에 네이티브 쿼리가 있는 것입니다.
