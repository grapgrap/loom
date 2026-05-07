# scope concept을 폐기한다

## 맥락

scope concept은 여러 `.loom/` 계층에서 엔티티 간 우선순위를 결정하는 체계로 정의되었다. 핵심 동작은 user → project 자동 병합과 가장 가까운 scope 우선의 해소 규칙이었다.

user scope 자동 참조를 제거하기로 결정하면서, scope concept의 핵심 동작 대부분이 무효화되었다. 남는 내용은 user/project의 단순 위치 구분뿐이며, 이는 별도 도메인 엔티티로 둘 정도의 의미를 가지지 않는다.

또한 concept concept의 원칙 — "도메인 엔티티가 아닌 것은 concept으로 정의하지 않는다" — 와 충돌한다. scope가 단순 시스템 위치 정보가 되면 도메인 엔티티 자격을 잃는다.

## 결정

scope concept을 폐기한다. `.loom/concepts/scope.md` 파일 삭제, `.loom/index.md`에서 제거, 다른 concept의 `[[scope]]` 참조 정리.

"user scope", "project scope" 어휘 자체는 시스템 위치 표현으로 사용 가능하지만, 도메인 엔티티가 아닌 단순 어휘로 환원된다.

### 전제 조건

- user scope 자동 참조 제거가 적용된다: 그렇지 않으면 scope concept의 핵심 동작이 여전히 의미를 가진다
- 단순 위치 구분은 별도 문서로 정의할 정도가 아니다: `.loom/`의 위치(`~/.claude/`냐 프로젝트 디렉토리냐)는 시스템 측면의 자명한 사실이다

## 대안

### scope concept 축소 유지

- 설명: scope concept을 폐기하지 않고, 자동 참조 메커니즘이 빠진 축소된 형태(단순 위치 구분)로 유지
- 트레이드오프: 도메인 엔티티 자격이 약한 채로 concept을 유지하는 것은 concept concept의 원칙에 어긋남. 별도 문서로 둘 정당성이 부족하다.

### scope를 메타 개념으로 보존

- 설명: scope를 도메인 엔티티가 아닌 메타 정보로 다른 자리(예: README, 가이드 문서)에 보존
- 트레이드오프: 자동 참조 메커니즘이 사라진 후에는 메타 정보로의 가치도 약하다. 단순 시스템 위치는 자명한 사실이라 별도 메타 문서가 필요하지 않다.

## 영향

- [[index]] - scope 항목 제거, 관계도 재구성
- [[principle]] - `[[scope]]` 참조 정리, 본문에서 scope 언급 갱신
- [[rule]] - `[[scope]]` 참조 정리
- [[convention]] - `[[scope]]` 참조 정리
