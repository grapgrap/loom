# project scope의 `.loom/principles/` 폴더를 `.loom/rules/`로 재명한다

## 맥락

0041에서 principle 엔티티가 project scope에서 폐기되었고, 0042에서 rule/convention이 강제성 축의 양극으로 재정의되었다. `.loom/principles/` 폴더에는 더 이상 principle이 보관되지 않으므로, 폴더명과 내용이 불일치한다.

0037에서 폴더명 `.loom/principles/`를 "셋의 대표 어휘"로 작동시켰지만, 셋이 둘(rule·convention)로 축소된 지금, 더 무거운 자리인 rule이 새로운 대표 어휘가 된다. 광의의 "rules"는 convention도 포섭할 수 있는 자연스러운 어휘다.

project scope에 아직 데이터가 없는 시점(0017에서 인덱스 생성을 미뤘음)이므로 변경 비용이 가장 적다.

## 결정

project scope의 폴더명을 `.loom/principles/`에서 `.loom/rules/`로 변경한다.

- 모든 스킬(shape, plan, task, review, calibrate)의 Step 0에서 자동 로드 경로를 `.loom/rules/index.md`로 갱신한다
- user scope의 `.loom/principles/` 폴더는 변경하지 않는다 — 사용자의 자산이며, 0038의 자동 참조 제거 결정에 따라 명시적 호출 시에만 사용된다. project scope와 user scope의 폴더명이 다른 것은 허용된다

`rules/` 폴더는 광의의 규칙 보관 장소로서, rule과 convention 모두를 보관한다.

### 전제 조건

- project scope에 데이터가 아직 없다: 0017에서 인덱스 생성을 미뤘기 때문에 변경 비용이 적다
- user scope의 폴더는 사용자의 자산이며 별개로 다룬다: 양쪽이 같은 이름이어야 한다는 제약이 없다

## 대안

### `.loom/principles/` 폴더명 유지

- 설명: 하위 호환성을 위해 폴더명을 유지하고, 내용은 rule·convention만 보관
- 트레이드오프: 폴더명과 내용이 불일치한다. project scope에 데이터가 없는 지금이 변경 비용이 가장 적은 시점인데, 그 기회를 놓치면 이후 데이터가 쌓인 뒤 변경이 어려워진다

## 영향

- [[index]] - 도메인 엔티티 인덱스의 폴더 경로 표기 갱신
- [[rule]] - 보관 폴더 경로 갱신
- [[convention]] - 보관 폴더 경로 갱신
- 모든 스킬(shape, plan, task, review, calibrate)의 Step 0 자동 로드 경로 갱신
