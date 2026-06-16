function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const refreshMenu = ui.createMenu('Refresh / Rebuild')
    .addItem('Refresh Baseline + Full Refresh', 'runBaselineAndFullRefresh')
    .addItem('Refresh Source Data Only', 'refreshSourceExports')
    .addItem('Refresh Network Mapping', 'refreshNetworkMapping')
    .addItem('Rebuild Dashboards + Scorecards', 'rebuildDashboardsAndScorecards')
    .addSeparator()
    .addItem('Run Full Refresh Continuation', 'runFullRefresh');

  const openViewsMenu = ui.createMenu('Open Views')
    .addItem('Mission Control', 'openExecutiveSnapshotSheet')
    .addItem('Leadership View', 'openPresentationViewSheet')
    .addSeparator()
    .addItem('Rep Scorecard', 'openRepScorecardSheet')
    .addItem('Advertiser Scorecard', 'openAdvertiserScorecardSheet')
    .addItem('Campaign Scorecard', 'openCampaignScorecardSheet')
    .addItem('Network Scorecard', 'openNetworkScorecardSheet')
    .addSeparator()
    .addItem('Thresholds', 'openThresholdsSheet')
    .addItem('Data Quality', 'openDataQualitySheet')
    .addItem('Daily Trend', 'openDailyTrendSheet');

  const adminMenu = ui.createMenu('Admin')
    .addItem('Configure Daily Refresh Trigger', 'configureAutomationTriggers')
    .addItem('Remove Daily Refresh Trigger', 'removeDailyTrigger')
    .addSeparator()
    .addItem('Run Weekly Summary Email', 'runWeeklySummaryEmail')
    .addItem('Refresh CVI Baseline Only', 'refreshCviBaselineReference')
    .addItem('Build Rep Scorecard Only', 'buildRepGrading')
    .addItem('Build Advertiser Scorecard Only', 'buildAdvertiserGrading')
    .addItem('Build Campaign Scorecard Only', 'buildCampaignGrading')
    .addItem('Build Network Scorecard Only', 'buildNetworkGrading')
    .addItem('Build Thresholds Only', 'buildThresholds')
    .addItem('Build Data Quality Only', 'buildDataQuality')
    .addSeparator()
    .addItem('Use Raw Issue Text', 'setIssueTypeModeRaw')
    .addItem('Use Clean Issue Text', 'setIssueTypeModeClean')
    .addSeparator()
    .addItem('Initialize / Repair Workbook', 'setupProjectSheets')
    .addItem('Organize Sheet Tabs', 'organizeSheetTabs')
    .addItem('Archive Retired Dashboard Tabs', 'archiveRetiredDashboardTabs')
    .addItem('Initialize Drive Folders', 'initializeHubDriveFolders')
    .addItem('Export Full Data Snapshot', 'exportPopulatedDataSnapshot')
    .addItem('Export Audit Detail', 'exportAuditDetail')
    .addSeparator()
    .addItem('Start Historical Backfill', 'startHistoricalBackfill')
    .addItem('Continue Historical Backfill', 'continueHistoricalBackfill')
    .addItem('Archive Current Tabs + Build New Workspace', 'archiveCurrentTabsAndBuildNewWorkspace')
    .addItem('Continue Workspace Migration', 'runArchiveWorkspaceContinuation')
    .addItem('Hide Archived Tabs', 'hideArchivedTabs');

  ui.createMenu('AdOps Intelligence Hub')
    .addSubMenu(refreshMenu)
    .addSubMenu(openViewsMenu)
    .addSubMenu(adminMenu)
    .addToUi();
}

function openInstructionsSheet() {
  openSheetByName_(SHEETS.INSTRUCTIONS);
}

function openDataContractSheet() {
  seedDataContractSheet_();
  openSheetByName_(SHEETS.DATA_CONTRACT);
}

function openExecutiveSnapshotSheet() {
  openSheetByName_(SHEETS.EXECUTIVE_SNAPSHOT);
}

function openPresentationViewSheet() {
  openSheetByName_(SHEETS.PRESENTATION_VIEW);
}

function openRepScorecardSheet() {
  openSheetByName_(SHEETS.REP_GRADING);
}

function openAdvertiserScorecardSheet() {
  openSheetByName_(SHEETS.ADVERTISER_GRADING);
}

function openCampaignScorecardSheet() {
  openSheetByName_(SHEETS.CAMPAIGN_GRADING);
}

function openNetworkScorecardSheet() {
  openSheetByName_(SHEETS.NETWORK_GRADING);
}

function openThresholdsSheet() {
  openSheetByName_(SHEETS.THRESHOLDS);
}

function openDataQualitySheet() {
  openSheetByName_(SHEETS.DATA_QUALITY);
}

function openDailyTrendSheet() {
  openSheetByName_(SHEETS.TREND_DAILY);
}

function openGradingMethodologySheet() {
  openSheetByName_(SHEETS.GRADING_METHODOLOGY);
}

function openSheetByName_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}
