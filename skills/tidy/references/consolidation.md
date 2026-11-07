# 정리 결과의 반영 계약

tidy apply에는 읽은 정확한 집합과 파생 기억의 변경분을 전달한다. 의미상 채택과 철회는 evidence, 업무 상태는 work가 소유한다. 기존 graph, works와 absorb는 `legacy: true`를 명시한 호환 입력에서만 허용한다. managed 업무 상태는 [업무 CLI](../../work/references/context-work.md)가 소유한다. CLI는 입력 값의 제약, 근거의 존재와 동시 갱신을 검사한다. 근거가 주장을 뒷받침하는지는 에이전트가 판단한다.

## 준비

로드한 `tidy/SKILL.md`가 있는 폴더를 기준으로 `../../scripts/context/`의 절대 경로를 구한다. `<plugin-root>`는 그 플러그인의 루트이고, `<checkout>`은 현재 저장소의 체크아웃 또는 워크트리 경로다. 예시의 경로를 실제 값으로 바꾸고 인용한다. 첫 실행과 저장 권한은 [작업 맥락](../../work/references/context.md)의 절차를 따른다.

```sh
node "<plugin-root>/scripts/context/cli.ts" tidy prepare --cwd "<checkout>" --work "<work-id>" --limit 20
```

- `snapshot`: 반영할 준비 결과의 ID다. 검토할 항목이 없거나 동일 입력, 목적의 검토 결과가 있으면 null이다. reviewed가 true이면 이전 결과를 재사용한다.
- `batch`: 이번 검토 대상의 정확한 ref 집합이다. 현재 기억은 current:<id>로 표시한다.
- `basis`, `dependencies`: 선택한 원본과 현재 기억에 연결된 정정의 확인 기준과 원문, 관계와 공백이다.
- `purpose`: 검토 목적이다. 기본 resume이며 --purpose로 지정한다.
- `records`: 이번 묶음에서 모두 검토할 원본이다. remember, checkpoint와 work의 이전 리비전도 포함한다.
- `current`: 보존하거나 갱신할 현재 기억과 업무 상태다. `current.memories`에는 기존 remember 기억도 원본 ref와 함께 포함하지만 새 판단으로 자동 승격하지 않는다.
- `current.retired`: 이미 현재 기억에서 제외한 항목의 ID, 범위와 제외 이유다. 과거 원본을 찾았다는 이유만으로 다시 활성화하지 않는다.
- `current.graph`: `--full`일 때 반환하는 기존 대상과 진술이다. 대체되거나 제외된 진술도 보존하므로 상태를 확인한다.
- `current.managedWorks`: 선택한 범위의 업무 CLI 현재 상태이며 읽기 전용이다. managedWorksRemaining으로 다음 페이지를 확인한다. current.works는 기존 업무 요약만 포함한다.
- `remaining`: 묶음 밖에 남은 미처리 원본 수다.

`--limit`은 `records`와 `current`의 기억, 업무와 제외 목록 각각에 적용한다. `current.memoriesRemaining`, `worksRemaining`, `retiredRemaining`으로 남은 항목을 확인한다. offset은 `current`의 목록에만 적용하며 미처리 원본을 건너뛰지 않는다. 각 페이지는 prepare로 고정한 batch 전체를 읽고 그 snapshot으로 apply한 뒤 다음 페이지를 준비한다. 서로 다른 페이지의 reviewed를 합쳐 마지막 snapshot에 보내지 않는다. 미처리 원본이 남으면 새 묶음을 계속 읽고, 현재 기억의 다음 페이지는 반영 뒤 목록을 확인하여 limit과 offset으로 선택한다. 기억을 추가하거나 제외해 목록이 바뀌면 미검토 ID를 기준으로 다음 범위를 다시 고른다. 기준 리비전이나 원본이 바뀌어 충돌하면 해당 페이지를 새로 준비한다.

`snapshot`은 준비 당시의 정리 결과 버전과 검토할 원본 묶음을 고정한다. 준비만으로 처리 지점을 바꾸지 않는다. 반영에 성공하면 검토한 묶음만 처리 완료로 표시하고, 묶음 밖의 기록과 준비 후 추가된 기록은 미처리 상태로 남긴다.

첫 정리에서도 변경하지 않은 기존 기억은 보존한다. 기억을 보존하는 것과 원본을 검토 완료로 표시하는 것은 별개다. 준비 후 바뀐 원본은 `recall`의 `pending`에서 확인한다.

