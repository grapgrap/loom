# Loom의 원칙

설계와 구현은 도메인 판단에서 시작한다. 문제의 목적, 개념, 책임, 제약, 경계와 용어를 먼저 정하고, 기술 구조와 구현은 그 판단을 표현한다.

## 코드베이스의 책임과 관계

코드베이스는 도메인과 레이어라는 두 축으로 이해한다. 도메인은 무엇에 관한 책임인지, 레이어는 그 책임을 어떤 역할과 추상화 수준에서 수행하는지 설명한다. 각 모듈은 자신의 도메인과 역할을 설명할 수 있어야 한다.

도메인은 자기 모델에서 허용하는 상태와 동작을 정하고 일관성을 보장한다. 외부는 공개 모델과 인터페이스로 접근한다. 계약에는 입력과 결과, 실패, 호출 순서와 호출자가 지켜야 할 조건을 담는다. 외부 형식은 경계에서 도메인의 어휘와 모델로 변환한다.

모델은 공통 어휘와 허용하는 상태를 표현한다. 경계 변환은 외부 형식을 해석하고 검증한다. 도메인 동작은 모델과 제약에 따라 연산한다. 화면은 표시와 입력을 맡고, 조합 지점은 여러 도메인을 연결하고 외부 구현을 선택한다. 이 역할 구분은 다섯 개의 파일이나 폴더를 요구하지 않는다. 별도의 책임이 없는 전달 계층은 만들지 않는다.

조율과 표현은 이를 지탱하는 계약과 모델에 의존한다. 모델은 자신을 사용하는 동작, 화면이나 실행 환경을 참조하지 않는다. 부모는 자식의 공개 모델을 합성하거나 인터페이스를 사용하지만 자식은 부모를 모른다. 외부 기능이 필요하면 도메인의 어휘로 계약을 정하고 조합 지점에서 구체적인 구현을 연결한다.

도메인 간 결합은 같은 역할의 공개 모델과 인터페이스에서 이루어진다. 모델은 합성하고, 인터페이스는 계약을 사용하며 어휘와 형식을 변환한다. 여러 도메인의 동작이나 화면을 잇는 책임은 공통 부모나 조합 지점에 둔다. 논리적인 부모·자식 관계와 폴더의 중첩은 구분한다.

코드는 사람이 읽고 변경한다. 책임, 의존 관계와 도메인 의미가 이름과 흐름에서 읽혀야 한다. 가독성과 복잡성은 그 의미를 이해하기 위해 추적해야 하는 관계와 기억해야 하는 상태를 기준으로 판단한다.

## 적용할 항목을 고른다

프로젝트 지침과 사용자의 명시적 선택을 먼저 적용한다. 위의 책임과 관계를 현재 작업의 목적과 영향에 비추어 확인하고, 내려야 할 판단과 보존하거나 바꿀 조건을 정한다.

아래 적용 상황과 판단 기준에서 현재 결정에 관련된 항목을 고르고, 적용하기 전에 해당 본문의 적용·예시·경계를 확인한다. 새로운 사실이 판단의 전제나 영향 범위를 바꾸면 관련 항목을 다시 확인한다.

### 목적에서 설계를 도출한다

| 적용 상황 | 원칙 | 판단 기준 |
| --- | --- | --- |
| 기능이나 설계 변경을 시작할 때 | [Outcome-Oriented Execution](principles/outcome_oriented_execution.md) | 원하는 도메인 동작과 계약에서 필요한 책임과 구조를 역산한다. |
| 개념이나 구조를 추가할 때 | [Foundational Thinking](principles/foundational_thinking.md) | 기존 책임과 계약의 조합으로 충분한지 먼저 확인한다. |
| 전례 없는 책임·계약 선택을 할 때 | [Exhaust the Design Space](principles/exhaust_design_space.md) | 기존 방식과 새로운 방식의 책임·계약·의존 관계를 구체적으로 비교한다. |
| 요구사항이 기존 설계의 전제를 바꿀 때 | [Redesign From First Principles](principles/redesign_from_first_principles.md) | 바뀐 목적과 제약에서 영향받는 책임과 계약을 다시 도출한다. |

### 책임과 경계를 유지한다

