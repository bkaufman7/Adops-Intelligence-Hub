function setupProjectSheets(options) {
  return withRunLogging_('setupProjectSheets', function () {
    return setupProjectSheetsCore_(options);
  });
}

function setupProjectSheetsCore_(options) {
  const opts = options || {};
  const preserveAdminData = opts.preserveAdminData !== false;

  seedReadmeSheet_();
  seedInstructionsSheet_();
  seedArchitectureMapSheet_();
  seedDataContractSheet_();
  seedConfigSheet_(preserveAdminData);
  seedWeeklyRecipientsSheet_(preserveAdminData);
  seedProjectAccountsSheet_(preserveAdminData);
  seedDataSheets_(preserveAdminData);
  seedBackfillControlSheet_(preserveAdminData);
  getOrCreateSheet_(SHEETS.UI_CONTROL);
  return { success: true };
}

function archiveCurrentTabsAndBuildNewWorkspace() {
  return withRunLogging_('archiveCurrentTabsAndBuildNewWorkspace', function () {
    const archived = runSpreadsheetStepWithRetry_('archiveLegacyDataReportTabs_', function () {
      return archiveLegacyDataReportTabs_('archive_');
    });

    const hiddenArchivedTabs = runSpreadsheetStepWithRetry_('hideArchivedTabsByPrefix_', function () {
      return hideArchivedTabsByPrefix_('archive_');
    });

    setWorkspaceMigrationState_({
      status: 'QUEUED',
      archivedCount: archived.length,
      hiddenArchivedCount: hiddenArchivedTabs.length,
      attempts: 0,
      lastError: ''
    });

    const continuation = queueWorkspaceMigrationContinuation_(45 * 1000);

    return {
      archivedCount: archived.length,
      archivedTabs: archived,
      hiddenArchivedTabs: hiddenArchivedTabs,
      newMainTab: SHEETS.EXECUTIVE_SNAPSHOT,
      continuation: continuation
    };
  });
}

function runArchiveWorkspaceContinuation() {
  // Intentionally avoid withRunLogging_ here because Run_Log writes can fail
  // during Spreadsheet service incidents and mark the trigger run as failed.
  const state = getWorkspaceMigrationState_() || { attempts: 0 };
  state.attempts = Number(state.attempts || 0) + 1;
  state.status = 'RUNNING';
  state.lastError = '';
  setWorkspaceMigrationState_(state);

  try {
    runSpreadsheetStepWithRetry_('setupProjectSheetsCore_', function () {
      return setupProjectSheetsCore_({ preserveAdminData: true });
    }, { suppressSheetLogging: true });
    runSpreadsheetStepWithRetry_('organizeSheetTabs', function () {
      return organizeSheetTabs();
    }, { suppressSheetLogging: true });

    state.status = 'COMPLETED';
    setWorkspaceMigrationState_(state);
    clearWorkspaceMigrationContinuation_();
    console.log('Workspace migration continuation completed in attempt ' + state.attempts);

    return {
      success: true,
      attempts: state.attempts,
      status: state.status,
      mainTab: SHEETS.EXECUTIVE_SNAPSHOT
    };
  } catch (err) {
    const retryable = isRetryableSpreadsheetError_(err);
    state.status = retryable ? 'REQUEUED' : 'FAILED';
    state.lastError = String(err);
    setWorkspaceMigrationState_(state);

    if (retryable && state.attempts < 6) {
      const continuation = queueWorkspaceMigrationContinuation_(90 * 1000);
      console.warn('Workspace migration requeued after retryable error: ' + String(err));
      return {
        success: false,
        requeued: true,
        attempts: state.attempts,
        continuation: continuation,
        error: String(err)
      };
    }

    clearWorkspaceMigrationContinuation_();
    throw err;
  }
}

function hideArchivedTabs() {
  return withRunLogging_('hideArchivedTabs', function () {
    const hidden = hideArchivedTabsByPrefix_('archive_');
    return {
      hiddenCount: hidden.length,
      hiddenTabs: hidden
    };
  });
}