기본 prepare에도 현재 기억이 포함된다. 이전 --revisit 호출도 지원한다. 새 원본이 없어도 미검토 `current.memories`가 있으면 snapshot을 만든다. 같은 입력과 목적의 검토 결과가 있으면 snapshot은 null이다. `--query`는 원본과 기억의 검색 텍스트에 모든 검색어가 포함된 항목을 선택하고, `--work`는 프로젝트 공통과 해당 업무로 범위를 한정한다. 두 필터는 단독으로도 사용한다. `--work`가 없으면 모든 업무의 기억을 주제로 찾을 수 있다. 이 선택은 패턴을 자동으로 도출하거나 기억의 유효성을 판정하지 않는다.

새 snapshot은 버전 3이며 원본 해시, 현재 표현, 정정 basis, 정확한 batch와 선택 조건을 고정한다. 원본 @2만 선택했으면 @1을 읽은 것으로 처리하지 않는다. 검토 완료 집합은 앞선 공백과 별개로 보존한다. CLI는 관련 정정이 새로 생겼는지 저장 잠금 안에서 다시 확인하고, 변경이 있으면 apply를 conflict로 거부한다. 무관한 신규 원본은 미처리로 남긴다. 기존 v1/v2 snapshot과 v1–3 저장 데이터의 cursor는 이전 계약으로 읽는다. 이미 과거 cursor가 넘긴 구간을 새 검토 이력으로 소급 복구하지 않는다.

## 변경분

새 호출은 snapshot, requestKey, reviewed, read 및 변경분을 전달한다. key는 requestKey의 별칭이다. reviewed는 batch 전체와 정확히 일치해야 하며 read는 실제 읽은 원본과 현재 표현을 포함하고 reviewed를 모두 포괄해야 한다. reason과 gaps에 판단 이유와 남은 공백을 적을 수 있다. CLI는 실제 열람이나 의미의 타당성을 대신 보증하지 않는다.

입력 예와 필드 형식은 `tidy apply --help`로 확인한다. 예시의 snapshot과 ref는 실제 prepare 결과와 읽은 집합으로 바꾼다.

memories와 retire를 생략하면 기존 표현을 유지한다. 변경할 내용이 없으면 effect: no-change로 정확한 검토 집합과 영수증만 저장하고 기억 revision을 늘리지 않는다. 같은 입력과 목적의 prepare/status는 이를 재사용해 종료한다. 검토 시각 reviewedAt과 표현이 바뀐 시각 recordedAt을 구별한다. 저장 형식은 v4이며 기존 데이터는 조회 가능하다. reviewed/read를 생략하는 호출은 이전 호환 계약으로 batch를 읽었다고 취급하므로 새 스킬은 명시적으로 전달한다.

기존 works, graph와 absorb 연산은 `legacy:true`를 명시해야 한다. managed 업무를 변경할 수 없으며, 호환 모드의 의미를 새 기본 경로에 섞지 않는다.

`graph`의 대상, 진술과 제외 요청은 [그래프 계약](../../work/references/context-graph.md)에 따라 구성한다. 기억 및 업무 상태와 같은 기준 리비전과 원본 범위에서 검사하고 한 번에 저장한다.

`memories`의 각 항목은 다음 필드를 사용한다.

| 필드             | 값                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `id`             | 소문자, 숫자와 하이픈으로 된 기억 ID. 같은 판단을 갱신할 때 재사용한다.                   |
| `scope`          | 프로젝트 공통이면 `{"type":"project"}`, 업무 전용이면 `{"type":"work","id":"업무-id"}`다. |
| `text`, `reason` | 다음 구간을 실행할 선별된 맥락과 적용 조건, 재구성한 이유다.                              |
| `sources`        | 현재 주장과 생략한 세부의 복원을 뒷받침하는 원본 ref 배열. 비어 있을 수 없다.             |
| `status`         | 기본은 `active`. 미확정 판단과 충돌은 `unresolved`로 남긴다.                              |
| `supersedes`     | 선택 사항이다. 이 판단으로 대체한 원본 ref 배열이다.                                      |

같은 기억의 `scope`는 바꿀 수 없다. 적용 범위를 확장할 때는 새 ID를 사용한다.

