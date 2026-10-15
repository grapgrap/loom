# 이전 기억·체크포인트 명령

기존 데이터와 호출자를 위해 `remember`, `checkpoint`를 유지한다. 일상 작업에는 [짧은 추가 기록](context.md)을 사용하고, 현재 기억과 업무 상태의 재구성은 [tidy](../../tidy/SKILL.md)가 맡는다.

두 명령은 JSON을 stdin으로 받으며 `expectedRevision`은 새 기록일 때 `0`, 수정할 때 조회한 원본의 현재 리비전이다. 같은 입력의 직후 재시도는 리비전을 추가하지 않는다. 충돌이면 원본을 다시 읽고 변경을 조정한다. 기억 scope는 수정할 수 없다.

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

업무 전용 기억은 `scope: {"type":"work","id":"업무-id"}`다. 출처 type은 `user` 또는 `agent`다.

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

상태는 `active` 또는 `complete`다. 완료는 근거가 있고 `next`가 비어 있어야 한다. CLI는 형식을 검사하며, 완료의 의미는 에이전트가 확인한다.

기존 원본은 `context/<id>.json`, `works/<id>/checkpoint.json`에 그대로 유지한다. tidy는 이전 리비전까지 원본으로 읽을 수 있고 이후 변경도 미처리 기록으로 감지한다. `read --ref memory:<id>@<revision>` 또는 `read --ref checkpoint:<id>@<revision>`으로 정확한 원본을 조회한다. 정리된 기억을 이미 사용 중이면 새 원본 변경도 `recall`의 `pending`에서 함께 확인한다.