| 적용 상황 | 원칙 | 판단 기준 |
| --- | --- | --- |
| 검증 위치나 관심사의 책임을 정할 때 | [Draw Clear Boundaries](principles/draw_clear_boundaries.md) | 데이터 검증, 상태 소유와 변경 이유의 경계를 분명히 한다. |
| 모듈이나 추상화를 분리·통합할 때 | [Earn Your Boundary](principles/earn_your_boundary.md) | 고유한 입력, 제약이나 역할을 소유하는 경계를 둔다. |
| 도메인의 코드를 배치할 때 | [Domain as Folder](principles/domain_as_folder.md) | 도메인별로 코드를 모으고, 논리적 관계는 공개 계약으로 드러낸다. |
| 파일을 나누거나 코드를 함께 둘 때 | [File Cohesion](principles/file_cohesion.md) | 같은 도메인과 역할에서 함께 이해하고 변경할 코드를 모은다. |
| 유사한 구현을 공유하려 할 때 | [Essential vs Accidental Duplication](principles/essential_vs_accidental_duplication.md) | 외관보다 같은 변경 이유를 근거로 공유 여부를 판단한다. |
| 재사용을 위한 추상화를 도입할 때 | [Premature Abstraction Avoidance](principles/premature_abstraction_avoidance.md) | 현재의 사용 사례와 책임에서 확인한 증거로 추상화를 정당화한다. |

### 의존과 조합의 방향을 지킨다

| 적용 상황 | 원칙 | 판단 기준 |
| --- | --- | --- |
| 모듈 참조나 외부 구현을 연결할 때 | [Dependency Direction](principles/dependency_direction.md) | 모델과 하위 책임을 소비자의 사정에 묶지 않는다. |
| 여러 도메인을 연결할 때 | [Cross-Domain Coupling](principles/cross_domain_coupling.md) | 공개 모델과 인터페이스를 사용하고 조율 책임을 공통 부모나 조합 지점에 둔다. |
| 화면과 입력 흐름을 설계할 때 | [View Boundary](principles/view_boundary.md) | 표시·입력을 외부 형식의 해석과 도메인 규칙에서 분리한다. |

### 도메인의 의미와 계약을 드러낸다

| 적용 상황 | 원칙 | 판단 기준 |
| --- | --- | --- |
| 모델과 동작의 이름을 정할 때 | [Domain Vocabulary](principles/domain_vocabulary.md) | 도메인의 개념과 역할이 코드의 어휘에서 읽히게 한다. |
| 동작을 조율하거나 구현 단위를 나눌 때 | [Single Level of Abstraction](principles/single_level_of_abstraction.md) | 표현의 수준과 차이가 실제 책임·동작·제약을 반영하게 한다. |
| 제공하거나 요구할 계약을 정할 때 | [Public Interface](principles/public_interface.md) | 동작·값·실패·호출 조건을 명시하고 내부 구현은 공개하지 않는다. |
| 계약의 이름과 동작을 정하거나 바꿀 때 | [Least Astonishment](principles/least_astonishment.md) | 호출자가 예상하는 의미와 동작을 일치시키고 기존 전제를 변경 비용에 포함한다. |
| 외부 값이나 다른 도메인의 값을 받을 때 | [Parse at Boundaries](principles/parse_at_boundaries.md) | 경계에서 자기 도메인의 형식과 계약을 확보한다. |
| 허용하는 상태와 데이터를 정의할 때 | [Model Valid States](principles/model_valid_states.md) | 상태마다 필요한 값을 보장하고 허용하지 않는 조합과 전이를 막는다. |
| 실패에 대응하는 위치를 정할 때 | [Error Boundary Placement](principles/error_boundary_placement.md) | 대응할 책임과 능력이 있는 경계에서 처리한다. |
| 실패를 생성하거나 변환할 때 | [Meaningful Errors](principles/meaningful_errors.md) | 실패 종류·원인·맥락을 계약으로 보존하여 대응을 선택할 수 있게 한다. |

### 변경 후에도 일관성을 보장한다

| 적용 상황 | 원칙 | 판단 기준 |
| --- | --- | --- |
| 반복되거나 재시도되는 상태 변경을 설계할 때 | [Make Operations Idempotent](principles/make_operations_idempotent.md) | 같은 요청의 반복이 의도한 상태로 수렴하게 한다. |
| 동시에 변경하는 상태를 설계할 때 | [Separate Before Serializing Shared State](principles/separate_before_serializing_shared_state.md) | 상태 소유와 불변 조건에서 필요한 공유와 동기화를 도출한다. |
| 인터페이스를 교체할 때 | [Migrate Callers Then Delete Legacy](principles/migrate_callers_delete_legacy.md) | 호출자를 전환하고 이전 계약을 제거하며 외부 소비자의 전환 경로를 보장한다. |
| 결함을 수정할 때 | [Fix Root Causes](principles/fix_root_causes.md) | 근본 원인을 수정하여 같은 원인에서 발생한 문제들의 해소를 확인한다. |
| 책임·모델·계약을 변경한 뒤 | [Verify Domain Contracts](principles/verify_domain_contracts.md) | 도메인의 불변 조건, 공개 동작과 의존 관계가 보존되는지 증거로 확인한다. |

도메인별 배치, 도메인이 요구하는 계약과 외부 구현의 분리, 진입점의 조합을 보여주는 사례는 [Structure Effect by Domain](https://ratstack.sh/lore/structure-effect-by-domain)에서 볼 수 있다.