function archiveRetiredDashboardTabs() {
  return withRunLogging_('archiveRetiredDashboardTabs', function () {
    const archived = archiveTabsByName_(getRetiredDashboardTabNames_(), 'retired_');
    const hidden = hideArchivedTabsByPrefix_('retired_');
    return {
      archivedCount: archived.length,
      archivedTabs: archived,
      hiddenCount: hidden.length,
      hiddenTabs: hidden
    };
  });
}

function seedDataContractSheet_() {
  clearAndWriteTable_(
    SHEETS.DATA_CONTRACT,
    ['Source Project', 'Type', 'Field', 'Hub Usage', 'Rule / Notes'],
    [
      ['CM360 Audit System', 'Ingest', 'Event Date', 'Required', 'Copied from source export tab'],
      ['CM360 Audit System', 'Ingest', 'Network ID', 'Required', 'Backfilled from Network_Mapping when missing'],
      ['CM360 Audit System', 'Ingest', 'Issue Flags', 'Required', 'Rows with blank issue flags are skipped'],
      ['CM360 Audit System', 'Compute', 'Difference %', 'Required', 'CTR = (Clicks / Impressions) * 100; blank when impressions <= 0'],
      ['Daily CVI Catch', 'Ingest', 'Output tab', 'Required', 'Flag rows only from Output tab'],
      ['Daily CVI Catch', 'Ingest', 'Data tab snapshot', 'Reference only', 'Captured to CVI_Daily_Baseline for cross-reference'],
      ['Daily CVI Catch', 'Compute', 'Issue Type', 'Required', 'Defaults to CVI_CLICKS_GT_IMPRESSIONS when not provided'],
      ['Daily CVI Catch', 'Compute', 'Difference %', 'Required', 'CTR computed from clicks/impressions; blank when impressions <= 0'],
      ['End-of-Month Tracker', 'Ingest', 'Violations tab', 'Required', 'Primary source for violations and owner mapping'],
      ['End-of-Month Tracker', 'Ingest', 'Owner (Ops)', 'Required', 'Source of truth for Account REP OPS'],
      ['End-of-Month Tracker', 'Ingest', 'Issue Type', 'Required', 'Kept as-is by default; optional clean mode toggle available'],
      ['End-of-Month Tracker', 'Ingest', 'CTR (%)', 'Required', 'Trusted from source when present'],
      ['End-of-Month Tracker', 'Validation', 'Advertiser mismatch', 'Warning', 'Logs warning when source advertiser differs from mapping advertiser'],
      ['All Sources', 'Storage', 'Raw_Imported_Events', 'Operational', 'Lean schema for performance and reporting clarity'],
      ['All Sources', 'Storage', 'Normalized_Event_Ledger', 'Operational', 'Canonical columns used by summaries, trends, and grading']
    ]
  );
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
    ['What this project does', 'Aggregates normalized issue exports, normalizes, summarizes, scores, and trends cross-system intelligence.'],
    ['What this project does not do', 'Does not parse raw vendor attachments and does not replace source-system detection logic.'],
    ['Refresh flow', 'Use Refresh Baseline + Full Refresh for the full presentation-ready rebuild.'],
    ['Dashboard flow', 'Start with Mission_Control, then Leadership_Briefing_View, Scorecard_Reps, Scorecard_Advertisers, and Scorecard_Campaigns.'],
    ['Data quality', 'Use Data_Quality to confirm source freshness, mapping completeness, baseline coverage, and run warnings.'],
    ['Thresholds', 'Use Thresholds to review the current dynamic scoring bands derived from incoming data.'],
    ['Dedupe behavior', 'Exact full-row hash only in v1.'],
    ['Mapping behavior', 'Missing mapping does not block event ingestion; mismatches are logged in Run_Log.']
  ]);
}

