# remember·checkpoint 계약

`remember`의 기존 데이터나 업무의 즉시 상태를 저장하는 `checkpoint`를 다룰 때 참조한다. 일상 관찰은 [record](context.md#새-내용을-짧게-기록한다)로 추가하고, 업무 착수·전환·종료는 [미완료 업무 규약](context.md#미완료-업무를-확인하고-재개한다)에 따라 `checkpoint`로 저장한다. [tidy](../../tidy/SKILL.md)는 원본과 현재 기억·업무 상태를 정리한다.

두 명령은 JSON을 stdin으로 받는다. `expectedRevision`은 새 기록이면 `0`, 수정이면 조회한 원본의 현재 리비전이다. `checkpoint`는 `recall`의 `work.checkpointRevision`을 사용하며 정리 결과의 `work.revision`과 구분한다. 같은 입력을 직후에 재시도하면 리비전을 추가하지 않는다. 리비전이 충돌하면 원본을 다시 읽고 변경분을 조정한다. 기억의 `scope`는 바꿀 수 없다.

`remember --id <id>` 입력:

```json
{
  "expectedRevision": 0,
  "scope": { "type": "project" },
  "text": "재사용할 판단과 적용 조건",
  "reason": "판단의 이유",
  "source": { "type": "user", "reference": "실제 발언이나 관찰 결과의 위치" }
}
```

업무 전용 기억에는 `scope: {"type":"work","id":"업무-id"}`를 사용한다. `source.type`은 사용자의 실제 발언이면 `user`, 에이전트의 관찰이나 판단이면 `agent`다.

`checkpoint --work <id>` 입력:

```json
{
  "expectedRevision": 0,
  "goal": "업무 목표",
  "status": "active",
  "progress": "검증한 현재 상태",
  "evidence": ["실제 검증 결과나 산출물 위치"],
  "next": ["다음 행동"],
  "source": { "type": "agent", "reference": "실제 작업 대화나 관찰 결과의 위치" }
}
```

`status`는 `active`·`blocked`·`paused`·`complete`·`cancelled`다. `blocked`·`paused`는 `progress`에 이유와 재개 조건을 남기고 `next`에 남은 행동을 둔다. `complete`는 검증 근거가 있고 `next`가 비어 있을 때 사용한다. `cancelled`는 사용자의 취소 근거를 `progress`에 보존하고 `next`를 비운다. 근거가 실제 완료·보류·취소를 입증하는지는 에이전트가 확인한다.

원본은 프로젝트 데이터 경로의 `context/<id>.json`, `works/<id>/checkpoint.json`에 저장한다. 이전 리비전은 tidy의 원본으로 보존하고 이후 변경도 미처리 기록으로 읽는다. 정확한 원본은 `read --ref memory:<id>@<revision>` 또는 `read --ref checkpoint:<id>@<revision>`으로 조회한다. 새 체크포인트는 정리 전에도 업무 상태에 우선 반영되며, `tidy`로 원본을 처리해도 그 상태가 과거 상태로 돌아가지 않는다. 새 원본 변경은 `recall`의 `pending`에서도 함께 확인한다.