`retire`의 각 항목은 `{"id":"기억-id","reason":"제외 이유","sources":["원본-ref"]}`다. 해당 기억을 현재 조회에서 제외하고 원본과 정리 이력은 보존한다. 원본을 삭제할 때는 `forget`을 사용한다.

## 경험을 다른 기억에 수용한다

기존 graph, works, absorb 연산이 필요한 경우만 [호환 계약](consolidation-legacy.md)을 읽는다. `legacy: true`는 이전 입력 연산을 허용한다. 과거 기록의 의미를 현재 판단으로 자동 채택하거나 managed 업무 상태를 변경할 수는 없다.

## 반영과 실패

CLI는 원본 확인부터 반영까지 원본 삭제와 같은 잠금으로 보호한다. `snapshot`의 기준 버전을 확인하고, 정리 결과와 처리 지점을 함께 저장한다. 다른 tidy가 먼저 반영했다면 리비전이 충돌하므로 새로 준비해 변경분을 재검토한다. 같은 요청키, snapshot, 변경분의 재시도는 이후 변경이 있어도 최초 결과를 반환한다.

기본 반영 응답은 `revision`, `recordedAt`, `report`와 outcome, effect, key, snapshot, reviewed, reviewedAt, remaining을 반환한다. `report.changes`에는 `kind`, `id`, `action`만 들어가며 전체 본문을 중복하지 않는다. `tidy apply --full`은 기존 상세 응답인 처리 지점, 변경한 기억과 업무 본문, 그래프와 변경 전후 내용을 반환한다. 같은 snapshot과 변경분으로 `--full` 재시도해도 새 리비전을 만들지 않는다. 저장된 전체 상태는 유지되며, 반영 후 확인에는 `recall`을 사용한다. 입력의 필수 값, 타입이나 허용 상태가 잘못되면 필드 이름과 기대값을 알리고 처리 지점을 유지한다.

rejected, conflict 또는 failed는 이번 변경을 반영하지 않는다. outcome-unknown은 저장 후 정리나 응답 실패일 수 있으므로 result로 확인하기 전까지 반영 여부를 단정하지 않는다. 해결할 수 없으면 기존 기억과 미처리 기록을 유지하고 정리가 끝나지 않았음을 알린다. 실행 중 원본이 삭제되면 그 원본을 근거로 내용을 복원하지 않는다.

원본 삭제가 기억, 이력과 근거 연결에 미치는 영향은 [작업 맥락의 삭제 계약](../../work/references/context.md#저장-위치와-사용자-제어)을 따른다.

## 결과 리포트

성공 응답에는 리비전과 `report`가 담긴다. 상세 정리 결과는 `--full`에서 반환한다. 리포트는 CLI가 실제 저장 전후를 비교해 만들며, 입력에 같은 내용을 다시 전달한 항목은 변경으로 세지 않는다.

| 필드                     | 의미                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `report.processed`       | 이번에 검토 완료로 반영한 원본 ref 배열.                                                                                      |
| `report.remaining`       | 반영 시점에 남은 미처리 원본 수. 이후 새로 들어온 기록 수는 `recall`에서 확인한다.                                            |
| `report.changes`         | 실제 변경된 기억(`memory`), 업무(`work`), 대상(`entity`), 진술(`statement`)의 목록.                                           |
| 변경의 `id`, `action`    | 바뀐 항목과 `added`, `updated`, `retired`, `absorbed`, `superseded` 등의 변화.                                                |
| 변경의 `before`, `after` | `--full`에서 반환하는 변경 전후의 내용. 새 항목의 `before`는 `null`이다. 근거와 적용 조건, 추가 할 일도 이 내용에서 확인한다. |

같은 `snapshot`과 변경분을 직후 재시도하면 같은 리비전과 같은 리포트를 반환한다. 실패한 반영의 리포트는 만들지 않는다. 실제 변경이 없는 검토에도 `changes: []`와 처리한 범위를 반환한다. 사용자가 원본을 삭제하면 리포트에 남은 해당 내용과 연결도 함께 제거한다.

동일 requestKey와 입력은 나중에 다른 정리를 반영한 뒤에도 최초 결과를 회수한다. `tidy result --key <key>`로 저장 결과를 확인한다. 같은 키에 다른 입력은 rejected이며, 관련 정정이나 기준 정리본의 변경은 conflict다. 성공한 한 호출과 다른 호출의 실패는 별개다. 저장 응답이 불명확하면 새 키로 중복 실행하지 말고 결과를 회수한다.
