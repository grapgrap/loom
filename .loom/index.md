# Index

프로젝트의 도메인 엔티티와 그 관계를 기술하는 지도.

## 목록

- [[index]] — 디렉토리의 진입점, 항목과 관계를 요약하는 탐색 지도
- [[concept]] — 프로젝트의 도메인 엔티티를 정의하는 영속 문서
- [[decision]] — 컨셉이나 구현의 결정 맥락을 기록하는 횡단 문서
- [[plan]] — 설계를 실행 가능한 태스크로 구조화한 문서
- [[rule]] — 항상 지켜져야 하는 강제적 합의
- [[convention]] — 강하게 권장되지만 대체 가능한 형태

## 관계

```
concept ──변경 맥락──↕ decision
   ↓ 설계 의도 / 범위 한정
   plan
        ↑ 자동 참조
   rule · convention
```

- **concept**이 중심이다. 프로젝트가 다루는 세계의 구성 요소(기능 제약)를 정의한다.
- **decision**이 concept의 변경을 횡단적으로 기록한다. 여러 concept에 걸칠 수 있다.
- **plan**이 concept과 decision을 참조하여 실행 단위를 구성한다. concept이 plan의 범위를 한정한다.
- **rule·convention**은 plan(과 plan에서 파생된 task)이 자동 참조하는 합의 잔고다. 강제성 축에서 rule이 무거운 자리, convention이 가벼운 자리이며, `.loom/rules/` 폴더에 보관된다.
- 누적된 decision이 새 rule·convention의 판단 기준 역할을 한다. 별도의 "원칙" 엔티티는 두지 않으며, 깊은 판단 근거는 사용자 본인의 영역에 머문다.
