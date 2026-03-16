# Principles 인덱스 생성을 첫 원칙 증류 시점으로 지연

## 맥락

프로젝트 셋업 시 `.loom/principles/index.md`가 빈 상태로 생성되고 있었다.
아직 principle을 정의한 경험이 없는 상태에서 구조가 먼저 존재하는 것이 문제였다.
principle은 반복된 경험에서 증류되는 것인데, 경험이 축적되기 전에 빈 인덱스가 자리를 차지하는 것은 시점이 맞지 않았다.

## 결정

`.loom/principles/` 디렉토리와 `index.md`를 초기 구조에서 제거한다.
calibrate의 증류 단계에서 첫 번째 principle이 승인될 때 디렉토리와 인덱스를 함께 생성한다.
principles/index.md를 참조하는 스킬들(shape, review, calibrate)은 파일 존재 여부를 먼저 확인한다.

### 제약 조건

- principle의 concept 정체성과 생명주기는 변경하지 않는다: 저장 위치와 역할은 그대로이며, 생성 시점만 지연한다

### 전제 조건

- 원칙이 없는 프로젝트에서 스킬이 정상 동작한다: principles/index.md가 없어도 shape, review, calibrate가 원칙 로드 단계를 건너뛸 수 있다

## 대안

### principle을 auto memory로 완전히 이동

- 설명: principle을 `.loom/` 밖으로 꺼내어 auto memory에만 저장한다
- 트레이드오프: principle이 loom 도메인 엔티티에서 빠지게 되어, 기존 관계 구조(principle → concept, decision)가 깨진다. 아직 principle 운용 경험이 부족한 상태에서 과도한 변경이다

## 영향

- [[principle]] - 생성 시점이 프로젝트 셋업에서 첫 증류 시점으로 변경
