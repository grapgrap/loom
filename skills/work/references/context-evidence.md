# 증거와 정정 계약

에이전트는 무엇을 기록하고 지금 적용할지 판단한다. CLI는 원본·출처·범위와 명시된 관계를 저장하고, 정확한 참조와 동시 변경을 검사한다. 아래 명령에는 [작업 맥락](context.md)의 CLI 경로·cwd·데이터 루트를 사용한다. JSON은 stdin으로 전달한다.

## 근거를 포착한다

`evidence append`의 예:

```json
{
  "requestKey": "capture-retry-1",
  "id": "retry",
  "scope": { "type": "work", "id": "storage" },
  "kind": "decision",
  "standing": "adopted",
  "text": "저장 요청 재시도에는 같은 요청키와 입력을 사용한다.",
  "applies": {
    "target": "context CLI",
    "targetVersion": "검증한 대상 버전",
    "conditions": ["같은 프로젝트와 컴포넌트"],
    "lifetime": "명시적으로 정정할 때까지"
  },
  "source": { "type": "user", "reference": "설계 합의의 실제 발언 위치" },
  "capture": "direct"
}
```

`id`를 생략하면 생성한다. 같은 ID의 후속 기록은 새 리비전이며, 원문은 불변이다. 새 리비전이라는 이유로 이전 의미를 자동 대체하지 않는다. `kind`는 decision·correction·proposal·inference·observation, `standing`은 proposed·adopted·unresolved·observed다. 같은 프로젝트라도 적용 대상과 조건은 `applies`에 따로 보존한다. 관찰의 적용 버전은 `applies.targetVersion`에 넣는다. 최상위 `targetVersion`은 거부한다. `locator.version`은 찾아갈 외부 원문의 버전이고, `access.observedVersion`은 실제 읽은 원문의 버전이다. 적용 대상과 원문이 다르면 세 값을 같은 값으로 합성하지 않는다.

`source.type`은 이번 기록을 직접 뒷받침하는 출처다. 사용자 발언을 직접 읽었으면 `source.type: user`, `capture: direct`로 기록한다. 다른 에이전트가 사용자 발언이라고 전달한 내용을 기록할 때는 `source.type: agent`, `capture: reported`로 두고 source.reference에 실제 전달자와 전달 위치, 인용된 원래 발언을 함께 남긴다. 추론도 `source.type: agent`, `capture: inferred`를 사용한다. reported 또는 inferred와 user 출처를 조합하면 CLI가 거부한다. 전달된 발언의 원래 화자와 직접 확인한 출처를 혼동하지 않는다.

`capture`는 direct·reported·inferred다. `locator`에는 외부 위치 reference와 선택적인 version·extent를 적는다. 실제 접근 상태인 `access`는 생략 시 not-attempted이며 다음 중 하나다.

- `{"status":"read","resolvedLocator":"실제 읽은 위치","observedVersion":"버전","capturedExtent":"읽은 범위"}`
- `{"status":"unavailable","reason":"접근 실패 이유"}`
- `{"status":"not-attempted"}`

원문을 확인하지 않았다면 read로 기록하지 않는다. `reason`은 해석 이유다. 부분 정정할 문장은 `units:[{"id":"retry-rule","start":0,"end":12}]`처럼 본문의 UTF-16 인덱스 반열린 구간으로 이름 붙일 수 있다. 범위를 실제 본문과 대조한다.

## 채택과 정정을 연결한다

먼저 `evidence check`에 `{"seeds":["evidence:retry@1"]}`를 보내 원문과 연결된 관계 및 `basis`를 읽는다. `evidence correct`에는 append와 같은 필드에 다음 두 필드를 더한다.

```json
{
  "basis": "check가 반환한 opaque 문자열",
  "relation": {
    "type": "replaces",
    "target": "evidence:retry@1",
    "applies": {
      "target": "context CLI",
      "conditions": ["같은 프로젝트와 컴포넌트"],
      "lifetime": "명시적으로 정정할 때까지"
    }
  }
}
```

relation.type은 replaces·withdraws·adopts다. 대상은 실제 evidence 원본이어야 한다. 부분 정정은 relation.selector에 `{"unit":"retry-rule"}` 또는 `{"start":0,"end":12}`를 지정한다. 부분 정정의 basis는 같은 selector를 가진 seed로 check한 결과를 쓴다. relation.applies는 이번 변경의 적용 범위다. 범위가 다르면 전체 철회로 해석하지 않는다.

제안 상태의 정정은 기존 결정을 바꾸지 않는다. 채택하려면 adopts 관계를 가진 새 기록을 명시한다. 대체한 판단을 나중에 철회해도 그 이전 제한을 자동 부활시키지 않는다. 같은 영역의 다른 조건은 `conflicts`·부분 standing과 원문을 읽어 에이전트가 판단한다. 과거 note를 바꾸려면 원문을 실제 읽고 새로운 evidence로 출처·해석·조건을 명시적으로 포착한 뒤 관계를 연결한다.

## 조회 범위와 결과를 해석한다

`evidence check`의 seeds에는 ref 또는 `{ref,selector}`를 넣는다. `at`은 current 또는 저장 위치, `budget`은 최대 원본 수다. 반환한 coverage·gaps를 확인하고 partial을 변경 없음으로 취급하지 않는다. 연결된 정정은 검색어, Top N, 업무 필터에 가려지지 않는다. `basis`를 다음 호출에 넘기면 change가 changed·unchanged·unknown으로 반환된다. 이것은 의미의 진위를 검증하는 서비스가 아니다.

`discover`는 독립된 새 기록과 정리된 표현도 검색한다. `context prepare`는 이 발견 기준과 정정 기준을 함께 반환한다. 정정 연결만 확인하면 아직 연결되지 않은 새 관찰을 놓칠 수 있으므로 둘을 따로 유지한다.

## 재시도와 부분 성공을 복구한다

요청키는 프로젝트·컴포넌트별로 유일하게 정한다. 성공은 applied, 현재 근거가 달라졌으면 conflict, 입력·키 재사용 오류는 rejected다. failed는 미반영을 확인한 실패, outcome-unknown은 저장 후 응답·정리 실패 등으로 반영 여부를 확정하지 못한 결과다. CLI 오류는 stderr에 원인과 가능한 outcome을 표시하고 비정상 종료한다.

응답을 잃었으면 `evidence result --key <requestKey>` 또는 같은 입력의 재시도로 최초 ref를 회수한다. 최신 판단은 별도 조회한다. conflict에서는 새 원문·basis를 읽고 판단을 다시 작성한다. 같은 키에 새 입력을 넣지 않는다. 여러 명령은 하나의 트랜잭션이 아니므로 일부만 성공하면 확인한 성공을 유지하고 나머지만 복구한다.
