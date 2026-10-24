# 정리 결과의 반영 계약

`tidy apply`에는 원본을 검토해 결정한 기억·업무 상태·그래프의 변경분을 전달한다. CLI는 입력 값의 제약·근거의 존재·동시 갱신을 검사한다. 근거가 주장을 뒷받침하는지는 에이전트가 판단한다.

## 준비

로드한 `tidy/SKILL.md`가 있는 폴더를 기준으로 `../../scripts/context/`의 절대 경로를 구한다. `<plugin-root>`는 그 플러그인의 루트이고, `<checkout>`은 현재 저장소의 체크아웃 또는 워크트리 경로다. 예시의 경로를 실제 값으로 바꾸고 인용한다. 첫 실행과 저장 권한은 [작업 맥락](../../work/references/context.md)의 절차를 따른다.

```sh
node "<plugin-root>/scripts/context/cli.mjs" tidy prepare --cwd "<checkout>" --limit 20
```

- `snapshot`: 반영할 때 전달할 준비 결과의 ID다. 미처리 기록이 없으면 `null`이다.
- `records`: 이번 묶음에서 모두 검토할 원본이다. `remember`·`checkpoint`의 이전 리비전도 포함한다.
- `current`: 보존하거나 갱신할 현재 기억과 업무 상태다. `current.memories`에는 `remember`로 저장한 기억도 원본 ref와 함께 포함한다.
- `current.retired`: 이미 현재 기억에서 제외한 항목의 ID·범위·제외 이유다. 과거 원본을 찾았다는 이유만으로 다시 활성화하지 않는다.
- `current.graph`: 기존 대상과 진술이다. 대체·제외된 진술도 보존하므로 상태를 확인한다.
- `remaining`: 묶음 밖에 남은 미처리 원본 수다.

`--limit`은 `records`와 `current`의 기억·업무·제외 목록 각각에 적용한다. `current.memoriesRemaining`·`worksRemaining`·`retiredRemaining`으로 남은 항목을 확인한다. 현재 상태의 다음 페이지가 필요하면 같은 limit과 증가한 `--offset`으로 다시 준비한다. offset은 `current`의 목록에만 적용하며 미처리 원본을 건너뛰지 않는다. 각 호출은 새 snapshot을 반환한다. 페이지를 읽는 동안 `baseRevision`이나 `records`의 ref 목록이 바뀌면 새 준비 결과를 기준으로 검토하고, 마지막으로 검토한 snapshot을 반영한다.

`snapshot`은 준비 당시의 정리 결과 버전과 검토할 원본 묶음을 고정한다. 준비만으로 처리 지점을 바꾸지 않는다. 반영에 성공하면 검토한 묶음만 처리 완료로 표시하고, 묶음 밖의 기록과 준비 후 추가된 기록은 미처리 상태로 남긴다.

첫 정리에서도 변경하지 않은 기존 기억은 보존한다. 기억을 보존하는 것과 원본을 검토 완료로 표시하는 것은 별개다. 준비 후 바뀐 원본은 `recall`의 `pending`에서 확인한다.

## 변경분

입력에는 `snapshot`과 변경할 항목만 담는다. `memories`, `works`, `retire`, `graph`는 생략할 수 있으며, 생략한 기존 항목은 유지된다. 원본을 모두 검토했지만 변경할 내용이 없으면 `snapshot`만 반영해 해당 묶음을 처리 완료로 표시한다.

`graph`의 대상·진술·제외 요청은 [그래프 계약](../../work/references/context-graph.md)에 따라 구성한다. 기억·업무 상태와 같은 기준 리비전·원본 범위에서 검사하고 한 번에 저장한다.

`memories`의 각 항목은 다음 필드를 사용한다.

| 필드             | 값                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `id`             | 소문자·숫자·하이픈으로 된 기억 ID. 같은 판단을 갱신할 때 재사용한다.                      |
| `scope`          | 프로젝트 공통이면 `{"type":"project"}`, 업무 전용이면 `{"type":"work","id":"업무-id"}`다. |
| `text`, `reason` | 현재 판단과 적용 조건, 그 이유다.                                                         |
| `sources`        | 주장을 뒷받침하는 실제 원본 ref 배열. 비어 있을 수 없다.                                  |
| `status`         | 기본은 `active`. 미확정·충돌은 `unresolved`로 남긴다.                                     |
| `supersedes`     | 선택 사항이다. 이 판단으로 대체한 원본 ref 배열이다.                                      |

같은 기억의 `scope`는 바꿀 수 없다. 적용 범위를 확장할 때는 새 ID를 사용한다.

