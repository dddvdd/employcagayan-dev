# EMPLOYCagayan documentation

Public documentation omits workstation paths, account identifiers and exact details of the open DEV privilege finding. Use the restricted local evidence for those details. Repository links point to files present in this branch.

Use this index from the primary Windows checkout. The root [README](../README.md) covers application setup.

## Start with these documents

| Need | Document |
| --- | --- |
| Resume development | [November 6 context handoff](handoffs/EMPLOYCagayan_CONTEXT_HANDOFF_2026-11-06.md) and [development plan](plans/EMPLOYCagayan_DEV_PLAN_2026-11-06.md) |
| Verify Batch 1 qualification scope | [Security remediation](audits/EMPLOYCagayan_Batch1_Security_Remediation_2026-11-02.md) |
| Understand the vacancy edit fix | [Batch 2.3 implementation](audits/EMPLOYCagayan_Batch2_3_Completion_Report.md) and [Batch 2.4 compatibility audit](audits/EMPLOYCagayan_Batch2_4_DEV_Readiness_Audit.md) |
| Review release gates | [PostgreSQL rehearsal](operations/EMPLOYCagayan_Batch2_5_Installation_Rehearsal_Report.md) and [operator checklist](operations/EMPLOYCagayan_Batch2_6_Operator_Action_Checklist.md) |
| Plan Employer/Admin testing | [23-case matrix](uat/EMPLOYCagayan_Employer_Admin_UAT_Matrix.md) and [execution readiness](uat/EMPLOYCagayan_Employer_Admin_UAT_Execution_Readiness.md) |
| Review baseline findings | [November 2 Team UAT audit](audits/EMPLOYCagayan_Team_UAT_Audit_2026-11-02.md) and [November 5 interim audit](audits/EMPLOYCagayan_Current_Development_Audit_2026-11-05.md) |
| Find architecture or retention material | [Design guide](architecture/DESIGN.md), [retention preview design](architecture/RETENTION_PREVIEW_DESIGN.md), and [retention decision register](../governance/retention/RETENTION_APPROVAL_DECISIONS.md) |
| Find historical and external evidence | [Documentation relocation and provenance](operations/DOCUMENTATION_RELOCATION_2026-11-06.md) and [previous handoff](archive/EMPLOYCagayan_New_Chat_Handoff.md) |

The Batch 2.7 readiness report became readable during the documentation reorganization. It classifies the 23 cases and records all hosted Employer/Admin cases as untested. The handoff retains the original audit snapshot. Keep hosted status separate from local automation.

## Where to place new documentation

- `handoffs/` for resumable snapshots, `plans/` for roadmaps, and `audits/` for dated findings and milestone evidence.
- `uat/` for cases and execution readiness, `operations/` for operator procedures, and `architecture/` for designs.
- `archive/` for superseded material. Keep generated output in the established artifact directories. Keep executable tooling and migration inputs in their existing locations.
- Keep retention proposals and decision records with [retention governance](../governance/retention). Use the provenance record when referring to source-worktree evidence.

The handoff records the approved DEV target and release restrictions. Database operations, fixture writes, hosted UAT and deployment require separate authorization.
