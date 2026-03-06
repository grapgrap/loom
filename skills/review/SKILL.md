---
name: review
description: >-
  구현이 설계를 충족하는지 검증하고, 기존 원칙을 경험과 대조하며, 세션의 학습을 축적한다.
  구현이 완료된 후 사용한다. "review", "리뷰해줘", "구현 확인" 같은 맥락에서 트리거된다.
  review 완료 시 자동으로 reflect를 수행한다.
---

# Review

구현이 설계를 충족하는지 검증하고, 경험을 축적한다.

review는 두 가지를 수행한다:
1. **검증** — 구현이 concept, plan, decision, principle에 부합하는가
2. **reflect** — 기존 원칙을 경험과 대조하고, 세션의 학습을 축적한다

## Step 0 — 컨텍스트 로드

1. `.loom/principles/index.md`를 읽어 원칙을 로드한다.
2. 관련 concept들을 읽는다.
3. 관련 plan을 읽어 태스크와 설계 의도를 파악한다.
4. 관련 decision들을 읽어 결정의 맥락을 파악한다.

## Step 1 — 검증

구현을 다음 관점에서 검증한다:

- **concept 정합성**: 구현이 concept에 정의된 책임과 관계를 존중하는가
- **plan 충족**: plan의 태스크가 의도대로 구현되었는가
- **decision 준수**: 결정된 방향과 제약을 따르는가
- **원칙 위반**: 현재 원칙에 어긋나는 부분이 있는가

발견한 문제를 심각도와 함께 정리한다:
- **회귀 필요**: plan이나 shape 수준의 재검토가 필요한 문제
- **수정 필요**: 구현 수준에서 해결 가능한 문제
- **관찰**: 문제는 아니지만 주목할 만한 패턴

## Step 2 — Reflect

이번 사이클의 경험을 기존 원칙과 대조하고, 세션의 학습을 축적한다.

### 원칙 검증

기존 principle을 이번 세션의 경험과 대조한다:

- 이번 경험이 기존 원칙과 부합하는가
- 기존 원칙의 표현이 부정확하거나 범위가 맞지 않는가
- 기존 원칙의 전제가 여전히 유효한가

불일치가 발견되면 해당 principle 파일을 수정하고,
`principles/index.md`도 함께 업데이트한다.

### 세션 학습 축적

이번 세션에서 얻은 교훈을 적절한 곳에 기록한다.

concept이나 decision에 대한 학습:
- concept 보완 → `.loom/concepts/` 해당 파일 수정 (템플릿: `templates/concept.md`)
- decision 후기 → `.loom/decisions/` 해당 파일에 추기 (템플릿: `templates/decision.md`)

concept을 보완한 경우, `.loom/index.md`의 갱신이 필요한지 판단한다.

아직 원칙은 아니지만 의미 있는 교훈:
- auto memory에 기록한다
- 여러 세션에 걸쳐 축적된 후 meditate에서 원칙으로 증류될 수 있다

## Summary

review 완료 시 다음 형식으로 정리한다:

```
## Review Summary
- 검증 결과: [회귀 N건 / 수정 N건 / 관찰 N건]
- Reflect:
  - Principles: [수정된 원칙]
  - Concepts: [보완된 concept]
  - Decisions: [후기가 추가된 decision]
  - Memory: [auto memory에 기록한 교훈]
- 다음 단계: [회귀가 필요하면 어느 단계로, 아니면 완료]
```