`works`의 각 항목에는 `id`, `goal`, `status`, `progress`, `evidence`, `next`, `sources`를 전달한다. 상태는 `active`·`blocked`·`paused`·`complete`·`cancelled`다. `evidence`에는 실제 검증 결과가 담긴 원본 ref를 넣는다. `complete`는 그 근거가 원래 목표의 완료를 입증하고 `next`가 비어 있을 때만 사용한다. `blocked`·`paused`에는 남은 행동과 `progress`의 이유·재개 조건이 필요하다. `cancelled`에는 사용자의 취소 근거를 보존하고 `next`를 비운다. 의미와 재개 판단은 [미완료 업무 규약](../../work/references/context.md#미완료-업무를-확인하고-재개한다)에 따른다.

검토한 묶음의 체크포인트는 업무별로 가장 높은 원본 리비전의 상태가 기본 반영된다. 해당 업무를 `works`로 명시하면 근거를 대조한 그 판단을 적용한다. `works`를 생략해도 새 체크포인트가 과거 정리 상태에 가려지지 않는다. 자동 반영한 상태도 `report.changes`에 포함된다.

업무 상태에는 준비 당시 확인한 체크포인트 리비전도 보존한다. 명시적으로 반영한 최신 판단을 이후 묶음의 과거 체크포인트가 덮어쓰지 않으며, 준비 후 작성한 새 체크포인트는 다음 조회에서 우선 반영된다.

`retire`의 각 항목은 `{"id":"기억-id","reason":"제외 이유","sources":["원본-ref"]}`다. 해당 기억을 현재 조회에서 제외하고 원본과 정리 이력은 보존한다. 원본을 삭제할 때는 `forget`을 사용한다.

ref는 조회 결과의 `note:업무-id@번호`, `memory:기억-id@리비전`, `checkpoint:업무-id@리비전`을 사용한다. 근거로 인용할 원본을 실제로 읽고, 준비 시점까지 존재한 원본만 이번 결과에 연결한다.

다음은 두 원본을 읽고 두 번째 원본의 정렬 기준이 첫 번째 원본의 결정을 대체했음을 확인한 경우의 예다. 실제 반영에는 `prepare`에서 받은 `snapshot`과 읽은 원본의 ref를 사용한다.

```sh
node "<plugin-root>/scripts/context/cli.mjs" tidy apply --cwd "<checkout>" <<'LOOM_TIDY_JSON'
{
  "snapshot": "<snapshot-id>",
  "memories": [
    {
      "id": "search-order",
      "scope": { "type": "project" },
      "text": "검색 결과는 관련도가 높은 순서로 정렬한다.",
      "reason": "필요한 원본을 먼저 찾을 수 있도록 정렬 기준을 바꿨다.",
      "sources": ["note:search-order@2"],
      "supersedes": ["note:search-order@1"]
    }
  ]
}
LOOM_TIDY_JSON
```

Windows PowerShell에서는 JSON을 here-string 변수에 담고 UTF-8로 파이프한다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$tidyJson | & "<plugin-root>\scripts\context\cli.cmd" tidy apply --cwd "<checkout>"
```

## 반영과 실패

CLI는 원본 확인부터 반영까지 원본 삭제와 같은 잠금으로 보호한다. `snapshot`의 기준 버전을 확인하고, 정리 결과와 처리 지점을 함께 저장한다. 다른 tidy가 먼저 반영했다면 리비전이 충돌하므로 새로 준비해 변경분을 재검토한다. 같은 `snapshot`과 같은 변경분을 직후에 재시도하면 리비전을 추가하지 않는다.

반영 응답은 리비전·처리 지점과 이번에 변경한 기억·업무 상태만 반환한다. 저장된 전체 상태는 유지되며, 반영 후 확인에는 `recall`을 사용한다. 입력의 필수 값·타입·허용 상태가 잘못되면 필드 이름과 기대값을 알리고 처리 지점을 유지한다.

입력·출처·잠금·쓰기 오류가 발생하면 처리 지점을 앞당기지 않는다. 해결할 수 없으면 기존 기억과 미처리 기록을 유지하고 정리가 끝나지 않았음을 알린다. 실행 중 원본이 삭제되면 그 원본을 근거로 내용을 복원하지 않는다.

원본 삭제가 기억·이력·근거 연결에 미치는 영향은 [작업 맥락의 삭제 계약](../../work/references/context.md#저장-위치와-사용자-제어)을 따른다.

## 결과 리포트

성공 응답에는 정리 결과와 `report`가 함께 담긴다. 리포트는 CLI가 실제 저장 전후를 비교해 만들며, 입력에 같은 내용을 다시 전달한 항목은 변경으로 세지 않는다.

| 필드                     | 의미                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `report.processed`       | 이번에 검토 완료로 반영한 원본 ref 배열.                                                                |
| `report.remaining`       | 반영 시점에 남은 미처리 원본 수. 이후 새로 들어온 기록 수는 `recall`에서 확인한다.                      |
| `report.changes`         | 실제 변경된 기억(`memory`)·업무(`work`)·대상(`entity`)·진술(`statement`)의 목록.                        |
| 변경의 `id`, `action`    | 바뀐 항목과 `added`, `updated`, `retired`, `superseded` 등의 변화.                                      |
| 변경의 `before`, `after` | 변경 전후의 내용. 새 항목의 `before`는 `null`이다. 근거와 적용 조건, 추가 할 일도 이 내용에서 확인한다. |

같은 `snapshot`·변경분을 직후 재시도하면 같은 리비전과 같은 리포트를 반환한다. 실패한 반영의 리포트는 만들지 않는다. 실제 변경이 없는 검토에도 `changes: []`와 처리한 범위를 반환한다. 사용자가 원본을 삭제하면 리포트에 남은 해당 내용과 연결도 함께 제거한다.
