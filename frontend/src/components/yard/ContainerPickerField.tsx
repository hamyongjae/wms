import { useEffect, useState } from 'react'
import { containerApi, type Container } from '@/api/containerApi'
import { inputCls, labelCls } from '@/components/order/orderFormUi'

/**
 * 계약 등록·수정 팝업 공용 "사용할 컨테이너" 필드.
 *
 * 위치(자리)를 지정하면 지금까지는 항상 새 컨테이너를 발급해 배정했다 — 창고에 이미
 * 놀고 있는(미사용/AVAILABLE) 컨테이너가 있어도 번호만 계속 늘어났다. 이 필드는 선택한
 * 창고의 미사용 컨테이너 목록을 보여주고, 고르면 새로 만들지 않고 그 컨테이너를 그대로
 * 재사용한다. 미사용 컨테이너가 하나도 없으면(흔한 경우) 필드 자체를 숨겨 폼을 늘리지 않는다.
 */
export default function ContainerPickerField({
  warehouseId,
  value,
  onChange,
}: {
  warehouseId: number | null
  value: number | null // 선택한 기존 컨테이너 id. null = 새로 발급
  onChange: (container: Container | null) => void
}) {
  const [available, setAvailable] = useState<Container[]>([])

  useEffect(() => {
    if (warehouseId == null) {
      setAvailable([])
      return
    }
    let alive = true
    containerApi
      .list({ warehouseId, status: 'AVAILABLE' })
      .then((cs) => alive && setAvailable(cs))
      .catch(() => alive && setAvailable([]))
    return () => {
      alive = false
    }
  }, [warehouseId])

  // 창고를 바꾸면 이전 선택은 더 이상 그 창고 소속이 아닐 수 있으니 초기화
  useEffect(() => {
    onChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  if (available.length === 0) return null

  return (
    <div>
      <label className={labelCls}>사용할 컨테이너</label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const id = e.target.value === '' ? null : Number(e.target.value)
          onChange(available.find((c) => c.id === id) ?? null)
        }}
        className={inputCls}
      >
        <option value="">새 컨테이너 발급 (기본)</option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            {c.containerNo}번{c.memo ? ` · ${c.memo}` : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        이 창고에 미사용 컨테이너 {available.length}개가 있어요. 새로 발급하지 않고 재사용할 수 있습니다.
      </p>
    </div>
  )
}
