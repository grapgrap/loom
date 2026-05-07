# auto memory 참조를 제거하고 미성숙 원칙 단계를 폐기한다

## 맥락

이번 흐름의 처음 입력은 "auto memory를 미성숙 원칙 저장소로 사용 중인데 더 낫게 만들고 싶다"였다. 흐름이 진행되면서 다음이 정리됐다:

- 협업 운용은 loom 외부(`~/.claude/rules/`)로 분리
- 원칙·룰·컨벤션 분화 (각자 다른 무게감과 진입 기준)
- user scope 자동 참조 제거
- scope concept 폐기

이 정리 후 auto memory의 자리를 다시 보면, "미성숙 원칙 후보의 임시 저장소"라는 위상만 남는다. 그러나 Claude Code의 auto memory는 user/feedback/project/reference 4유형으로 정의되어 있어 loom의 의도(미성숙 원칙 저장소)와 정합하지 않는다. 또 자동 증류 흐름은 사용자가 직접 식별하는 명시적 합의보다 신뢰도가 낮다.

## 결정

스킬에서 auto memory 참조를 모두 제거한다. 미성숙 원칙 단계 자체를 폐기한다.

새 원칙·룰·컨벤션은 사용자와의 명시적 합의를 통해 직접 추가된다. 추가의 시점은 shape, review, calibrate 어느 단계든 가능하며, 자동 증류 메커니즘은 두지 않는다.

review의 reflect는 concept/decision 보완과 원칙 유효성 검증에 집중한다. calibrate는 기존 원칙 검증과 누적 감사에 집중하며, 새 원칙·룰·컨벤션 발견 시 사용자 합의를 거쳐 직접 추가한다.

### 전제 조건

- 사용자가 새 원칙·룰·컨벤션을 직접 식별할 의지가 있다: 자동 메커니즘 없이도 패턴 인식이 가능하다
- review/calibrate는 자동 증류 없이도 의미 있는 역할을 수행한다: 검증, 보완, 누적 감사가 핵심 역할이다

## 대안

### auto memory 사용 유지

- 설명: review에서 auto memory에 기록하고 calibrate에서 증류하는 흐름 유지
- 트레이드오프: Claude Code의 auto memory 정체성(user/feedback/project/reference)과 loom의 의도(미성숙 원칙 저장소)가 정합하지 않는다. 자동 메커니즘이 사용자의 명시적 식별보다 신뢰도가 낮다.

### 별도 미성숙 저장소 도입

- 설명: auto memory 외에 미성숙 원칙 후보 전용 저장소를 도입
- 트레이드오프: 새 메커니즘 도입 비용. 사용자가 처음 의도한 단순화 방향과 어긋난다.

## 영향

- [[review]] - reflect의 auto memory 기록 단계 제거, Summary의 Memory 항목 제거
- [[calibrate]] - 원칙·룰·컨벤션 증류 섹션과 Auto memory 정제 섹션 제거, Summary 갱신