function seedConfigSheet_(preserveExisting) {
  const headers = ['Key', 'Value', 'Description'];
  if (preserveExisting && sheetHasDataBeyondHeader_(SHEETS.CONFIG)) {
    ensureTableHeaders_(SHEETS.CONFIG, headers);
    return;
  }

  clearAndWriteTable_(SHEETS.CONFIG, headers, [
    [CONFIG_KEYS.WEEKLY_RECIPIENTS, '', 'Comma-separated email recipients for weekly summary'],
    [CONFIG_KEYS.ALERT_RECIPIENTS, '', 'Comma-separated email recipients for pipeline failure alerts (falls back to weekly_recipients if blank)'],
    [CONFIG_KEYS.AUDIT_EXPORT_FOLDER_ID, '1p3FNU2d4k8eARuPAr6Fhy1c0Y3UYQDzZ', 'Root Drive folder ID for Hub exports; app auto-creates organized subfolders'],
    [CONFIG_KEYS.MAPPING_SOURCE_SPREADSHEET_ID, '1BJpCPZaTEIa852vF5DiZvL9OpScKy0Awe-xXRikph2o', 'Project 3/EOM mapping spreadsheet ID'],
    [CONFIG_KEYS.MAPPING_SOURCE_TAB, 'Networks', 'Project 3 mapping tab name'],
    [CONFIG_KEYS.CVI_BASELINE_TAB, 'Data', 'Daily CVI Catch reference tab containing all live placements'],
    [CONFIG_KEYS.CVI_BASELINE_RETENTION_DAYS, '1', 'Fresh-snapshot mode for CVI_Daily_Baseline; historical retention is stored outside the Hub'],
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

function seedWeeklyRecipientsSheet_(preserveExisting) {
  const headers = ['Recipient Email'];
  if (preserveExisting && sheetHasDataBeyondHeader_(SHEETS.WEEKLY_RECIPIENTS)) {
    ensureTableHeaders_(SHEETS.WEEKLY_RECIPIENTS, headers);
    return;
  }
  clearAndWriteTable_(SHEETS.WEEKLY_RECIPIENTS, headers, []);
}

function seedProjectAccountsSheet_(preserveExisting) {
  const headers = ['Project Number', 'Project Name', 'Source System', 'Spreadsheet ID', 'Primary User Account', 'Status', 'Notes'];
  if (preserveExisting && sheetHasDataBeyondHeader_(SHEETS.PROJECT_ACCOUNTS)) {
    ensureTableHeaders_(SHEETS.PROJECT_ACCOUNTS, headers);
    return;
  }

  clearAndWriteTable_(
    SHEETS.PROJECT_ACCOUNTS,
    headers,
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

function seedDataSheets_(preserveAdminData) {
  if (preserveAdminData && sheetHasDataBeyondHeader_(SHEETS.NETWORK_MAPPING)) {
    ensureTableHeaders_(SHEETS.NETWORK_MAPPING, ['Network ID', 'Network Name', 'Advertiser', 'Account REP OPS']);
  } else {
    clearAndWriteTable_(SHEETS.NETWORK_MAPPING, ['Network ID', 'Network Name', 'Advertiser', 'Account REP OPS'], []);
  }

  clearAndWriteTable_(SHEETS.CVI_DAILY_BASELINE, CVI_BASELINE_COLUMNS, []);
  clearAndWriteTable_(SHEETS.RAW_IMPORTED_EVENTS, RAW_EVENT_COLUMNS, []);
  clearAndWriteTable_(SHEETS.NORMALIZED_LEDGER, NORMALIZED_LEDGER_COLUMNS, []);
  clearAndWriteTable_(SHEETS.IMPORTED_NETWORK_SUMMARIES, ['Event Date', 'Source System', 'Network ID', 'Network Name', 'Metric Name', 'Metric Value'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_SYSTEM, ['Source Project', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_NETWORK, ['Network Name', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.SUMMARY_BY_ISSUE_TYPE, ['Issue Flags', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.EXECUTIVE_SNAPSHOT, ['Section', 'Metric', 'Value', 'Status'], []);
  clearAndWriteTable_(SHEETS.PRESENTATION_VIEW, ['Leadership Snapshot'], []);
  clearAndWriteTable_(SHEETS.NETWORK_GRADING, ['Network Name', 'Total Issues (All Time)', 'Unique Placements', 'Issues Per Placement', 'Grade', 'Trend', 'Last 7 Days', 'Last 30 Days', 'Avg Issues Per Day (30d)'], []);
  clearAndWriteTable_(SHEETS.GRADING_METHODOLOGY, ['Section', 'Metric', 'Value', 'Notes'], []);
  clearAndWriteTable_(SHEETS.REP_GRADING, ['AdOps Rep Performance Grading'], []);
  clearAndWriteTable_(SHEETS.REP_GRADING_DIAGNOSTIC, ['Rep Issue Density Diagnostic'], []);
  clearAndWriteTable_(SHEETS.ADVERTISER_GRADING, ['Advertiser Performance Grading'], []);
  clearAndWriteTable_(SHEETS.CAMPAIGN_GRADING, ['Campaign Performance Grading'], []);
  clearAndWriteTable_(SHEETS.THRESHOLDS, ['Entity Type', 'Band', 'Min Flagged %', 'Max Flagged %', 'Source', 'Notes'], []);
  clearAndWriteTable_(SHEETS.DATA_QUALITY, ['Category', 'Metric', 'Value', 'Status', 'Notes'], []);
  clearAndWriteTable_(SHEETS.UNMAPPED_NETWORKS, ['Unmapped Networks'], []);
  clearAndWriteTable_(SHEETS.TREND_DAILY, ['Event Date', 'Source Project', 'Issue Count', 'Unique Flagged Placements'], []);
  clearAndWriteTable_(SHEETS.TREND_WEEKLY, ['Event Week', 'Source Project', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.TREND_MONTHLY, ['Event Month', 'Source Project', 'Issue Count'], []);
  clearAndWriteTable_(SHEETS.TREND_ALL_TIME, ['Scope', 'Source Project', 'Issue Count', 'Unique Flagged Placements', 'Unique Advertisers', 'Unique Campaigns', 'Unique Reps'], []);

  if (preserveAdminData && sheetHasDataBeyondHeader_(SHEETS.RUN_LOG)) {
    ensureTableHeaders_(SHEETS.RUN_LOG, ['Timestamp', 'Action', 'Status', 'Message', 'Context']);
  } else {
    clearAndWriteTable_(SHEETS.RUN_LOG, ['Timestamp', 'Action', 'Status', 'Message', 'Context'], []);
  }

  writeTabLegendSheet_();
}

function writeTabLegendSheet_() {
  var rows = [
    ['Green', 'Presentation', 'Mission Control, Leadership Briefing', 'Audience: Ben-led leadership readout'],
    ['Purple', 'Scorecards', 'Rep, Advertiser, Campaign, Network, Methodology, Diagnostic', 'Audience: performance and workload review'],
    ['Yellow', 'Quality', 'Data Quality, Unmapped Entities, Thresholds', 'Audience: trust and scoring checks'],
    ['Orange', 'Rollups', 'By Source, By Network, By Issue Type', 'Audience: supporting detail'],
    ['Teal', 'Trends', 'Daily, Weekly, Monthly, All-Time trend monitors', 'Audience: movement over time'],
    ['Grey', 'Data Core', 'Raw events, normalized ledger, baseline, imported summaries', 'Internal source data layers'],
    ['Blue', 'Config / Admin', 'Config, mapping, recipients, accounts, backfill control, UI control', 'Internal configuration'],
    ['Red', 'System', 'Run Log', 'Internal execution history'],
    ['Light Grey', 'Reference', 'README, Instructions, Architecture Map, Data Contract, Tab Legend', 'Internal documentation']
  ];
  clearAndWriteTable_(SHEETS.TAB_LEGEND, ['Color', 'Group', 'Tabs', 'Notes'], rows);
}

function organizeSheetTabs() {
  const ss = SpreadsheetApp.getActive();

  // Tab order: left to right by audience/purpose
  const TAB_ORDER = [
    // Presentation (green)
    SHEETS.EXECUTIVE_SNAPSHOT,
    SHEETS.PRESENTATION_VIEW,
    // Grading (purple)
    SHEETS.REP_GRADING,
    SHEETS.ADVERTISER_GRADING,
    SHEETS.CAMPAIGN_GRADING,
    SHEETS.NETWORK_GRADING,
    SHEETS.REP_GRADING_DIAGNOSTIC,
    SHEETS.GRADING_METHODOLOGY,
    // Quality (yellow)
    SHEETS.DATA_QUALITY,
    SHEETS.THRESHOLDS,
    SHEETS.UNMAPPED_NETWORKS,
    // Summaries (orange)
    SHEETS.SUMMARY_BY_SYSTEM,
    SHEETS.SUMMARY_BY_NETWORK,
    SHEETS.SUMMARY_BY_ISSUE_TYPE,
    // Trends (teal)
    SHEETS.TREND_DAILY,
    SHEETS.TREND_WEEKLY,
    SHEETS.TREND_MONTHLY,
    SHEETS.TREND_ALL_TIME,
    // Raw / operational data (grey)
    SHEETS.RAW_IMPORTED_EVENTS,
    SHEETS.NORMALIZED_LEDGER,
    SHEETS.IMPORTED_NETWORK_SUMMARIES,
    SHEETS.CVI_DAILY_BASELINE,
    // Config / ops (blue)
    SHEETS.CONFIG,
    SHEETS.NETWORK_MAPPING,
    SHEETS.WEEKLY_RECIPIENTS,
    SHEETS.PROJECT_ACCOUNTS,
    SHEETS.BACKFILL_CONTROL,
    SHEETS.UI_CONTROL,
    // System (red)
    SHEETS.RUN_LOG,
    // Reference docs (light grey)
    SHEETS.TAB_LEGEND,
    SHEETS.README,
    SHEETS.INSTRUCTIONS,
    SHEETS.ARCHITECTURE_MAP,
    SHEETS.DATA_CONTRACT
  ];

  const TAB_COLORS = {
    [SHEETS.EXECUTIVE_SNAPSHOT]:        '#34A853',  // green – leadership
    [SHEETS.PRESENTATION_VIEW]:         '#34A853',
    [SHEETS.REP_GRADING]:               '#7B68EE',  // purple – grading
    [SHEETS.ADVERTISER_GRADING]:        '#7B68EE',
    [SHEETS.CAMPAIGN_GRADING]:          '#7B68EE',
    [SHEETS.NETWORK_GRADING]:           '#7B68EE',
    [SHEETS.REP_GRADING_DIAGNOSTIC]:    '#9E7FD4',  // lighter purple – grading support
    [SHEETS.GRADING_METHODOLOGY]:       '#9E7FD4',
    [SHEETS.DATA_QUALITY]:              '#F4B400',
    [SHEETS.THRESHOLDS]:                '#F4B400',
    [SHEETS.SUMMARY_BY_SYSTEM]:         '#E69138',  // orange – summaries
    [SHEETS.SUMMARY_BY_NETWORK]:        '#E69138',
    [SHEETS.SUMMARY_BY_ISSUE_TYPE]:     '#E69138',
    [SHEETS.TREND_DAILY]:               '#2BBCB4',
    [SHEETS.TREND_WEEKLY]:              '#2BBCB4',  // teal – trends
    [SHEETS.TREND_MONTHLY]:             '#2BBCB4',
    [SHEETS.TREND_ALL_TIME]:            '#2BBCB4',
    [SHEETS.RAW_IMPORTED_EVENTS]:       '#9E9E9E',  // grey – raw data
    [SHEETS.NORMALIZED_LEDGER]:         '#9E9E9E',
    [SHEETS.IMPORTED_NETWORK_SUMMARIES]:'#9E9E9E',
    [SHEETS.CVI_DAILY_BASELINE]:        '#9E9E9E',
    [SHEETS.CONFIG]:                    '#4A90D9',  // blue – config/ops
    [SHEETS.NETWORK_MAPPING]:           '#4A90D9',
    [SHEETS.WEEKLY_RECIPIENTS]:         '#4A90D9',
    [SHEETS.PROJECT_ACCOUNTS]:          '#4A90D9',
    [SHEETS.UNMAPPED_NETWORKS]:         '#F4B400',
    [SHEETS.BACKFILL_CONTROL]:          '#4A90D9',
    [SHEETS.UI_CONTROL]:                '#4A90D9',
    [SHEETS.RUN_LOG]:                   '#E53935',  // red – system log
    [SHEETS.TAB_LEGEND]:               '#B0BEC5',  // light grey – reference
    [SHEETS.README]:                    '#B0BEC5',
    [SHEETS.INSTRUCTIONS]:              '#B0BEC5',
    [SHEETS.ARCHITECTURE_MAP]:          '#B0BEC5',
    [SHEETS.DATA_CONTRACT]:             '#B0BEC5'
  };

  // Move sheets into position (right-to-left so each insert at pos 0 produces correct order)
  TAB_ORDER.slice().reverse().forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;

    runSpreadsheetStepWithRetry_('moveActiveSheet:' + name, function () {
      ss.moveActiveSheet && ss.setActiveSheet(sheet);
      ss.moveActiveSheet(1);
      return true;
    });
  });

  // Apply colors
  Object.keys(TAB_COLORS).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;

    runSpreadsheetStepWithRetry_('setTabColor:' + name, function () {
      sheet.setTabColor(TAB_COLORS[name]);
      return true;
    });
  });

  runSpreadsheetStepWithRetry_('setActiveSheet:MissionControl', function () {
    const mission = ss.getSheetByName(SHEETS.EXECUTIVE_SNAPSHOT);
    if (mission) {
      ss.setActiveSheet(mission);
    }
    return true;
  });

  SpreadsheetApp.getUi().alert('Tab order and colors updated.');
}

function archiveLegacyDataReportTabs_(prefix) {
  const archivePrefix = String(prefix || 'archive_');
  const ss = SpreadsheetApp.getActive();
  const legacyDataTabs = getLegacyDataReportTabNames_();
  return archiveTabsByName_(legacyDataTabs, archivePrefix);
}

function archiveTabsByName_(tabNames, prefix) {
  const archivePrefix = String(prefix || 'archive_');
  const ss = SpreadsheetApp.getActive();
  const renamed = [];

  (tabNames || []).forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      return;
    }

    const target = nextUniqueArchivedName_(ss, archivePrefix, name);
    runSpreadsheetStepWithRetry_('renameSheet:' + name, function () {
      sheet.setName(target);
      return true;
    });
    renamed.push({ from: name, to: target });
  });

  return renamed;
}

function getRetiredDashboardTabNames_() {
  return [
    SHEETS.BILLING_RISK_METER,
    SHEETS.TOP_RISK_MOVERS,
    SHEETS.REP_WORKLOAD_LEADERBOARD,
    SHEETS.ADVERTISER_DISTRIBUTION,
    SHEETS.NETWORK_HEATMAP,
    SHEETS.PIPELINE_HEALTH,
    SHEETS.OWNER_ACTION_QUEUE
  ];
}

function hideArchivedTabsByPrefix_(prefix) {
  const archivePrefix = String(prefix || 'archive_');
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets();
  const hidden = [];

  sheets.forEach(function (sheet) {
    const name = String(sheet.getName() || '');
    if (name.indexOf(archivePrefix) !== 0) {
      return;
    }

    if (typeof sheet.isSheetHidden === 'function' && sheet.isSheetHidden()) {
      hidden.push(name);
      return;
    }

    runSpreadsheetStepWithRetry_('hideSheet:' + name, function () {
      sheet.hideSheet();
      return true;
    });
    hidden.push(name);
  });

  return hidden;
}

function getLegacyDataReportTabNames_() {
  return [
    'CVI_Daily_Baseline',
    'Raw_Imported_Events',
    'Normalized_Event_Ledger',
    'Imported_Network_Summaries',
    'Summary_By_System',
    'Summary_By_Network',
    'Summary_By_Issue_Type',
    'Executive_Snapshot',
    'Presentation_View',
    'Network_Grading',
    'Grading_Methodology',
    'Rep_Grading',
    'Rep_Grading_Diagnostic',
    'Advertiser_Grading',
    'Unmapped_Networks',
    'Trend_Weekly',
    'Trend_Monthly'
  ];
}

function nextUniqueArchivedName_(ss, prefix, baseName) {
  const normalizedBase = String(baseName || '').trim();
  let candidate = prefix + normalizedBase;

  if (!ss.getSheetByName(candidate)) {
    return candidate;
  }

  let i = 2;
  while (ss.getSheetByName(candidate + '_' + i)) {
    i += 1;
  }
  return candidate + '_' + i;
}

function sheetHasDataBeyondHeader_(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return false;
  }

  const lastRow = sheet.getLastRow();
  return lastRow > 1;
}

function ensureTableHeaders_(sheetName, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const expected = (headers || []).map(String);
  if (!expected.length) {
    return;
  }

  const existing = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, expected.length).getValues()[0].map(String)
    : [];

  const mismatch = existing.length !== expected.length || expected.some(function (h, i) {
    return String(existing[i] || '') !== h;
  });

  if (mismatch) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  }
}

