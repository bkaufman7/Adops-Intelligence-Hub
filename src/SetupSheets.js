function setupProjectSheets() {
  return withRunLogging_('setupProjectSheets', function () {
    seedReadmeSheet_();
    seedInstructionsSheet_();
    seedArchitectureMapSheet_();
    seedConfigSheet_();
    seedWeeklyRecipientsSheet_();
    seedProjectAccountsSheet_();
    seedDataSheets_();
    seedBackfillControlSheet_();
    getOrCreateSheet_(SHEETS.UI_CONTROL);
    return { success: true };
  });
}

function seedReadmeSheet_() {
  clearAndWriteTable_(SHEETS.README, ['Section', 'Details'], [
    ['Project', 'AdOps Intelligence Hub (Project 4)'],
    ['Role', 'Central intelligence hub for issue exports'],
    ['Guardrail', 'No raw vendor parsing or source detection logic in Project 4'],
    ['Event Model', 'One row per flagged placement; comma-delimited issue flags'],
    ['Dedupe', 'Exact full-row hash match only']
  ]);
}

function seedInstructionsSheet_() {
  clearAndWriteTable_(SHEETS.INSTRUCTIONS, ['Topic', 'Instruction'], [
    ['What this project does', 'Aggregates normalized issue exports, normalizes, summarizes, and trends cross-system intelligence.'],
    ['What this project does not do', 'Does not parse raw vendor attachments and does not replace source-system detection logic.'],
    ['Refresh flow', 'Run Refresh Network Mapping then Refresh Source Exports then Run All Summaries.'],
    ['Weekly summary', 'Run Run Weekly Summary to email the high-level report to configured recipients.'],
    ['Backfill', 'Set date range in Backfill_Control then run Start Historical Backfill and Continue Historical Backfill.'],
    ['Dedupe behavior', 'Exact full-row hash only in v1.'],
    ['Mapping behavior', 'Missing mapping does not block event ingestion; mismatches are logged in Run_Log.']
  ]);
}

function seedConfigSheet_() {
  clearAndWriteTable_(SHEETS.CONFIG, ['Key', 'Value', 'Description'], [
    [CONFIG_KEYS.WEEKLY_RECIPIENTS, '', 'Comma-separated email recipients for weekly summary'],
    [CONFIG_KEYS.AUDIT_EXPORT_FOLDER_ID, '1p3FNU2d4k8eARuPAr6Fhy1c0Y3UYQDzZ', 'Root Drive folder ID for Hub exports; app auto-creates organized subfolders'],
    [CONFIG_KEYS.MAPPING_SOURCE_SPREADSHEET_ID, '1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o', 'Project 3/EOM mapping spreadsheet ID'],
    [CONFIG_KEYS.MAPPING_SOURCE_TAB, 'Networks', 'Project 3 mapping tab name'],
    [CONFIG_KEYS.CVI_BASELINE_TAB, 'Data', 'Daily CVI Catch reference tab containing all live placements'],
    [CONFIG_KEYS.CVI_BASELINE_RETENTION_DAYS, '7', 'Rolling retention window for CVI_Daily_Baseline snapshots'],
    [
      CONFIG_KEYS.SOURCE_PREFIX + 'project1',
      '{"enabled":true,"sourceSystem":"CM360 Audit System","sourceProject":"CM360 Audit System","spreadsheetId":"1MUDE5geWlO9Flmy3vtfCNRrsnpDAMcz0z1uA0Lu2Ilw","exportTab":"CM360_Flagged_Export"}',
      'JSON source config for Project 1 export adapter'
    ],
    [
      CONFIG_KEYS.SOURCE_PREFIX + 'project2',
      '{"enabled":true,"sourceSystem":"Daily CVI Catch","sourceProject":"Daily CVI Catch","spreadsheetId":"1K4RfCJashYD-5AEoMyqJsNCIAmLxusDTvbwk665LWYo","exportTab":"Output"}',
      'JSON source config for Project 2 export adapter'
    ],
    [
      CONFIG_KEYS.SOURCE_PREFIX + 'project3',
      '{"enabled":true,"sourceSystem":"End-of-Month Tracker","sourceProject":"End-of-Month Tracker","spreadsheetId":"1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o","exportTab":"Violations"}',
      'JSON source config for Project 3 export adapter'
    ]
  ]);
}

