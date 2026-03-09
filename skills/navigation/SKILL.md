---
name: navigation
description: >-
  에이전트가 .loom 문서를 탐색할 때 참조하는 내부 스킬. 사용자가 직접 호출하지 않는다.
  다른 스킬의 컨텍스트 로드 단계에서 문서 간 관계 탐색, 검색, 건강 점검을 수행할 때 사용한다.
---

# Navigation

.loom 문서를 효율적으로 탐색하기 위한 도구 사용 안내.

**이 스킬은 사용자가 직접 호출하지 않는다.** 다른 스킬의 컨텍스트 로드에서 참조한다.

## 도구 설정

프로젝트의 auto memory에서 `navigation tool` 설정을 확인한다.

- 설정이 있으면 → 해당 도구를 사용한다.
- 설정이 없으면 → 초기 설정을 수행한다.

### 초기 설정

1. 사용 가능한 도구를 감지한다:
   - `qmd status` 실행 → qmd 가용 여부
   - `obsidian version` 실행 → Obsidian CLI 가용 여부

2. 감지 결과와 각 도구의 특성을 사용자에게 안내한다:

   ```
   ## 문서 탐색 도구 감지 결과
   - qmd: [감지됨/미감지] — 키워드·의미 검색, 독립 실행, MCP 통합
   - Obsidian CLI: [감지됨/미감지] — 위키링크 구조 탐색(links, backlinks, orphans), 앱 실행 필요
   - grep: 항상 가용 — 기본 폴백

   어떤 도구를 사용할까요?
   ```

3. 사용자가 선택하면 auto memory에 저장한다.

## 도구별 명령어

### qmd

컬렉션이 등록되어 있어야 한다 (`qmd collection add .loom`).

| 작업 | 명령어 |
|---|---|
| 백링크 | `qmd search '[[name]]' --files` |
| 정방향 링크 | `qmd get <file>` 후 `[[...]]` 패턴 추출 |
| 키워드 검색 | `qmd search '<query>' --files` |
| 의미 검색 | `qmd query '<query>' --files` |
| 문서 조회 | `qmd get <file>` |
| 일괄 조회 | `qmd multi-get '<glob>'` |

### Obsidian CLI

vault가 등록되어 있어야 한다. vault 이름은 auto memory의 설정을 참조한다.

| 작업 | 명령어 |
|---|---|
| 백링크 | `obsidian backlinks file="<name>" vault="<vault>" format=json` |
| 정방향 링크 | `obsidian links file="<name>" vault="<vault>"` |
| 키워드 검색 | `obsidian search query="<query>" vault="<vault>" format=json` |
| 고립 문서 | `obsidian orphans vault="<vault>"` |
| 깨진 링크 | `obsidian unresolved vault="<vault>"` |
| 막다른 문서 | `obsidian deadends vault="<vault>"` |
| 문서 조회 | `obsidian read file="<name>" vault="<vault>"` |

### grep (폴백)

도구가 설정되지 않았거나 실행에 실패할 때 사용한다.

| 작업 | 방법 |
|---|---|
| 백링크 | Grep 도구로 `\[\[name\]\]` 패턴 검색 |
| 정방향 링크 | Read 도구로 파일을 읽고 `[[...]]` 패턴 추출 |
| 키워드 검색 | Grep 도구로 검색 |

## 사용 원칙

- 파일 목록만 필요할 때는 `--files` 또는 `format=json`을 사용하여 토큰을 절약한다.
- 문서 내용이 필요할 때만 문서를 조회한다.
- 도구 실행이 실패하면 grep으로 폴백하되, 사용자에게 알린다.