function runSpreadsheetStepWithRetry_(label, fn, options) {
  const opts = options || {};
  const suppressSheetLogging = opts.suppressSheetLogging === true;
  const maxAttempts = 4;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      if (!isRetryableSpreadsheetError_(err) || attempt === maxAttempts) {
        throw err;
      }
      if (suppressSheetLogging) {
        console.warn('Retryable spreadsheet step failed; retrying: ' + String(label) + ' attempt ' + attempt + '/' + maxAttempts + ' error=' + String(err));
      } else {
        logRun_('runSpreadsheetStepWithRetry_', RUN_STATUS.WARNING, 'Retryable spreadsheet step failed; retrying', {
          label: label,
          attempt: attempt,
          maxAttempts: maxAttempts,
          error: String(err)
        });
      }
      Utilities.sleep(attempt * 500);
    }
  }
}

function queueWorkspaceMigrationContinuation_(delayMs) {
  const handlerName = 'runArchiveWorkspaceContinuation';
  clearWorkspaceMigrationContinuation_();

  const safeDelayMs = Math.max(30 * 1000, Number(delayMs) || (60 * 1000));
  const runAt = new Date(Date.now() + safeDelayMs);
  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: safeDelayMs
  };
}

function clearWorkspaceMigrationContinuation_() {
  const handlerName = 'runArchiveWorkspaceContinuation';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getWorkspaceMigrationState_() {
  const raw = PropertiesService.getScriptProperties().getProperty('WORKSPACE_MIGRATION_STATE');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setWorkspaceMigrationState_(state) {
  const safe = state || {};
  safe.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('WORKSPACE_MIGRATION_STATE', JSON.stringify(safe));
}

function seedBackfillControlSheet_(preserveExisting) {
  const headers = ['Start Date', 'End Date', 'Source System', 'Mode', 'Status', 'Last Processed Date', 'Operator Notes'];
  if (preserveExisting && sheetHasDataBeyondHeader_(SHEETS.BACKFILL_CONTROL)) {
    ensureTableHeaders_(SHEETS.BACKFILL_CONTROL, headers);
    return;
  }

  clearAndWriteTable_(
    SHEETS.BACKFILL_CONTROL,
    headers,
    [['', '', 'ALL', 'MANUAL', '', '', 'Use Continue Historical Backfill for chunked resumable processing.']]
  );
}
