---
name: architect
description: 전략 설계로 컴포넌트의 책임과 경계를 정하고 입출력 계약과 전체 흐름을 구체화한다. 책임 경계나 외부 계약이 바뀌거나 구현 전 설계 검토가 필요할 때 사용한다.
---

# Architect

해결할 문제를 기준으로 컴포넌트의 책임과 경계, 협력 관계를 설계한다. 각 컴포넌트의 입력과 출력이 정해지고 전체 사용 흐름이 성립할 때까지 구체화한다.

설계만 맡았다면 제안을 반환한다. 구현까지 맡았다면 이번 범위와 검증 조건을 [work](../work/SKILL.md)에 전달한다. 작은 변경은 관련된 기존 모델과 계약만 확인한다. [원칙](../../references/principles.md)은 아래 판단에 맞춰 선택하며, 조사 초기에 현재 이해와 잠정 방향, 남은 쟁점을 공유한다.

## 전략 설계로 컴포넌트와 경계를 정한다

### 1. 목적과 현재 책임을 확인한다

[Outcome-Oriented Execution](../../references/principles/outcome_oriented_execution.md)에 따라 사용자 결과와 완료 조건, 장기 목표와 이번 범위를 정한다. 실제 사용 사례에서 필요한 판단, 실행과 상태 보관의 책임을 찾는다.

[understand](../understand/SKILL.md)로 현재 모델, 호출자와 형성 이유를 확인한다. [Foundational Thinking](../../references/principles/foundational_thinking.md)으로 기존 구성의 충분성을 판단하고, 요구가 전제를 바꿨다면 [Redesign From First Principles](../../references/principles/redesign_from_first_principles.md)를 적용한다.

### 2. 컴포넌트의 책임과 경계를 정한다

[Domain Vocabulary](../../references/principles/domain_vocabulary.md)에 따라 같은 개념과 책임에는 같은 말을 사용한다. 의미, 규칙과 변경 이유가 함께 움직이는 책임을 모으고, 독립적으로 판단하거나 변경해야 하는 책임은 나눈다. 각 컴포넌트가 소유할 판단과 상태, 보장할 조건 및 다른 컴포넌트에 맡길 책임을 밝힌다.

[Draw Clear Boundaries](../../references/principles/draw_clear_boundaries.md)와 [Earn Your Boundary](../../references/principles/earn_your_boundary.md)에 따라 기존 경계와 분리안을 비교한다. 분리가 실제로 보호할 규칙과 줄일 결합을 설명한다. 논리 컴포넌트를 폴더나 배포 단위와 일대일로 대응시키지 않는다.

### 3. 컴포넌트 간 협력 관계를 정한다

현재와 목표의 관계에서 누가 누구를 호출하고 어떤 정보를 주고받는지, 의존 방향과 변환 책임을 표시한다. 여러 컴포넌트를 거치는 흐름에서는 순서와 부분 실패의 처리를 누가 소유하는지 정한다.

[Cross-Domain Coupling](../../references/principles/cross_domain_coupling.md)과 [Dependency Direction](../../references/principles/dependency_direction.md)으로 모델의 소유와 통합 책임을 확인한다. 중요한 새 선택은 [Exhaust the Design Space](../../references/principles/exhaust_design_space.md)에 따라 기존 안과 구조적으로 다른 안의 보장, 손실과 전환 비용을 비교한다. 레퍼런스의 보장에 필요한 전제도 확인하고 관찰 가능한 쟁점은 작은 실험으로 푼다.

## 선택한 전략을 구현 계약으로 구체화한다

합의한 컴포넌트 경계와 관계 안에서 [Public Interface](../../references/principles/public_interface.md)에 따라 구체 호출의 입력, 결과, 상태 변화, 실패와 순서 조건을 정한다. 입력을 누가 제공하고 결과를 누가 소비하는지 연결하고, 필요한 타입과 시그니처만 스케치한다.

상태와 전이는 [Model Valid States](../../references/principles/model_valid_states.md), 실패 대응은 [Error Boundary Placement](../../references/principles/error_boundary_placement.md), 반복과 동시 변경은 [멱등성](../../references/principles/make_operations_idempotent.md)과 [공유 상태](../../references/principles/separate_before_serializing_shared_state.md)로 판단한다. 호출자가 내부를 추측하지 않고 협력하고, 구현자가 다른 책임의 정책을 대신 정하지 않으며, 검증 사례를 만들 수 있으면 세분화를 마친다. 남은 내부 선택은 구현에 맡긴다. 함수, 파일과 공개 범위는 [모듈 구성 규칙](../../references/rules/module_cohesion.md)에 따라 각각 정한다.

## 전체 흐름과 전환을 확인한다

[Verify Domain Contracts](../../references/principles/verify_domain_contracts.md)에 따라 대표 사용 사례를 연결하고, 전체 흐름과 책임 경계를 확인할 수 있는 도식을 기본 결과물로 만든다. 상태와 전이가 중심이면 상태흐름도, 처리 순서와 분기가 중심이면 플로우차트를 사용하며 대화에서는 Mermaid를 우선한다. 작은 변경은 영향을 받는 경계와 연결 흐름만 간결하게 그린다.

도식에는 다음을 드러낸다.

- 흐름의 시작과 종료, 주요 상태나 처리 단계 및 전이·분기 조건
- 각 판단과 상태를 소유하는 컴포넌트의 경계와 경계를 넘는 입력·결과. 그룹이나 명시적인 소유자 표기로 책임을 구분한다.
- 정상 경로와 중요한 실패에서 남는 상태 및 다음 행동. 대기와 재시도가 있으면 재개·종료 조건도 표시한다.

전체 관계를 먼저 보여주고, 한 도식에서 읽기 어려운 세부 흐름은 해당 컴포넌트나 단계에 연결한 하위 도식으로 나눈다. 도식과 입출력 계약에 같은 이름을 사용하고 앞 단계의 결과가 다음 입력을 충족하는지 대조한다. 모순은 관련 계약으로 돌아가 보완하며 논리 검토를 실행 검증으로 보고하지 않는다.

[호출자 전환 원칙](../../references/principles/migrate_callers_delete_legacy.md)에 따라 이번 변경, 유지할 구현, 남는 차이와 해소 조건을 정한다. 작업은 컴포넌트 수가 아니라 관찰 가능한 결과와 선행 계약으로 나눈다. 첫 사용 경로와 통합 검증을 포함하고 [테스트 규칙](../../references/rules/test_contracts_first.md)에 따라 구현 전에 확인할 기대값을 전달한다.

설계는 전체 흐름과 책임 경계를 보여주는 도식을 중심으로 대화에서 전달한다. 현재에서 목표로 달라지는 관계를 드러내고, 선택 이유, 도식에 담기 어려운 입출력 계약, 전환 순서, 흐름 대조 결과 및 미확인은 설명으로 보완한다. 여러 세션의 실행에 추가 문서가 필요할 때만 [실행 계획](../../templates/execution-plan.md)을 쓴다. 실행 owner는 채택한 범위 변경을 [work revise](../work/references/context-work.md)로 반영한다. 설계만 맡았다면 업무 상태를 변경하지 않는다.

## 합의 경계

새 근거가 합의한 목적, 모델 경계나 보장을 바꾸면 전제와 영향을 먼저 공유하고 관련 판단을 다시 한다. 도메인의 의미, 제품 정책, 사용자 경험이나 외부 계약에 관해 사람의 선택이 남거나 사용자가 구현 전 확인을 요청했다면 해당 구현을 기다린다. 내부 구체화는 반복 승인 없이 진행한다.
