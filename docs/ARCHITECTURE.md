# Project 4 Architecture

## Hub and Spoke Contract

Project 4 consumes issue-level exports from source systems and produces cross-system intelligence.

Project 4 must not:
- parse raw vendor attachments
- implement source-specific issue detection logic
- replace source-system operational workflows

Project 4 must:
- ingest source exports
- normalize events
- preserve source links and context
- dedupe exact full-row matches
- enrich with network mapping
- maintain a central ledger
- build summary and trend outputs
- support resumable historical backfill

## Event Model

- Granularity: one row per flagged placement
- Multiple flags: comma-delimited in Issue Flags field
- Dedupe rule: exact full-row hash only (v1)
- Event date: source-derived per source-system contract

## Core Sheets

- README
- Instructions
- Config
- Network_Mapping
- Raw_Imported_Events
- Normalized_Event_Ledger
- Imported_Network_Summaries
- Summary_By_System
- Summary_By_Network
- Summary_By_Issue_Type
- Trend_Weekly
- Trend_Monthly
- Run_Log
- Backfill_Control
- UI_Control

## Extensibility

New sources are onboarded by adding a source adapter and source registration record. Existing summarization and reporting logic should remain source-agnostic.
