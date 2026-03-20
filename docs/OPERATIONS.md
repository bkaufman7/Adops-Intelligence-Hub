# Operations Guide

## Runtime Modes

Manual mode:
- refresh source exports
- refresh mapping
- run summaries
- run weekly summary
- start or continue backfill
- export audit detail

Trigger mode:
- scheduled source refresh
- scheduled weekly summary
- background backfill continuation
- scheduled mapping refresh

## First-Time Setup

1. Run setupProjectSheets.
2. Populate Config values.
3. Run refreshNetworkMapping.
4. Run refreshSourceExports.
5. Run runAllSummaries.

## Backfill Pattern (v1)

- Operator sets start and end date in Backfill_Control.
- startHistoricalBackfill marks run status as QUEUED.
- continueHistoricalBackfill processes one chunk per invocation.
- last processed date is persisted for resumability.

## Logging and Audit

- Each key operation writes to Run_Log.
- Optional detail export writes CSV files to configured Drive folder.
- Weekly summary email remains high-level and links to detail surfaces.
