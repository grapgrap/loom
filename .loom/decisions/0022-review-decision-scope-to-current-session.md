# Review의 decision 평가 대상을 이번 세션으로 한정

## 맥락

review의 Step 0에서 "관련 decision들"을 로드하도록 되어 있었으나, "관련"의 기준이 정의되어 있지 않아 에이전트의 자의적 판단에 의존하고 있었다. scope 내 모든 decision을 평가할 필요가 있는지 검토한 결과, 이전 decision은 변경되지 않으며 그 유효성은 concept이 보장하고 calibrate가 괴리를 발견하는 구조(0016)가 이미 존재했다.

## 결정

review의 decision 평가 대상을 이번 세션에서 생성된 decision으로 한정한다.

### 제약 조건

- 이전 decision의 유효성 검증은 review의 책임이 아니다: concept이 현재 진실이며 calibrate가 괴리를 발견한다(0016)

### 전제 조건

- decision은 독립적이고 자기완결적이다(0016): 이전 decision이 번복되면 concept이 갱신되고 새 decision이 기록되므로, 이전 decision을 재평가할 필요가 없다

## 대안

### scope 내 모든 decision을 평가

- 설명: 해당 scope의 모든 decision을 로드하여 구현과 대조한다
- 트레이드오프: 이미 concept에 반영된 결정을 중복 검증하며, decision이 축적될수록 review 비용이 증가한다

### "관련 decision" 기준을 정의

- 설명: 변경된 concept과 관련된 decision을 필터링하는 기준을 별도로 정의한다
- 트레이드오프: 필터링 기준 자체가 모호해질 수 있고, concept 기반 필터링은 결국 concept을 다시 읽는 것과 동일하다

## 영향

- review 스킬 - Step 0의 decision 로드 범위와 Step 1의 decision 준수 검증 대상이 이번 세션으로 한정됨
