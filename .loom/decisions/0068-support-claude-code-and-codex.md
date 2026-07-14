# Loom을 Claude Code와 Codex 양쪽에서 동작하는 플러그인으로 제공한다

## 맥락

Loom은 Claude Code 플러그인으로 시작하여 스킬, 플러그인 manifest, marketplace, plugin agent를 Claude Code의 형식에 맞춰 제공해 왔다. 이 구조에서는 `skills/`의 워크플로뿐 아니라 `agents/*.md` 자동 발견과 `.claude-plugin/` 배포 형식도 실행 전제에 포함되어 있었다.

Loom을 이제 Codex에서도 사용할 수 있어야 한다. 확인 결과 Codex도 플러그인과 스킬, subagent 및 project custom agent를 지원하지만, 플러그인의 구성요소와 agent 배포 방식은 Claude Code와 같지 않다. 특히 Codex 플러그인은 `.codex-plugin/plugin.json`을 진입점으로 사용하며 Claude Code의 plugin agent인 `agents/*.md`를 대응 구성요소로 배포하지 않는다.

각 런타임에 별도 Loom을 만들면 shape·plan·task·review·calibrate의 의미와 변경 이력이 갈라진다. Loom의 핵심은 특정 에이전트 제품이 아니라 요구사항을 설계와 실행으로 구체화하는 공통 워크플로이므로, 실행 의미는 하나로 유지하면서 배포 표면만 런타임에 맞춰야 한다.

## 결정

Loom을 Claude Code와 Codex를 모두 일급 지원하는 하나의 플러그인으로 제공한다.

- shape·plan·task·review·calibrate의 의미와 스킬 본문은 하나의 공통 소스를 유지한다.
- Claude Code와 Codex의 manifest 및 marketplace처럼 런타임이 요구하는 배포 표면은 각각 제공할 수 있다.
- 저장소 루트 자체를 실제 공통 플러그인으로 유지한다. marketplace 원본은 Codex의 표준 위치인 `.agents/plugins/marketplace.json`에 두며, Claude Code의 고정 탐색 위치인 `.claude-plugin/marketplace.json`은 이 원본을 가리키는 저장소 내부 상대 심링크로 제공한다.
- 두 런타임이 하나의 marketplace 원본을 읽을 수 있도록 marketplace 항목은 양쪽이 공통 지원하는 문자열 상대 `source: "./"`를 사용하고, 각 런타임의 필수 메타데이터를 함께 포함한다.
- 핵심 워크플로는 한 런타임만의 plugin agent 자동 발견에 의존하지 않는다. 두 런타임이 공통으로 제공하는 스킬 실행, 프로젝트 파일 접근, 명령 실행을 기반으로 구성한다.
- 런타임별 기능 차이가 생기면 공통 워크플로의 의미를 갈라 복제하지 않고, 필요한 최소 어댑터나 실행 안내로 경계에 한정한다.
- 기존 Claude Code 지원은 유지하며 Codex 지원을 추가한다. Codex 전환을 이유로 Claude Code 사용자를 다른 구현으로 분리하지 않는다.

### 전제 조건

- 스킬이 두 런타임의 공통 확장 단위다: Loom의 다섯 워크플로를 동일한 `SKILL.md` 의미로 제공할 수 있다.
- 플러그인 배포 형식과 워크플로 의미를 분리할 수 있다: manifest가 달라도 같은 스킬과 프로젝트 문서를 배포할 수 있다.
- aeira CLI를 두 런타임에서 호출할 수 있다: Loom의 필수 문서 탐색 인프라를 런타임과 무관하게 유지할 수 있다.

### 제약 조건

- Claude Code와 Codex의 플러그인 구성요소가 완전히 같지 않다.
  - 제약이 없었다면: 하나의 manifest와 자동 발견 규칙만으로 배포했을 것이나, 실제로는 런타임별 진입점과 marketplace 메타데이터가 필요하다.
- marketplace의 표준 탐색 위치가 런타임마다 다르다.
  - 제약이 없었다면: 중립적인 단일 경로만 제공했을 것이나, Claude Code가 `.claude-plugin/marketplace.json`을 요구하므로 `.agents/plugins/marketplace.json` 원본에 대한 상대 심링크를 함께 유지한다.
- 공통 워크플로는 어느 한 런타임에만 있는 편의 기능을 필수 전제로 삼을 수 없다.
  - 제약이 없었다면: 각 런타임의 전용 기능을 자유롭게 사용했을 것이나, 그러면 Loom의 실행 의미나 설치 결과가 런타임에 따라 갈라진다.

## 대안

### Claude Code 전용 플러그인으로 유지

- 설명: 현재 구조와 plugin agent를 그대로 유지하고 Codex를 지원하지 않는다.
- 트레이드오프: Loom을 Codex에서도 사용하려는 목표를 달성하지 못하며, 워크플로 자체는 이식 가능함에도 배포 형식 차이 때문에 사용 범위를 제한한다.

### Claude Code용과 Codex용 Loom을 별도 구현으로 분기

- 설명: 런타임마다 스킬과 문서, 배포 저장소를 따로 유지한다.
- 트레이드오프: 동일한 설계 워크플로가 두 구현에서 독립적으로 진화하여 의미와 결정 이력이 어긋날 수 있고, 모든 변경의 동기화 비용이 지속된다.

### Codex 플러그인으로 완전히 전환

- 설명: Claude Code 형식을 제거하고 Codex만 지원한다.
- 트레이드오프: 기존 Claude Code 사용 경로를 불필요하게 폐기한다. 추가 지원이라는 목표보다 범위가 넓다.

## 영향

- 플러그인 배포 - Claude Code와 Codex 각각의 manifest 및 marketplace 진입점을 제공해야 한다.
- skills - 다섯 스킬의 의미를 공통으로 유지하고 런타임 전용 agent 의존을 제거해야 한다.
- README - 설치와 실행 안내를 Claude Code와 Codex 양쪽으로 확장해야 한다.
- [[0026-aeira-as-required-infrastructure]] - aeira를 런타임 공통의 필수 탐색 인프라로 유지한다.
- [[0055-skill-template-reference-relative-path]] - 특정 Claude Code 환경변수 대신 플러그인 내부 상대 위치를 사용하는 방향은 유지하되 두 런타임에서 경로 해석을 검증해야 한다.
