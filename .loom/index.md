# Index

프로젝트의 도메인 엔티티와 그 관계를 기술하는 지도.

## 목록

- [[index]] — 디렉토리의 진입점, 항목과 관계를 요약하는 탐색 지도
- [[concept]] — 프로젝트의 도메인 엔티티를 정의하는 영속 문서
- [[decision]] — 컨셉 변경의 결정 맥락을 기록하는 횡단 문서
- [[plan]] — 설계를 실행 가능한 태스크로 구조화한 문서
- [[principle]] — 반복된 경험에서 체득한, 판단의 근거가 되는 믿음
- [[scope]] — `.loom/` 계층 구조를 통한 엔티티의 적용 범위 해소 체계

## 관계

```
scope ──적용 범위──→ principle (user + project)
  │                   ↓ 판단 근거
  ├──적용 범위──→ concept (project)
  │                   ↕ 변경 맥락
  ├──적용 범위──→ decision (project)
  │                   ↓ 설계 의도
  └──적용 범위──→ plan (project)
                concept ──범위 한정──→ plan
```

- **scope**가 엔티티의 적용 범위를 결정한다. 사용자의 발화 맥락에서 작업 대상 스코프를 식별하며, 가장 가까운 스코프가 이긴다.
- **concept**이 중심이다. 프로젝트가 다루는 세계의 구성 요소를 정의한다.
- **decision**이 concept의 변경을 횡단적으로 기록한다. 여러 concept에 걸칠 수 있다.
- **plan**이 concept과 decision을 참조하여 실행 단위를 구성한다.
- **principle**이 판단의 근거가 되는 공유된 믿음이다. user와 project scope를 관통하는 유일한 엔티티다.
