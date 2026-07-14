# reviewer와 curator plugin agent를 제거하고 책임을 스킬에 귀속한다

## 맥락

Loom을 Claude Code와 Codex가 함께 사용하는 하나의 플러그인으로 제공하기로 하면서, Claude Code가 플러그인 루트의 `agents/*.md`를 자동 발견한다는 전제에 의존할 수 없게 되었다. Codex는 subagent와 project custom agent를 지원하지만 Claude Code의 plugin agent를 같은 방식으로 배포하지 않으므로, reviewer와 curator를 런타임별 형식으로 유지하면 공통 스킬이 설치 환경에 따라 다른 외부 역할에 의존한다.

두 agent가 분리된 이유는 서로 다르다. reviewer는 산출물을 만든 대화와 검토 맥락을 격리하기 위해 존재했고, curator는 shape·plan·task가 관련 `.loom` 문서를 모두 메인 컨텍스트에 일괄 로드하지 않도록 탐색과 선별을 맡기기 위해 존재했다. agent 파일을 제거하더라도 이 두 목적은 보존되어야 한다.

reviewer의 맥락 격리는 review를 산출물 생성과 다른 새 세션에서 직접 실행하는 방식으로 대체하기로 했다. curator의 탐색은 별도 판단 주체가 필요한 일이 아니라 호출 스킬이 자기 맥락에 필요한 문서를 고르는 준비 작업이므로, shape·plan·task가 직접 수행할 수 있다.

## 결정

`agents/reviewer.md`와 `agents/curator.md`를 제거하고, Loom의 핵심 워크플로에서 plugin agent 의존을 없앤다.

### reviewer 책임

- review 스킬이 기존 reviewer의 평가 기준, 비판 생성, 비판 검증, 심각도 분류와 보고를 직접 담당한다.
- review는 산출물을 만든 세션과 다른 새 세션에서 실행하여 대화 맥락을 분리한다.
- review는 검증·보고만 수행하고 산출물을 직접 수정하지 않는다.

### curator 책임

- shape·plan·task는 별도 curator에게 위임하지 않고 aeira로 관련 문서를 직접 탐색하고 선별한 뒤 읽는다.
- 단계적 로딩은 유지한다. 진입 시에는 index와 요청에 관련된 concept·flow를 파악하고, decision은 이전 전제나 제약을 확인하거나 사용자 제안을 평가할 필요가 생긴 시점에 해당 맥락으로만 탐색한다.
- 관련 문서를 읽고 관계와 우선순위를 판단하는 책임은 계속 호출 스킬에 있다. 같은 사안의 decision이 충돌하면 번호가 큰 결정을 우선한다.
- calibrate는 전체 문서 감사를 수행하므로 기존처럼 전수 탐색하며 curator 대체 범위에 포함하지 않는다.
- 별도 curate 스킬이나 공용 agent 역할을 새로 만들지 않는다. shape·plan·task에 필요한 짧은 탐색 절차가 반복되는 비용을 런타임 독립성과 명시성의 대가로 받아들인다.

### 전제 조건

- reviewer의 본질은 agent 정체성이 아니라 맥락 분리다: 새 세션 실행이 산출물 생성 대화의 관성을 차단한다.
- curator의 선별 기준은 호출 맥락에서 나온다: shape·plan·task가 자기 요청 맥락을 이미 알고 있으므로 별도 agent 없이 관련 문서를 고를 수 있다.
- aeira가 탐색 인프라로 동작한다: 직접 탐색으로 바뀌어도 의미 검색과 관계 확장을 유지할 수 있다.

### 제약 조건

- reviewer의 새 세션 실행은 스킬이 강제하지 못하고 사용자의 호출 흐름에 의존한다.
  - 제약이 없었다면: 런타임이 검토 세션의 격리를 자동으로 보장했을 것이다.
- curator 제거로 shape·plan·task에 유사한 탐색 절차가 반복된다.
  - 제약이 없었다면: 두 런타임이 같은 plugin agent 배포 형식을 제공하여 한 곳의 절차를 격리된 실행 단위로 재사용했을 것이다.
- 메인이 탐색과 본문 판단을 함께 하므로 관련 없는 검색 결과가 메인 컨텍스트에 일부 들어올 수 있다.
  - 제약이 없었다면: 경로 선별의 중간 출력을 완전히 격리했을 것이나, decision의 필요 시점 로딩과 좁은 검색어로 오염을 제한한다.

## 대안

### 런타임별 custom agent를 각각 제공

- 설명: Claude Code에는 Markdown plugin agent를, Codex에는 TOML custom agent를 제공한다.
- 트레이드오프: Codex custom agent는 플러그인 구성요소로 같은 방식으로 배포되지 않으며 역할 정의와 설치 경로가 이중화된다.

### 익명 subagent에 역할 지침을 매번 전달

- 설명: reviewer와 curator 파일은 없애되 각 스킬이 일반 subagent를 만들고 역할 지침을 위임 프롬프트에 포함한다.
- 트레이드오프: 런타임별 위임 동작에 계속 의존하고, 짧은 탐색 작업에도 별도 실행과 전달 계약을 유지해야 한다. reviewer는 새 세션, curator는 직접 탐색으로 목적을 더 단순하게 충족할 수 있다.

### curator를 별도 스킬로 전환

- 설명: 문서 탐색 절차를 `curate` 스킬로 만들고 shape·plan·task가 사용하게 한다.
- 트레이드오프: 별도 스킬은 메인 컨텍스트를 격리하지 않으므로 기존 curator agent의 장점을 제공하지 않으며, 내부 준비 작업을 사용자에게 노출되는 독립 워크플로로 과잉 분화한다.

## 영향

- `agents/` - reviewer와 curator 삭제 후 디렉토리 자체가 필요 없어질 수 있다.
- review - reviewer의 검토 절차를 흡수하고 새 세션에서 독립 실행하도록 변경된다.
- shape·plan·task - curator 위임을 제거하고 단계적인 aeira 탐색·선별을 직접 수행하도록 변경된다.
- [[0056-delegate-review-to-fresh-reviewer]] - 맥락 분리 목적은 새 review 세션으로 보존한다.
- [[0059-reviewer-as-plugin-agent]] - reviewer를 Claude Code plugin agent로 구현한 선택을 대체한다.
- [[0063-delegate-document-retrieval-to-curator]] - 필요 시점별 문서 로딩은 유지하되 curator agent로 분리한 구현을 대체한다.
- [[0068-support-claude-code-and-codex]] - 런타임 전용 agent 의존 제거로 공통 스킬 원칙을 구체화한다.
- [[0069-review-as-fresh-session]] - 새 세션 review의 구체적인 검토 책임과 대상 식별 방식을 그대로 따른다.
