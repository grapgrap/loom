---
name: calibrate
description: >-
  concept과 코드의 정합성을 감사하고 교정한다. 문서와 코드 사이에 괴리가 쌓였다고 느낄 때
  수동으로 호출한다. "calibrate", "교정", "concept 감사" 같은 맥락에서 트리거된다.
---

# Calibrate

concept과 코드의 정합성을 감사하고 교정한다.

review가 세션 단위의 검증이라면, calibrate는 축적된 괴리를 교정하는 것이다.

## 언제 실행하는가

- concept과 코드 사이에 괴리가 쌓였다고 느낄 때
- 사용자가 수동으로 호출한다

## Step 0 — 컨텍스트 로드

1. `.loom/index.md`를 읽어 도메인 전체 지도를 파악한다.
2. `.loom/concepts/`의 모든 concept을 읽는다.
3. `.loom/principles/index.md`를 읽어 원칙을 로드한다.
4. 관련 코드를 탐색하여 현재 구현 상태를 파악한다.

## Step 1 — Concept 감사

### 괴리 발견

concept과 코드를 대조하여 괴리를 식별한다:

- **코드와의 괴리**: concept이 기술하는 것과 코드가 실제로 하는 것이 일치하는가
- **concept 간 정합성**: 책임이 겹치거나, 관계가 누락되거나, 경계가 모호한 concept이 있는가

### 원인 추적

괴리가 발견되면 해당 concept에 관련된 decision을 최신순으로 추적하여 원인을 파악한다:

- 어떤 결정이 이 괴리를 만들었는가
- 그 결정의 전제가 여전히 유효한가

### 교정 제안

괴리와 원인을 리포트로 정리하여 사용자에게 제안한다.
사용자가 승인한 항목에 대해서만 교정을 수행한다.

교정 시:
- concept을 수정한다.
- concept에 변경이 생기면 새 decision을 작성하여 변경의 맥락을 기록한다.
- 기존 decision은 수정하지 않는다.
- `.loom/index.md`의 갱신이 필요한지 판단한다.

템플릿:

- concept: `templates/concept.md`
- decision: `templates/decision.md`

## Step 2 — 원칙 검증 및 증류

### 기존 원칙 검증

기존 principle을 감사한다:

- 원칙 간 중복이나 충돌이 있는가
- 표현이 부정확하거나 범위가 맞지 않는가
- 더 이상 유효하지 않은 원칙이 있는가

불일치가 발견되면 해당 principle 파일을 수정하고,
`principles/index.md`도 함께 업데이트한다.
원칙 제거는 사용자에게 제안하고 승인 후 적용한다.
원칙은 사용자의 것이므로, 시스템이 임의로 삭제하지 않는다.

### 원칙 증류

auto memory에 축적된 세션 학습들을 검토한다.
여러 세션에 걸쳐 반복되는 패턴이 발견되면 원칙으로 증류할 수 있는지 판단한다.

원칙의 조건:

1. **반복성**: 개발 과정에서 반복적으로 마주치는 판단 상황에 대한 것인가
2. **당위성**: 그 방향이 유효한 이유가 충분히 명확한가

증류된 원칙은 사용자에게 제안하고 승인 후 `.loom/principles/`에 작성한다.

템플릿: `templates/principle.md`

## Summary

calibrate 완료 시 다음 형식으로 정리한다:

```
## Calibrate Summary
- Concepts:
  - 수정: [수정된 concept 목록]
  - 새 decisions: [concept 변경으로 생성된 decision 목록]
- Principles:
  - 수정: [수정된 원칙]
  - 증류 제안: [auto memory에서 발견된 원칙 후보]
  - 제거 제안: [근거와 함께]
- 다음 단계: [추가 교정이 필요하면 범위, 아니면 완료]
```
