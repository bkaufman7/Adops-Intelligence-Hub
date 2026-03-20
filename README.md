# AdOps Intelligence Hub (Project 4)

Central intelligence hub that ingests normalized issue exports from spoke systems, maintains an event ledger, and produces summaries, trends, and weekly intelligence output.

## Architecture Guardrails

Project 4 is a hub. It does not parse raw vendor attachments and does not own source-system issue detection logic.

It is responsible for:
- importing normalized issue rows from source projects
- preserving source context and links
- exact full-row dedupe
- normalization and enrichment
- summary and trend generation
- weekly executive summary email
- historical issue backfill
- optional detail export to Drive

## Repository Layout

- src/: Google Apps Script source files
- docs/: architecture and operations references

## Local Setup

1. Install dependencies
   - npm install
2. Configure CLASP
   - Update .clasp.json scriptId with your Apps Script project ID
   - npm run clasp:login
3. Push source
   - npm run clasp:push
4. Open script project
   - npm run clasp:open

## First-Time In-Sheet Setup

1. Run setupProjectSheets from Apps Script editor.
2. Fill Config sheet values.
3. Run refreshNetworkMapping.
4. Run refreshSourceExports.
5. Run runAllSummaries.
6. Run runWeeklySummaryEmail.

## Manual Menu Actions

The custom menu includes:
- Refresh Source Exports
- Refresh Network Mapping
- Run Weekly Summary
- Run All Summaries
- Start Historical Backfill
- Continue Historical Backfill
- Export Audit Detail
- Open Instructions

## Notes

- Dedupe behavior is exact full-row hash match.
- Event granularity is one row per flagged placement.
- Multiple flags remain comma-delimited in one field.
- Mapping gaps do not block imports; they are logged.
