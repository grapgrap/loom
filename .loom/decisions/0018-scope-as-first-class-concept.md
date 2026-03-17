# Scope를 범용 개념으로 도입

## 맥락

user-level principles 기능을 설계하면서, `.loom/` 디렉토리가 여러 위치에 존재할 수 있다는 필요성이 드러났다. 단순히 user/project 이분법이 아니라, 모노레포에서 하위 패키지별 `.loom/`이 있을 수 있으며 중첩도 가능하다.

## 결정

scope를 principle의 속성이 아닌, loom 시스템의 독립된 concept으로 정의한다.

- 사용자 발화의 맥락에서 작업 대상 스코프를 식별 + 상위 병합 + `~/.claude/.loom/` base 구조
- 가장 가까운 스코프가 이긴다 (cwd가 아닌 작업 대상 기준)
- principle만 user와 project scope를 관통, 나머지는 project scope에서만 존재

### 제약 조건

- 모노레포 환경에서 패키지별로 독립된 도메인 엔티티와 원칙이 필요하다

### 전제 조건

- `~/.claude/`는 Claude Code가 이미 의존하는 경로이므로 유효하다
- 디렉토리 구조가 곧 스코프 구조이므로, 별도의 설정 파일이 필요 없다

## 대안

### Scope를 principle의 속성으로 한정

- 설명: principle concept에만 user/project 구분을 추가
- 트레이드오프: 모노레포의 sub-project 중첩을 표현할 수 없고, 향후 다른 엔티티에 스코프가 필요하면 재설계 필요

## 영향

- [[scope]] - 신규 concept 생성
- [[principle]] - scope 관계 추가 필요
- [[index]] - scope를 엔티티 목록에 추가, 관계도 갱신 필요
