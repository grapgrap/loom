# User-Level Principles 도입

## 맥락

scope concept이 정의된 후, 첫 번째 적용으로 user-level principles를 도입한다. 개발자에게는 프로젝트에 종속되지 않는 개인 설계 원칙이 있으며, 이것은 프로젝트를 넘어 일관되게 적용되어야 한다.

## 결정

`~/.claude/.loom/principles/`에 user-level principles를 저장하고, 스킬의 Step 0에서 scope 해소를 통해 로드한다.

- 저장의 기본값은 user scope — principle은 개인의 체득된 믿음이므로 프로젝트에 종속되지 않는다
- 로드 시 scope 해소: user → project 순으로 병합 (project는 중첩 가능), 가까운 scope가 이긴다
- 충돌 해소는 에이전트가 내용을 이해하고 판단한다 (메타데이터 매칭 없음)
- calibrate의 증류 시 기본 저장 대상은 user scope

### 제약 조건

- `.loom/` 구조가 양쪽에서 동일해야 멘탈 모델이 일관적이다
- loom 플러그인이 `~/.claude/`에 설치되므로, `~/.claude/.loom/`은 추가 경로 가정 없이 사용 가능하다

### 전제 조건

- scope concept이 정의되어 있다 (0018)
- `~/.claude/`는 Claude Code가 이미 의존하는 경로이다

## 대안

### 저장 기본값을 project scope로

- 설명: calibrate 증류 시 기본적으로 project에 저장
- 트레이드오프: principle의 정체성("개인의 체득된 믿음")과 맞지 않음. 프로젝트마다 같은 원칙을 반복 저장하게 됨

## 영향

- [[principle]] - scope 동작 기술 추가 필요
- [[scope]] - 첫 번째 구체적 적용 사례
