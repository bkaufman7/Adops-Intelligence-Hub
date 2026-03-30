const SHEETS = {
  README: 'README',
  INSTRUCTIONS: 'Instructions',
  ARCHITECTURE_MAP: 'Architecture_Map',
  CONFIG: 'Config',
  WEEKLY_RECIPIENTS: 'Weekly_Recipients',
  PROJECT_ACCOUNTS: 'Project_Accounts',
  CVI_DAILY_BASELINE: 'CVI_Daily_Baseline',
  NETWORK_MAPPING: 'Network_Mapping',
  RAW_IMPORTED_EVENTS: 'Raw_Imported_Events',
  NORMALIZED_LEDGER: 'Normalized_Event_Ledger',
  IMPORTED_NETWORK_SUMMARIES: 'Imported_Network_Summaries',
  SUMMARY_BY_SYSTEM: 'Summary_By_System',
  SUMMARY_BY_NETWORK: 'Summary_By_Network',
  SUMMARY_BY_ISSUE_TYPE: 'Summary_By_Issue_Type',
  NETWORK_GRADING: 'Network_Grading',
  REP_GRADING: 'Rep_Grading',
  TREND_WEEKLY: 'Trend_Weekly',
  TREND_MONTHLY: 'Trend_Monthly',
  RUN_LOG: 'Run_Log',
  BACKFILL_CONTROL: 'Backfill_Control',
  UI_CONTROL: 'UI_Control'
};

const RAW_EVENT_COLUMNS = [
  'Event Date',
  'Source System',
  'Source Project',
  'Source Spreadsheet ID',
  'Source Tab',
  'Source Email Subject',
  'Source Email Link',
  'Source File Name',
  'Source File Link',
  'Network ID',
  'Network Name',
  'Advertiser',
  'Campaign',
  'Placement ID',
  'Placement Name',
  'Issue Type Raw',
  'Issue Flags',
  'Issue Detail',
  'Impressions',
  'Clicks',
  'Difference %',
  'Additional Metric 1',
  'Additional Metric 2',
  'Status Raw',
  'Handled Notes',
  'Export Timestamp',
  'Import Timestamp',
  'Full Row Hash',
  'Raw JSON Snapshot'
];

const CVI_BASELINE_COLUMNS = [
  'Snapshot Date',
  'Source System',
  'Source Project',
  'Network ID',
  'Advertiser ID',
  'Advertiser',
  'Campaign ID',
  'Campaign',
  'Placement ID',
  'Placement',
  'Impressions',
  'Clicks',
  'Import Timestamp',
  'Snapshot Key',
  'Raw JSON Snapshot'
];

const NORMALIZED_LEDGER_COLUMNS = [
  'Event Date',
  'Event Week',
  'Event Month',
  'Source System',
  'Source Project',
  'Network ID',
  'Network Name',
  'Advertiser',
  'Campaign',
  'Placement ID',
  'Placement Name',
  'Issue Type',
  'Issue Flags',
  'Issue Detail',
  'Impressions',
  'Clicks',
  'Difference %',
  'Account REP OPS',
  'Source Email Link',
  'Source File Link',
  'Full Row Hash',
  'Imported At',
  'Also Flagged By',
  'Cross Source Issue Flags',
  'Cross Source Join Level'
];

const CONFIG_KEYS = {
  WEEKLY_RECIPIENTS: 'weekly_recipients',
  AUDIT_EXPORT_FOLDER_ID: 'audit_export_folder_id',
  MAPPING_SOURCE_SPREADSHEET_ID: 'mapping_source_spreadsheet_id',
  MAPPING_SOURCE_TAB: 'mapping_source_tab',
  CVI_BASELINE_TAB: 'cvi_baseline_tab',
  CVI_BASELINE_RETENTION_DAYS: 'cvi_baseline_retention_days',
  SOURCE_PREFIX: 'source.'
};

const HUB_FOLDERS = {
  AUDIT_DETAIL_EXPORTS: 'Audit_Detail_Exports',
  WEEKLY_SUMMARY_EXPORTS: 'Weekly_Summary_Exports',
  BACKFILL_EXPORTS: 'Backfill_Exports',
  SOURCE_ARCHIVES: 'Source_Archives'
};

const RUN_STATUS = {
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED'
};

const SOURCE_SYSTEMS = {
  PROJECT_1_CM360_AUDIT: 'CM360 Audit System',
  PROJECT_2_CVI: 'Daily CVI Catch',
  PROJECT_3_EOM: 'End-of-Month Tracker'
};
