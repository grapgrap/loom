# 템플릿을 스킬 내부가 아닌 별도 디렉토리에 둔다

## 맥락

concept, decision, plan 템플릿이 각 스킬의 references/ 디렉토리에 분산되어 있었다.
principle 템플릿 추가 시점에 구조를 재검토했다.

## 결정

루트에 `templates/` 디렉토리를 만들고 모든 템플릿을 한 곳에 모은다. 파일명에서 `-template` 접미사도 제거한다.

### 제약 조건

- 템플릿은 여러 스킬에서 공유된다: review에서 principle 템플릿을, shape에서 concept 템플릿을 각각 참조한다

### 전제 조건

- 템플릿의 성격이 동일하다: 모두 loom 문서의 구조를 정의하는 파일이므로 한 곳에 모으는 것이 자연스럽다

## 대안

### 각 스킬의 references/ 디렉토리에 유지

- 설명: 스킬별로 캡슐화하여 각 스킬이 자신의 템플릿을 관리한다
- 트레이드오프: 같은 성격의 파일이 여러 곳에 흩어져 관리가 어렵다. review에서 principle 템플릿을 참조할 때 shape의 references/를 읽어야 하는 등 의존 방향이 꼬인다

## 영향

- [[concept]] - 템플릿 경로가 templates/concept.md로 변경
- [[decision]] - 템플릿 경로가 templates/decision.md로 변경
