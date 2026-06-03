const SHEETS = {
  README: 'README',
  INSTRUCTIONS: 'Instructions',
  ARCHITECTURE_MAP: 'Architecture_Map',
  DATA_CONTRACT: 'Data_Contract',
  CONFIG: 'Config',
  WEEKLY_RECIPIENTS: 'Weekly_Recipients',
  PROJECT_ACCOUNTS: 'Project_Accounts',
  CVI_DAILY_BASELINE: 'Data_Baseline_Live_Placements',
  NETWORK_MAPPING: 'Network_Mapping',
  RAW_IMPORTED_EVENTS: 'Data_Raw_Issue_Events',
  NORMALIZED_LEDGER: 'Data_Normalized_Ledger',
  IMPORTED_NETWORK_SUMMARIES: 'Data_Imported_Network_Summaries',
  SUMMARY_BY_SYSTEM: 'Rollup_By_Source_System',
  SUMMARY_BY_NETWORK: 'Rollup_By_Network',
  SUMMARY_BY_ISSUE_TYPE: 'Rollup_By_Issue_Type',
  EXECUTIVE_SNAPSHOT: 'Mission_Control',
  PRESENTATION_VIEW: 'Leadership_Briefing_View',
  NETWORK_GRADING: 'Scorecard_Networks',
  GRADING_METHODOLOGY: 'Scorecard_Methodology',
  REP_GRADING: 'Scorecard_Reps',
  REP_GRADING_DIAGNOSTIC: 'Scorecard_Reps_Diagnostic',
  ADVERTISER_GRADING: 'Scorecard_Advertisers',
  UNMAPPED_NETWORKS: 'Ops_Unmapped_Entities',
  TREND_WEEKLY: 'Trend_Weekly_Monitor',
  TREND_MONTHLY: 'Trend_Monthly_Monitor',
  BILLING_RISK_METER: 'Risk_Billing_Meter',
  TOP_RISK_MOVERS: 'Risk_Top_Movers',
  REP_WORKLOAD_LEADERBOARD: 'Workload_Rep_Leaderboard',
  ADVERTISER_DISTRIBUTION: 'Distribution_Advertiser_Grades',
  NETWORK_HEATMAP: 'Heatmap_Network_Health',
  PIPELINE_HEALTH: 'Pipeline_Health_Status',
  OWNER_ACTION_QUEUE: 'Ops_Owner_Action_Queue',
  RUN_LOG: 'Run_Log',
  BACKFILL_CONTROL: 'Backfill_Control',
  UI_CONTROL: 'UI_Control',
  TAB_LEGEND: 'Tab_Legend'
};

const RAW_EVENT_COLUMNS = [
  'Event Date',
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
  'Source File Name',
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
  'Account REP OPS'
];

const CONFIG_KEYS = {
  WEEKLY_RECIPIENTS: 'weekly_recipients',
  ALERT_RECIPIENTS: 'alert_recipients',
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
  SOURCE_ARCHIVES: 'Source_Archives',
  DATA_SNAPSHOTS: 'Data_Snapshots'
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
