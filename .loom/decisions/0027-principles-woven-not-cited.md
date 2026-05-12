# 다섯 원칙을 스킬에 인용하지 않고 Step과 판단 지점으로 재작성하여 녹인다

## 맥락

shape/review/calibrate 세 스킬의 재작성 논의에서, 사용자의 다섯 원칙(OOE, RFP, FT, DCB, EDS)이 스킬의 판단을 구조적으로 이끌어야 한다는 합의가 있었다.

원칙을 스킬에 반영하는 경로에는 두 가지가 있었다 — 원칙 이름을 본문에 인용하는 방식과, 원칙의 작동이 Step 구조 자체가 되도록 재작성하는 방식. 원칙은 "체득된 믿음"의 정체성을 갖기 때문에, 인용 방식은 정체성을 흐릴 위험이 있다.

### 관련 원칙

- **OOE (Outcome-Oriented Execution)**: 최종 상태를 먼저 확정하고 역방향으로 트레이드오프한다. 점진적으로 쌓아올리지 않는다.
- **RFP (Redesign From First Principles)**: 변경을 기존 설계에 덧붙이지 않는다. 처음부터 이 요구사항을 알았다면 어떻게 만들었을지 재설계한다.
- **FT (Foundational Thinking)**: 구조적 결정은 옵션 가치를 극대화하고, 코드 레벨 결정은 단순함을 추구한다. 조기 추상화를 경계한다.
- **DCB (Draw Clear Boundaries)**: 경계를 분명히 한다. 모듈이 변경되는 이유가 하나가 되도록 관심사를 분리한다.
- **EDS (Exhaust the Design Space)**: 전례 없는 설계 결정 앞에서 대안을 구체적으로 탐색한 뒤 커밋한다.

## 결정

다섯 원칙(Outcome-Oriented Execution, Redesign From First Principles, Foundational Thinking, Draw Clear Boundaries, Exhaust the Design Space)을 스킬 본문에 명시적으로 인용하지 않고, 각 원칙의 작동이 스킬의 Step과 판단 지점 그 자체가 되도록 재작성한다.

각 원칙의 녹임 위치:

- **OOE**: shape의 최종 상태 확정, decision 템플릿의 "제약 없을 때의 결정" 섹션, review의 제약 변화 감지, calibrate의 누적 제약 변화 감지
- **RFP**: shape의 재설계 판단, review의 전제 변화 감지, calibrate의 누적 전제 변화 감지
- **FT**: shape의 분화 필요성 판단, review의 성급한 분화 감지, calibrate의 축적된 분화 옵션 가치 재평가
- **DCB**: shape의 경계 판단, review의 concept 왜곡 감지, calibrate의 누적 경계 드리프트 감사
- **EDS**: shape의 대안 탐색

### 제약 조건

- 원칙은 user scope의 principle concept으로 정체성을 유지해야 한다: 스킬 본문으로 복제하면 "체득된 믿음"의 정체성이 흐려진다
- 에이전트는 대화 흐름에서 원칙을 놓칠 수 있다: 원칙이 스킬에 반영되지 않으면 유도가 안 된다

### 전제 조건

- 다섯 원칙의 작동 방식이 Step 구조로 표현 가능하다: 판단의 순서와 지점이 원칙의 논리와 대응된다
- 사용자가 제작자이므로 사용자의 원칙이 loom의 설계에 반영되는 것이 자연스럽다

## 대안

### 원칙을 스킬 본문에 명시 인용

- 설명: 스킬의 Step에 "이 판단은 OOE에 근거한다" 같은 메타 참조를 포함
- 트레이드오프: 원칙이 다른 층에 복제되면 정체성이 흐려지고, 원칙의 변화 시 스킬 본문까지 동기화해야 한다

### 원칙 계층과 스킬 계층을 명시적으로 분리

- 설명: 원칙을 참조하는 메타 문서를 스킬 외부에 두고, 스킬은 원칙과 무관한 실행 단위로 유지
- 트레이드오프: 원칙이 스킬 실행에서 유도되지 않으므로, 대화 흐름에서 놓쳤을 때 복원 수단이 없다

## 영향

- shape - Step이 OOE/RFP/FT/DCB/EDS 작동을 구조적으로 유도한다
- review - Step이 OOE/RFP/FT/DCB/EDS 작동을 구조적으로 유도한다
- calibrate - Step이 OOE/RFP/FT/DCB 작동을 구조적으로 유도한다
- [[principle]] - user scope의 체득된 믿음으로 정체성을 유지한다 (복제 금지)
