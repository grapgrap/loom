---
name: review
description: >-
  구현이 설계를 충족하는지 검증하고, 경험에서 배운 것을 원칙으로 축적한다. 구현이 완료된 후
  사용한다. "review", "리뷰해줘", "구현 확인" 같은 맥락에서 트리거된다.
  review 완료 시 자동으로 reflect를 수행한다.
---

# Review

구현이 설계를 충족하는지 검증하고, 경험에서 원칙을 축적한다.

review는 두 가지를 수행한다:
1. **검증** — 구현이 concept과 plan에 부합하는가
2. **reflect** — 이 사이클에서 배운 것을 원칙에 축적

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

이번 사이클에서 배운 것을 원칙으로 축적한다.

reflect의 대상:
- 반복적으로 발생한 문제 패턴
- 효과적이었던 접근법
- 예상과 달랐던 결과
- concept이나 decision이 놓친 관점

### 축적 기준

원칙으로 추가할 가치가 있는가를 판단하는 리트머스 테스트:
> "다른 프로젝트, 다른 맥락에서도 이 교훈이 유효한가?"

일회성 교훈이나 프로젝트 특수한 노하우는 원칙이 아니다.

### 라우팅

학습이 발견되면 적절한 목적지로 보낸다:

| 유형 | 목적지 | 예시 |
|------|--------|------|
| 범용적 교훈 | `.loom/principles/` (템플릿: `templates/principle.md`) | "인터페이스를 먼저 정의하면 병렬 작업이 쉬워진다" |
| concept 보완 | `.loom/concepts/` 해당 파일 (템플릿: `templates/concept.md`) | "이 concept에 누락된 책임이 있었다" |
| decision 후기 | `.loom/decisions/` 해당 파일에 추기 (템플릿: `templates/decision.md`) | "이 결정의 결과가 예상과 달랐다" |

원칙을 추가/수정할 때는 `principles/index.md`도 함께 업데이트한다.
concept을 보완한 경우, `.loom/index.md`의 갱신이 필요한지 판단한다.

## Summary

review 완료 시 다음 형식으로 정리한다:

```
## Review Summary
- 검증 결과: [회귀 N건 / 수정 N건 / 관찰 N건]
- Reflect:
  - Principles: [추가/수정된 원칙]
  - Concepts: [보완된 concept]
  - Decisions: [후기가 추가된 decision]
- 다음 단계: [회귀가 필요하면 어느 단계로, 아니면 완료]
```
