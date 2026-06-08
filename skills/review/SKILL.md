---
name: review
description: >-
  구현이 설계를 충족하는지 검증하고, 기존 rule·convention을 경험과 대조하며, 세션의 학습을
  축적한다. 구현이 완료된 후 사용한다. "review", "리뷰해줘", "구현 확인" 같은 맥락에서
  트리거된다. review 완료 시 자동으로 reflect를 수행한다.
---

# Review

구현이 설계를 충족하는지 검증하고, 경험을 축적한다.

review는 두 가지를 수행한다:
1. **검증** — 구현이 concept, flow, plan, decision, rule·convention에 부합하는가
2. **reflect** — 기존 rule·convention을 경험과 대조하고, 세션의 학습을 축적한다

## Step 0 — 컨텍스트 로드

1. 작업 대상 프로젝트의 `.loom/index.md`를 읽어 도메인 전체 지도를 파악한다.
2. `aeira search -s {프로젝트의 .loom 경로} "{입력 키워드}"` 로 관련 문서를 식별한다.
3. 식별된 문서에서 `aeira graph neighbors -s {프로젝트의 .loom 경로} "{node}"` 로 연결 문서를 탐색한다 (outgoing: 연관 concept과 flow, incoming: 참조 decision).
4. 탐색된 concept과 flow를 읽는다.
5. `.loom/plans/`에서 관련 plan을 읽어 태스크와 설계 의도를 파악한다.
6. `.loom/decisions/`에서 이번 세션에서 생성된 decision들을 읽는다. 이전 decision의 유효성은 concept이 보장하며, 괴리 발견은 calibrate의 책임이다.

## Step 1 — 룰 카탈로그 로드

`.loom/rules/index.md`를 읽어 어떤 룰과 컨벤션이 있는지 카탈로그를 인지한다.

rule은 이 프로젝트에서 항상 지켜져야 하는 강제적 합의, convention은 강하게 권장되지만 대체 가능한 형태이다. 인덱스를 통해 항목 목록과 각 항목의 호출 상황을 파악한다. 본문은 활용 시점에 필요한 항목을 골라낸 뒤 로드한다.

## Step 2 — 설계 검증

이번 세션의 구현과 산출물이 설계에 부합하는지 감사한다.

### 설계 산출물 정합성

- **concept 정합성**: 구현이 concept에 정의된 책임과 관계를 존중하는가
- **flow 정합성**: 구현이 flow에 기술된 도메인 간 흐름을 따르는가
- **concept 형식 준수**: concept에 시점 종속 항목이 포함되어 있지 않은가
- **plan 충족**: plan의 태스크가 의도대로 구현되었는가
- **decision 준수**: 이번 세션에서 생성된 decision의 방향과 제약을 따르는가

### 세션 내 concept 왜곡 감사

이번 세션에서 concept이 다음 네 가지 방향으로 기울었는지 감사한다. 두 극단 모두 피한다.

- **비대화**: 분화해야 하는데 기존 concept에 새 책임이 추가되었는가
- **의미 흐려짐**: 변경해야 하는데 예외나 단서로 감싸 concept의 경계가 흐려졌는가
- **데드 concept**: 삭제해야 하는데 방치된 concept이 있는가
- **과잉 분화**: 분화가 불필요했는데 쪼개진 것은 아닌가

### Decision 감사

이번 세션에서 생성된 decision 각각에 대해 감사한다.

- **판단 근거 타당성**: 대안이 충분히 탐색되었고, 선택의 근거가 명료한가
- **자기완결성**: 참조된 다른 decision을 읽지 않아도 맥락이 이해되는가 (대체·폐기 참조가 없고, 갱신·계승 참조가 있더라도 맥락이 자기 안에서 닫히는가)
- **유지 decision 근거**: 전제·제약의 무효화 정황이 사실과 맞는가, 유지 근거와 유효 기한이 이후 감사 가능한 형태로 기록되었는가

## Step 3 — rule·convention 검증

구현이 rule과 convention에 부합하는지 검증한다.

### 룰 카탈로그 활용

인지한 룰 카탈로그를 도구 선택 절차로 활용한다:

1. 지금 수행하려는 행동을 의식적으로 명시한다
2. 카탈로그에서 그 행동에 적용될 가능성 있는 항목을 골라낸다
3. 골라낸 항목의 본문 파일을 로드해 정의된 형태를 파악한다
4. 본문에 따라 구현이 부합하는지 검증한다

### 위반 분류

- rule 위반: 적용되는 상황에서 정의와 어긋남 → 수정 필요로 분류
- convention 위반: 정당한 사유 없이 정의와 어긋남 → 사유 확인 또는 수정 후보로 분류

---

Step 2, 3에서 발견한 문제를 심각도와 함께 정리한다:
- **회귀 필요**: plan이나 shape 수준의 재검토가 필요한 문제
- **수정 필요**: 구현 수준에서 해결 가능한 문제
- **관찰**: 문제는 아니지만 주목할 만한 패턴

## Step 4 — Reflect

이번 사이클의 경험을 기존 원칙과 대조하고, 세션의 학습을 축적한다.

### Concept-rule 정합성

이번 세션에서 생성되거나 수정된 concept이 있다면, rule·convention과 정합한지 검증한다:

- concept의 설계 방향이 관련 rule·convention의 적용 범위와 부합하는가
- concept의 트레이드오프가 rule·convention의 정의와 충돌하지 않는가

### rule·convention 유효성

기존 rule·convention을 이번 세션의 경험과 대조한다:

- 이번 경험이 기존 rule·convention과 부합하는가
- 기존 정의가 부정확하거나 적용 범위가 맞지 않는가
- 기존 rule·convention의 전제가 여전히 유효한가

불일치가 발견되면 해당 파일을 수정하고, `.loom/rules/index.md`도 함께 업데이트한다.

### 세션 학습 축적

이번 세션에서 얻은 교훈을 적절한 곳에 기록한다.

- concept 보완 → `.loom/concepts/` 해당 파일 수정 (템플릿: `templates/concept.md`)
- decision 후기 → `.loom/decisions/` 해당 파일에 추기 (템플릿: `templates/decision.md`)

concept을 보완한 경우, `.loom/index.md`의 갱신이 필요한지 판단한다.

새 rule·convention을 발견한 경우, 사용자에게 제안하고 승인 후 `.loom/rules/`에 작성한다. rule인지 convention인지 분류는 사용자와 함께 결정한다.

### 그래프 갱신

`.loom/` 내 문서를 생성하거나 수정한 후 `aeira sync -s {프로젝트의 .loom 경로}` 를 실행한다.

## Summary

review 완료 시 다음 형식으로 정리한다:

```
## Review Summary
- 검증 결과: [회귀 N건 / 수정 N건 / 관찰 N건]
- Reflect:
  - Rules: [수정·신규 추가된 rule·convention]
  - Concepts: [보완된 concept]
  - Decisions: [후기가 추가된 decision]
- 다음 단계: [회귀가 필요하면 어느 단계로, 아니면 완료]
```
