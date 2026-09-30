---
name: review
description: 설계나 코드 변경의 타당성, 회귀 위험과 검증 증거를 독립적으로 비판한다. 사용자가 검토를 요청했거나 위험한 변경을 전달하기 전에 점검할 때 사용한다.
---

# Review

산출물과 확인 가능한 근거를 기준으로 판단과 검증의 빈틈을 찾는다. 작성자의 확신과 별개로 반례를 확인한다. 독립적인 검토 요청은 조사와 보고가 범위다. `work`의 일부로 수행하면 확인된 지적을 실행 책임자에게 전달한다.

## 검토 범위를 정한다

사용자가 지정한 설계, 파일, diff, 커밋 또는 PR을 우선한다. 지정하지 않았다면 이번 작업의 변경 범위를 확인한다. 사용자 목표와 유지할 계약을 복원하되, 작성자의 설명을 산출물의 증거로 대신하지 않는다.

## 무엇을 의심할지 고른다

- 결과가 도메인 목적과 사용자 경험에 맞는가. 책임·경계나 외부 계약이 의도치 않게 바뀌지 않았는가.
- 코드가 원인을 해결하는가. 호출자, 상태·실패 경로, 기존 동작에 회귀가 없는가.
- 검증이 실제 사용자 경로와 중요한 부작용을 관찰했는가. 통과 주장에 근거가 있는가.
- 읽는 사람이 변경 이유와 제어 흐름을 따라갈 수 있는가. 불필요한 추상화나 잔존한 구 경로가 없는가.

설계에서 보존하기로 한 조건이 구현과 검증에도 이어지는지 확인한다. 구현 중 드러난 사실이 전제를 반박했는데도 처음의 그림이나 완료 주장을 유지하고 있지 않은지 본다.

작업에 적용되는 [원칙](../../references/principles.md)만 판단 근거로 쓴다. 살아 있는 문서의 실제 불일치는 지적하되, 과거의 작업 기록을 현재 설계도처럼 갱신하라고 요구하지 않는다.

공통 코드나 인터페이스가 바뀌었다면 [Essential vs Accidental Duplication](../../references/principles.md#essential-vs-accidental-duplication)으로 변경 이유가 다른 정책을 묶었는지 본다. 함수나 유사한 흐름의 표현이 바뀌었다면 [Single Level of Abstraction](../../references/principles.md#single-level-of-abstraction)으로 표현의 차이가 실제 책임·동작·제약의 차이를 반영하는지 본다.

이름이 바뀌었다면 [Domain Vocabulary](../../references/principles.md#domain-vocabulary)와 [Intention-Revealing Names](../../references/principles.md#intention-revealing-names)로 의미와 의도를 확인한다. 오류 처리나 실패 계약이 바뀌었다면 [Error Boundary Placement](../../references/principles.md#error-boundary-placement)와 [Meaningful Errors](../../references/principles.md#meaningful-errors)로 처리 책임과 원인 정보가 보존되는지 본다.

## 보고

제출 전에 지적을 반박해 본다. 이미 처리한 경로, 의도한 트레이드오프 또는 적용되지 않는 전제를 결함으로 오인하지 않았는지 확인한다. 가능한 경우 반례를 실행한다.

확인된 문제만 영향이 큰 순서로 적는다. 각 지적은 위치, 재현 또는 논증 가능한 근거, 사용자에게 미치는 결과를 포함한다. 근거가 모자라면 결함이라고 단정하지 말고 확인할 질문으로 분리한다. 문제가 없으면 검토 범위와 남은 검증 한계를 말한다. 형식적인 지적 수를 채우지 않는다.
