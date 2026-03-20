function refreshSourceExports() {
  return importFromConfiguredSources_();
}

function runAllSummaries() {
  return withRunLogging_('runAllSummaries', function () {
    normalizeRawEvents_();
    buildSummaries_();
    buildTrends_();
    return { success: true };
  });
}

function runProjectPipeline() {
  return withRunLogging_('runProjectPipeline', function () {
    refreshNetworkMapping();
    refreshSourceExports();
    runAllSummaries();
    runWeeklySummaryEmail();
    return { success: true };
  });
}
