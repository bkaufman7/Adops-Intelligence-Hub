function onOpen() {
  const issueTypeMenu = SpreadsheetApp.getUi()
    .createMenu('Issue Type Mode')
    .addItem('Use Raw Issue Text', 'setIssueTypeModeRaw')
    .addItem('Use Clean Issue Text', 'setIssueTypeModeClean');

  SpreadsheetApp.getUi()
    .createMenu('AdOps Intelligence Hub')
    .addItem('✅ Refresh Baseline + Full Refresh (One Button)', 'runBaselineAndFullRefresh')
    .addItem('🚀 Run Full Refresh (One-Go, Auto-Continues)', 'runFullRefresh')
    .addSeparator()
    .addItem('Refresh Source Exports', 'refreshSourceExports')
    .addItem('Refresh CVI Baseline (Data Tab)', 'refreshCviBaselineReference')
    .addItem('Refresh Network Mapping', 'refreshNetworkMapping')
    .addItem('Run Weekly Summary', 'runWeeklySummaryEmail')
    .addItem('⚡ Run All Summaries (Fast)', 'runAllSummariesFast')
    .addItem('Run All Summaries (Full with Cross-Enrich)', 'runAllSummaries')
    .addItem('📊 Build Network Grading', 'buildNetworkGrading')
    .addItem('👤 Build Rep Grading', 'buildRepGrading')
    .addItem('🏢 Build Advertiser Grading', 'buildAdvertiserGrading')
    .addSeparator()
    .addItem('⏰ Configure Daily Full Refresh Trigger (6 AM)', 'configureAutomationTriggers')
    .addItem('⏰ Remove Daily Auto-Refresh', 'removeDailyTrigger')
    .addSeparator()
    .addItem('Start Historical Backfill', 'startHistoricalBackfill')
    .addItem('Continue Historical Backfill', 'continueHistoricalBackfill')
    .addSeparator()
    .addItem('Initialize Drive Folders', 'initializeHubDriveFolders')
    .addItem('Open Data Contract', 'openDataContractSheet')
    .addItem('Open Executive Snapshot', 'openExecutiveSnapshotSheet')
    .addItem('Open Presentation View', 'openPresentationViewSheet')
    .addItem('Open Grading Methodology', 'openGradingMethodologySheet')
    .addSubMenu(issueTypeMenu)
    .addItem('Export Audit Detail', 'exportAuditDetail')
    .addItem('Export Full Data Snapshot', 'exportPopulatedDataSnapshot')
    .addItem('Open Instructions', 'openInstructionsSheet')
    .addItem('Archive Current Tabs + Build New Workspace', 'archiveCurrentTabsAndBuildNewWorkspace')
    .addItem('Continue Workspace Migration', 'runArchiveWorkspaceContinuation')
    .addItem('Hide Archived Tabs', 'hideArchivedTabs')
    .addItem('🗂️ Organize Sheet Tabs', 'organizeSheetTabs')
    .addToUi();
}

function openInstructionsSheet() {
  const sheet = getOrCreateSheet_(SHEETS.INSTRUCTIONS);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}

function openDataContractSheet() {
  seedDataContractSheet_();
  const sheet = getOrCreateSheet_(SHEETS.DATA_CONTRACT);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}

function openExecutiveSnapshotSheet() {
  const sheet = getOrCreateSheet_(SHEETS.EXECUTIVE_SNAPSHOT);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}

function openPresentationViewSheet() {
  const sheet = getOrCreateSheet_(SHEETS.PRESENTATION_VIEW);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}

function openGradingMethodologySheet() {
  const sheet = getOrCreateSheet_(SHEETS.GRADING_METHODOLOGY);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}
