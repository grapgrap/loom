# review를 별도 에이전트 위임이 아닌 새 세션의 독립 실행으로 전환한다

## 맥락

review는 산출물을 만든 대화의 관성에서 벗어나기 위해 같은 세션의 메인이 plugin agent인 reviewer에게 검토를 위임하도록 설계되어 있었다. Claude Code에서는 플러그인 루트의 `agents/reviewer.md`가 자동 발견되므로 이 구현이 가능했다.

Loom을 Claude Code와 Codex가 함께 사용하는 플러그인으로 확장하면서 이 구현 전제가 무효화되었다. Codex는 subagent와 프로젝트별 custom agent를 지원하지만, Codex 플러그인은 Claude Code의 `agents/*.md`에 대응하는 agent 구성요소를 배포하지 않는다. 런타임별 agent 정의를 따로 유지하면 동일한 검토 절차가 배포 형식에 종속된다.

reviewer 위임의 본래 목적은 이름 붙은 agent 자체가 아니라 산출물을 만든 대화 맥락과 검토 맥락을 분리하는 것이다. Codex 지원 결정 아래 review를 새 세션에서 실행하면 별도 plugin agent 없이도 이 목적을 충족할 수 있다.

## 결정

review를 산출물 생성 세션의 하위 agent에게 위임하지 않고, 새 세션에서 직접 실행하는 독립 검토로 전환한다.

- review 스킬이 기존 reviewer의 검토 기준과 절차를 직접 담당한다.
- 별도 reviewer와 메인 사이의 수집·위임·큐레이션 분리는 제거한다. 새 review 세션이 산출물을 읽고, 비판을 검증하고, 심각도로 정리해 사용자에게 직접 보고한다.
- review는 계속 검증·보고만 수행하며 산출물을 직접 수정하지 않는다.
- 검토 대상은 새 세션에서 `git status`와 diff를 사용해 파악한다. 고정된 범위 선택 정책이나 별도 handoff 형식을 review 스킬에 규정하지 않는다. 변경 범위가 모호하거나 다른 작업의 변경이 섞인 정황이 있으면 그때 사용자에게 확인하고, 그렇지 않으면 확인된 변경을 검토한다.
- 사용자 안내는 review를 산출물 생성과 다른 새 세션에서 호출하는 흐름을 전제로 한다.

### 전제 조건

- 비판적 거리는 대화 맥락의 분리에서 나온다: 새 세션은 산출물을 만든 대화 로그를 상속하지 않으므로 별도 reviewer agent와 같은 핵심 격리를 제공한다.
- 기록된 산출물이 검토에 필요한 의도를 담는다: 코드와 문서, diff, decision을 읽어 검토 맥락을 재구성할 수 있다.
- 검토 범위의 모호함은 실행 시 드러난다: `git status`로 후보를 확인한 뒤 필요한 경우에만 사용자에게 물으면, 모든 작업에 고정된 범위 계약을 부과하지 않아도 된다.

### 제약 조건

- 새 세션 실행은 스킬이 구조적으로 강제할 수 없고 사용자의 호출 흐름에 의존한다.
  - 제약이 없었다면: 런타임이 산출물 생성 세션과 검토 세션의 분리를 자동으로 보장했을 것이다.
- 작업 트리에 여러 작업의 변경이 섞여 있으면 `git status`만으로 검토 대상을 확정할 수 없다.
  - 제약이 없었다면: 항상 자동으로 정확한 산출물 집합을 식별했을 것이나, 고정된 handoff 형식의 비용을 피하고 모호한 경우에만 사용자 판단을 받는다.

## 대안

### Claude Code plugin reviewer를 유지하고 Codex용 custom agent를 별도로 제공

- 설명: Claude Code에는 `agents/reviewer.md`, Codex에는 `.codex/agents/*.toml`을 각각 제공한다.
- 트레이드오프: Codex의 project custom agent는 플러그인 배포 구성요소가 아니므로 설치 경로가 갈라지고, 같은 검토 역할을 런타임별 형식으로 중복 관리해야 한다.

### review가 같은 세션에서 익명 subagent에게 검토 절차를 전달

- 설명: 이름 붙은 plugin agent 없이 매번 일반 subagent를 생성하고 검토 지침을 위임 프롬프트에 포함한다.
- 트레이드오프: 런타임별 위임 동작에 계속 의존하고 검토 지침 전달 구조가 남는다. 새 세션에서 review가 직접 실행하는 편이 역할과 실행 위치가 단순하다.

### 검토 범위를 명시적 파일 목록이나 handoff 문서로 강제

- 설명: 산출물 생성 세션이 검토 대상 목록을 영속 문서로 남기거나, review 호출 시 사용자가 범위를 반드시 지정한다.
- 트레이드오프: 범위가 자명한 작업에도 전달 절차가 추가된다. `git status`로 후보를 파악하고 모호할 때만 사용자에게 확인하는 방식이 더 가볍다.

## 영향

- review 스킬 - reviewer 위임을 제거하고 독립 세션에서 검토 기준·비판 검증·심각도 보고를 직접 수행하도록 변경된다.
- `agents/reviewer.md` - 검토 절차가 review 스킬로 이동하므로 더 이상 필요하지 않다.
- [[0056-delegate-review-to-fresh-reviewer]] - 대화 맥락을 분리한다는 목적은 유지하되, 분리 수단을 subagent에서 새 세션으로 바꾼다.
- [[0058-reviewer-evaluation-hierarchy-and-curation]] - 평가 기준과 모든 비판을 노출하는 정책은 유지하고, reviewer와 메인의 역할 분리는 하나의 독립 review 세션으로 합친다.
- [[0059-reviewer-as-plugin-agent]] - Claude Code plugin agent라는 구현 선택을 대체한다.
- [[0068-support-claude-code-and-codex]] - 공통 워크플로가 런타임 전용 plugin agent에 의존하지 않도록 review 실행 위치를 바꾼다.
