# Project scope의 principle 엔티티를 폐기하고 rule + decision 누적으로 흡수한다

## 맥락

0029에서 principle을 셋(원칙·룰·컨벤션)으로 분화한 동기는 user scope의 13개 항목 분류였다. 분화 자체는 user scope에서 작동하지만, project scope에서 코드 작성 위임의 합의 잔고를 다루는 자리로 정당성을 재검증하면 비대칭이 드러난다.

사용자의 다섯 원칙(OOE/RFP/FT/DCB/EDS)은 0027에서 shape/review/calibrate 스킬의 Step과 판단 지점으로 작성되어, 별도 엔티티로서 보관소에 자동 참조되는 경로 없이 작동한다. 그러나 이 처리는 사용자 개인 원칙에 한정되며, project scope에서 별도 principle 엔티티가 존재해야 한다는 가정은 검증된 적이 없다.

사용자의 관찰: rule이 만들어지고 변경될 때마다 decision으로 그 근거를 기록한다면, 누적된 decision이 곧 "판단의 근거" 역할을 한다. decision의 기존 정체성("변경 맥락의 횡단적 기록")이 이미 그 자리를 채울 수 있다.

## 결정

project scope의 principle 엔티티를 폐기한다. rule + decision 누적이 그 역할을 흡수한다.

- `.loom/concepts/principle.md` 파일 삭제
- 다른 concept 파일의 `[[principle]]` 참조 정리
- `.loom/index.md`의 도메인 엔티티 목록과 관계 갱신

원칙은 사라지지 않는다. 그러나 loom의 관리 영역에서 빠진다 — 원칙은 사용자 본인의 영역(user scope 또는 머릿속)에 머물고, project scope에서는 별도 엔티티로 정제·보관하지 않는다.

### 전제 조건

- rule의 변경 근거가 decision으로 충실히 기록된다: 누적된 decision이 새 rule을 판단하는 기준 역할을 할 수 있다
- 추상적 방향성 또한 decision으로 기록된다: trade-off 우선순위가 decision의 형태로 보존되어 누적된다
- user scope의 사용자 자산은 그대로 유지된다: 0030의 자동 참조 제거와 호환되며, user scope에 보관된 13개 항목은 자동 참조 없이 보존된다

## 대안

### project scope의 principle 엔티티 유지

- 설명: 0029의 셋 분화를 유지하고, project scope에서도 principle 엔티티를 두어 사용자가 명시적으로 데이터를 채울 수 있게 한다
- 트레이드오프: 별도 엔티티의 작동 경로가 결국 decision의 누적과 중복된다. rule의 변경 근거를 decision으로 기록하기만 하면 자연스럽게 누적되는데, 그것을 별도 엔티티로 정제하는 단계는 잉여 작업이다

### principle 엔티티를 유지하되 자동 참조 영역에서 제외

- 설명: principle 엔티티는 두되, plan/task의 자동 로드 대상에서 제외하고 명시적 호출 시에만 사용
- 트레이드오프: 자동 참조되지 않는 엔티티의 정당성이 약하다. user scope처럼 보관소화되는데, project scope에 또 다른 보관소를 두는 것은 정체성이 모호하다

## 영향

- [[principle]] - 폐기됨 (project scope에 한정)
- [[concept]] - 관련 컨셉 목록에서 `[[principle]]` 참조 제거
- [[decision]] - 누적이 새 rule의 판단 기준 역할을 한다는 관계 명시
- [[index]] - 도메인 엔티티 목록과 관계 갱신
