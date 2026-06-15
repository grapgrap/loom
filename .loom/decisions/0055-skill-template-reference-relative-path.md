# 스킬의 템플릿 참조를 SKILL.md 기준 상대경로로 표기한다

## 맥락

템플릿은 플러그인 루트의 `templates/`에 모여 있고(0004), 스킬은 `skills/{name}/SKILL.md`에 위치한다. 그동안 스킬에서 템플릿을 `templates/concept.md`처럼 참조해 왔는데, 이 표기는 기준점이 모호하다.

스킬 실행 시 베이스 디렉토리는 SKILL.md가 있는 `skills/{name}/`이다. 따라서 에이전트가 `templates/concept.md`를 베이스 기준으로 해석하면 `skills/{name}/templates/concept.md`를 찾게 되어 실제 위치(`templates/concept.md`)와 어긋난다. 그 결과 에이전트가 템플릿 탐색에 종종 실패했다.

0004는 템플릿을 "어디 둘지"(루트 `templates/`로 통합)만 정했고 스킬이 "어떻게 참조할지"는 정하지 않았다. 이 빈틈을 메운다.

## 결정

스킬에서 템플릿을 참조할 때 SKILL.md 위치(베이스 디렉토리 `skills/{name}/`) 기준 상대경로 `../../templates/{name}.md`로 표기한다.

적용 위치: shape(concept·flow·decision 템플릿), plan(plan 템플릿), task(decision 템플릿).

### 전제 조건

- loom은 Claude Code 플러그인이고 `skills/`와 `templates/`가 플러그인 루트에 함께 배포된다: 따라서 `skills/{name}/`과 `templates/`의 상대 위치(`../../templates/`)가 어느 설치 환경에서나 보존된다.
- 스킬의 베이스 디렉토리는 SKILL.md가 놓인 `skills/{name}/`이다: 상대경로의 기준점이 SKILL.md 위치로 고정되므로 cwd나 호출 프로젝트에 의존하지 않는다.

### 제약 조건

- 상대경로 기준점이 SKILL.md 위치에 묶인다
  - 제약이 없었다면: 스킬 디렉토리 깊이를 바꾸면 `../../`도 함께 조정해야 한다. 현재의 평탄한 `skills/{name}/` 구조가 유지되는 한 문제되지 않는다.

## 대안

### 모호한 루트 기준 경로 유지 (`templates/X.md`)

- 설명: cwd가 프로젝트 루트라고 가정하고 루트 기준 경로로 참조한다.
- 트레이드오프: 베이스 디렉토리가 `skills/{name}/`이라 에이전트가 기준점을 혼동해 탐색에 자주 실패한다. 다른 프로젝트에서 스킬을 호출하면 cwd가 그 프로젝트라 더욱 빗나간다. 이 실패가 변경의 동기였다.

### 플러그인 루트 변수 (`${CLAUDE_PLUGIN_ROOT}/templates/X.md`)

- 설명: Claude Code 플러그인 루트 환경변수로 절대 참조한다.
- 트레이드오프: SKILL.md 본문은 에이전트에게 주입되는 텍스트인데, 본문에서 이 변수가 실제로 치환되는지 보장이 불확실하다. 상대경로는 변수 치환에 의존하지 않아 확실하다.

## 영향

- [[0004-templates-as-separate-directory]] - 템플릿 위치를 루트 `templates/`로 정한 결정(0004)이 남긴 "참조 표기 방식"의 빈틈을 보완한다.
