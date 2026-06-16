# 검토자를 loom plugin agent로 정의하고 메인이 Agent 도구로 위임한다

## 맥락

0058이 검토자와 메인의 역할·전달 계약을 정했으나, 검토자를 어떤 형태로 구현하는가는 열려 있었다. loom에 서브에이전트 위임 선례가 전무하여 Claude Code의 agent 정의 규칙을 확인했다.

Claude Code 플러그인은 루트의 `agents/` 디렉토리에서 agent 정의(frontmatter + 시스템 프롬프트의 마크다운)를 자동 발견하고 `loom:<name>`으로 namespace한다. 무엇보다 서브에이전트는 부모의 대화 히스토리를 상속받지 않고 자기 시스템 프롬프트와 위임 프롬프트만 받는다 — 0056이 차단하려던 대화 맥락 오염이 서브에이전트를 쓰는 순간 구조적으로 차단된다.

## 결정

검토자를 `agents/reviewer.md`로 정의한다(loom:reviewer). review 스킬의 메인 파트는 이 검토자를 Agent 도구로 위임 호출한다.

- 검토 지침은 reviewer agent의 시스템 프롬프트에 담는다. SKILL.md에 인라인하지 않는다.
- 메인은 위임 프롬프트에 이번 세션 변경·생성 파일 목록과 대상 `.loom` 경로를 전달한다. 산출물 요약 해석은 끼우지 않는다(0058).
- 검토자의 tools는 Read·Grep·Glob·Bash로 한정한다. 직접 수정하지 않으므로 Write·Edit은 주지 않는다.
- 검토자는 자기 tools로 변경 파일·diff와 기존 .loom 문서(aeira 탐색)를 직접 읽어 검토 맥락을 세운다.

### 에이전트 명세의 방향

검토자 명세는 페르소나를 연기시키지 않고 기능을 규정한다. "너는 최종 관문이다", "그 무지가 무기다" 같은 정체성 연기나 근거 없는 수치로 편향을 주입하는 어법을 배격하고, loom의 다른 문서와 같은 무인칭 명세체로 쓴다. 이는 향후 loom agent 전반에 적용될 convention감이며, 정식화는 shape에 둔다.

### 전제 조건

- 서브에이전트의 컨텍스트 격리가 확인되었다: 부모 대화를 상속받지 않으므로 0056의 위치 분리가 구현으로 보장된다
- 플러그인 agent는 자동 발견된다: plugin.json이 명시 참조하지 않아도 agents/ 디렉토리가 로드된다

### 제약 조건

- 플러그인 agent는 hooks·mcpServers·permissionMode frontmatter를 지원하지 않는다
  - 제약이 없었다면: 검토자에 별도 권한 모드를 줄 수 있었으나, 검토자는 읽기 전용이라 tools 제한으로 충분하다

## 대안

### 검토 지침을 SKILL.md에 인라인한다

- 설명: loom의 단일 SKILL.md 관행을 유지하고, 메인이 검토 지침 블록을 매 위임마다 프롬프트로 복사해 전달한다
- 트레이드오프: 서브에이전트는 자기 시스템 프롬프트를 갖는 일급 컴포넌트인데, 인라인은 Claude Code의 agent 메커니즘(자동 발견, 격리, 재사용)을 쓰지 못하고 지침을 매번 복사해야 한다. 검토자를 일급 agent로 두는 편이 격리의 구조적 보장과도 맞는다

## 영향

- review - 메인 파트가 loom:reviewer를 Agent 도구로 위임 호출하는 구조가 된다
- [[0056-delegate-review-to-fresh-reviewer]] - 위임을 plugin agent로 구현하여 대화 맥락 격리를 구조적으로 달성한다 (보완)
- [[0058-reviewer-evaluation-hierarchy-and-curation]] - 전달 계약을 Agent 도구 위임으로 구체화한다 (보완)
