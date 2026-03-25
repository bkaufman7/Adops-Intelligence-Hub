function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AdOps Intelligence Hub')
    .addItem('🚀 Full Refresh (All Data)', 'runFullRefresh')
    .addSeparator()
    .addItem('Refresh Source Exports', 'refreshSourceExports')
    .addItem('Refresh CVI Baseline (Data Tab)', 'refreshCviBaselineReference')
    .addItem('Refresh Network Mapping', 'refreshNetworkMapping')
    .addItem('Run Weekly Summary', 'runWeeklySummaryEmail')
    .addItem('Run All Summaries', 'runAllSummaries')
    .addSeparator()
    .addItem('Start Historical Backfill', 'startHistoricalBackfill')
    .addItem('Continue Historical Backfill', 'continueHistoricalBackfill')
    .addSeparator()
    .addItem('Initialize Drive Folders', 'initializeHubDriveFolders')
    .addItem('Export Audit Detail', 'exportAuditDetail')
    .addItem('Open Instructions', 'openInstructionsSheet')
    .addToUi();
}

function openInstructionsSheet() {
  const sheet = getOrCreateSheet_(SHEETS.INSTRUCTIONS);
  SpreadsheetApp.getActive().setActiveSheet(sheet);
}
