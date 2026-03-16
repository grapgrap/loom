# Decision은 독립적이고 자기완결적이다

## 맥락

decision 0014를 폐기하면서, decision 간의 관계를 어떻게 다룰지 질문이 생겼다. 폐기된 decision을 다른 decision이 "대체한다"고 참조하는 방식과, 각 decision이 독립적으로 존재하는 방식 사이에서 선택이 필요했다.

또한, concept을 변경할 때 어떤 이전 decision이 무효화되는지 shape 시점에서는 알기 어렵다는 문제가 있었다.

## 결정

decision은 독립적이고 자기완결적이어야 한다.

- 각 decision은 다른 decision을 참조하여 대체하거나 폐기하지 않는다
- 그 decision만 읽어도 맥락, 선택, 이유를 이해할 수 있어야 한다
- concept이 항상 현재 진실이다 — decision의 결론이 concept과 모순되면, 그 decision은 사실상 폐기된 것이다
- calibrate가 concept↔decision 정합성을 점검하여 이 괴리를 발견한다

### 제약 조건

- decision 간 참조 관계를 만들면 의존 그래프가 생기고, 관리 비용이 증가한다: decision은 독립적이어야 한다
- shape 시점에서 이전 decision의 무효화를 식별하기 어렵다: 발견은 calibrate에 위임한다

### 전제 조건

- concept이 decision들의 스냅샷 역할을 한다: concept이 현재 진실이면 개별 decision의 유효성은 concept으로부터 도출 가능하다
- 에이전트는 항상 index → concept에서 시작한다: 개별 decision에 직접 착지하는 경로가 주 경로가 아니다

## 대안

### Decision 간 대체 참조

- 설명: 새 decision이 "0014를 대체한다"고 명시적으로 참조한다
- 트레이드오프: decision 간 의존 그래프가 생기고, 새 decision 작성 시 이전 decision을 모두 확인해야 하는 부담이 생긴다

### Shape 시점에서 선제적 폐기 식별

- 설명: 새 decision을 기록할 때 기존 decision과의 충돌을 확인한다
- 트레이드오프: 새 방향에 집중해야 할 shape 시점에 과거 전수 검토 부담이 추가된다

## 영향

- [[decision]] - 독립성과 자기완결성을 핵심 속성으로 명시
- [[concept]] - concept이 decision의 현재 유효성을 판단하는 기준이 됨을 명시
