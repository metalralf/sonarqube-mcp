# SonarQube Tool — v1.3.3 Smoke Test

## All Previous Fixes Still Hold

| Issue | v1.3.3 |
|---|---|
| `sonar_issues_summary` counts | ✅ INFO: 3, CODE_SMELL: 3 |
| `sonar_worst_metrics` `_note` | ✅ present |
| `sonar_raw` 400 hint | ✅ present |
| `sonar_issues_bulk_transition` | ✅ exists (400: "action required" — correct) |
| `sonar_projects_create` | ✅ created `zz_test_mcp_v133` |
| `sonar_metrics_history` | ✅ 4 data points |
| `sonar_hotspots` | ✅ empty, no 403 |

## New Observation

`sonar_summary` still reports `by_severity: { INFO: 1 }` and `by_type: { CODE_SMELL: 1 }`,
while `sonar_issues_summary` correctly reports `INFO: 3` and `CODE_SMELL: 3`.

Both call themselves `by_severity` / `by_type` — a user comparing them would see
contradictory numbers and wonder which is correct.

This is the **same class of bug** that was fixed in `sonar_issues_summary`:
counting distinct *values* instead of aggregating *issue counts*. It now lives
in `sonar_summary` instead.

## Verdict

Clean bill of health otherwise. One minor inconsistency remains in `sonar_summary`.
