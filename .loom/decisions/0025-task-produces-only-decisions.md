# task는 decision만 생산하고, concept/index 갱신은 review에 위임한다

## 맥락

task 스킬이 shape와 동일한 산출물(concept, decision, index)을 생산하도록 설계했으나, shape의 산출물 생산 규칙(시점 종속 항목 라우팅, 기록 기준, 파일 이름 규칙 등)이 task에 빠져 있었다. 이 규칙을 복제하면 "여러 스킬에 동일 패턴 적용 시 정규화 점검" 문제가 재현된다.

## 결정

task는 decision만 생산한다. concept과 index의 갱신은 review에서 구현 결과를 바탕으로 처리한다.

decision은 "발생 시점에 즉시 기록한다"는 원칙이 있으므로 task에서 직접 기록해야 한다. concept은 즉시성 요구가 없으므로 review로 위임할 수 있다.

### 제약 조건

- decision concept의 "발생 시점에 즉시 기록" 원칙을 지켜야 한다: decision을 review까지 미루면 맥락이 유실될 수 있다

### 전제 조건

- task와 review는 같은 세션 내에서 순차적으로 수행된다: concept 갱신이 review까지 미뤄져도 맥락이 유실되지 않는다
- review의 reflect가 이미 concept 보완 메커니즘을 갖고 있다: 새로운 구조를 만들 필요가 없다

## 대안

### task에서 모든 산출물 생산

- 설명: shape의 산출물 규칙을 task에 복제한다
- 트레이드오프: 규칙 복제로 인한 정규화 문제가 재현된다

### task에서 shape의 규칙을 참조

- 설명: "shape의 Step 3 규칙을 따른다"고 지시한다
- 트레이드오프: 에이전트가 shape SKILL.md를 추가로 읽어야 하는 컨텍스트 비용이 발생한다

## 영향

- [[plan]] - plan의 concept/index 갱신이 task가 아닌 review 시점에 발생함을 인지해야 한다