function seedArchitectureMapSheet_() {
  clearAndWriteTable_(
    SHEETS.ARCHITECTURE_MAP,
    ['Category', 'Item', 'Value', 'Notes'],
    [
      ['Hub', 'Project Name', 'AdOps Intelligence Hub', 'Project 4'],
      ['Hub', 'Spreadsheet ID', '14LzEXv7Hf5OFIy0KMgFKv_cpxNAUhwASRN8oFA2mgGY8F8R41wxM1DDo', 'Apps Script / Hub sheet'],
      ['Hub', 'Drive Root Folder ID', '1p3FNU2d4k8eARuPAr6Fhy1c0Y3UYQDzZ', 'Subfolders auto-managed by export functions'],
      ['Hub', 'Weekly Recipients Source', 'Weekly_Recipients!A:A', 'Put recipients under header in A1'],
      ['Mapping', 'Spreadsheet ID', '1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o', 'Shared mapping source'],
      ['Mapping', 'Tab', 'Networks', 'Expected fields: Network Name, Advertiser, Account REP OPS'],
      ['Source Project', 'CM360 Audit System', '1MUDE5geWlO9Flmy3vtfCNRrsnpDAMcz0z1uA0Lu2Ilw | CM360_Flagged_Export', 'Account: platformsolutionshmi@gmail.com'],
      ['Source Project', 'Daily CVI Catch', '1K4RfCJashYD-5AEoMyqJsNCIAmLxusDTvbwk665LWYo | Output', 'Account: platformsolutionsadopshorizon@gmail.com'],
      ['Source Project', 'Daily CVI Catch Baseline', '1K4RfCJashYD-5AEoMyqJsNCIAmLxusDTvbwk665LWYo | Data', 'Reference-only daily baseline (not incident flags)'],
      ['Source Project', 'End-of-Month Tracker', '1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o | Violations', 'Account: platformsolutionsadopshorizon@gmail.com']
    ]
  );
}

function seedWeeklyRecipientsSheet_() {
  clearAndWriteTable_(SHEETS.WEEKLY_RECIPIENTS, ['Recipient Email'], []);
}

function seedProjectAccountsSheet_() {
  clearAndWriteTable_(
    SHEETS.PROJECT_ACCOUNTS,
    ['Project Number', 'Project Name', 'Source System', 'Spreadsheet ID', 'Primary User Account', 'Status', 'Notes'],
    [
      ['Project 1', 'CM360 Audit System', 'CM360 Audit System', '1MUDE5geWlO9Flmy3vtfCNRrsnpDAMcz0z1uA0Lu2Ilw', 'platformsolutionshmi@gmail.com', 'Active', 'Exports to CM360_Flagged_Export'],
      ['Project 2', 'Daily CVI Catch', 'Daily CVI Catch', '1K4RfCJashYD-5AEoMyqJsNCIAmLxusDTvbwk665LWYo', 'platformsolutionsadopshorizon@gmail.com', 'Active', 'Output tab used for hub ingestion'],
      ['Project 3', 'End-of-Month Tracker', 'End-of-Month Tracker', '1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o', 'platformsolutionsadopshorizon@gmail.com', 'Active', 'Violations tab used for hub ingestion'],
      ['Project 4', 'AdOps Intelligence Hub', 'AdOps Intelligence Hub', '14LzEXv7Hf5OFIy0KMgFKv_cpxNAUhwASRN8oFA2mgGY8F8R41wxM1DDo', '', 'Active', 'Hub project'],
      ['Project 5', 'DoubleVerify Ingestion + Detection', 'DoubleVerify', '', '', 'Planned', 'Future source'],
      ['Project 6', 'Innovid Ingestion + Detection', 'Innovid', '', '', 'Planned', 'Future source'],
      ['Project 7', 'Extreme Reach Ingestion + Detection', 'Extreme Reach', '', '', 'Planned', 'Future source']
    ]
  );
}

function seedDataSheets_() {
  clearAndWriteTable_(SHEETS.NETWORK_MAPPING, ['Network ID', 'Network Name', 'Advertiser', 'Account REP OPS'], []);
  clearAndWriteTable_(SHEETS.CVI_DAILY_BASELINE, CVI_BASELINE_COLUMNS, []);
  clearAndWriteTable_(SHEETS.RAW_IMPORTED_EVENTS, RAW_EVENT_COLUMNS, []);
  clearAndWriteTable_(SHEETS.NORMALIZED_LEDGER, NORMALIZED_LEDGER_COLUMNS, []);
  clearAndWriteTable_(SHEETS.IMPORTED_NETWORK_SUMMARIES, ['Event Date', 'Source System', 'Network ID', 'Network Name', 'Metric Name', 'Metric Value'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_SYSTEM, ['Source System', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_NETWORK, ['Network Name', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_ISSUE_TYPE, ['Issue Flags', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.NETWORK_GRADING, ['Network Name', 'Total Issues (All Time)', 'Unique Placements', 'Issues Per Placement', 'Grade', 'Trend', 'Last 7 Days', 'Last 30 Days', 'Avg Issues Per Day (30d)'], []);
  clearAndWriteTable_(SHEETS.REP_GRADING, ['AdOps Rep Performance Grading'], []);
  clearAndWriteTable_(SHEETS.TREND_WEEKLY, ['Event Week', 'Source System', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.TREND_MONTHLY, ['Event Month', 'Source System', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.RUN_LOG, ['Timestamp', 'Action', 'Status', 'Message', 'Context'], []);
}

function seedBackfillControlSheet_() {
  clearAndWriteTable_(
    SHEETS.BACKFILL_CONTROL,
    ['Start Date', 'End Date', 'Source System', 'Mode', 'Status', 'Last Processed Date', 'Operator Notes'],
    [['', '', 'ALL', 'MANUAL', '', '', 'Use Continue Historical Backfill for chunked resumable processing.']]
  );
}
