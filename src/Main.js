function refreshSourceExports() {
  return importFromConfiguredSources_();
}

function refreshCviBaselineReference() {
  return refreshCviBaselineReference_();
}

function runAllSummaries() {
  return withRunLogging_('runAllSummaries', function () {
    const result = {};

    result.normalizeRawEvents = runLoggedStep_('runAllSummaries', 'normalizeRawEvents_', function () {
      return normalizeRawEvents_();
    });
    result.crossEnrichLedger = runLoggedStep_('runAllSummaries', 'crossEnrichLedger_', function () {
      return crossEnrichLedger_();
    });
    result.buildSummaries = runLoggedStep_('runAllSummaries', 'buildSummaries_', function () {
      return buildSummaries_();
    });
    result.buildTrends = runLoggedStep_('runAllSummaries', 'buildTrends_', function () {
      return buildTrends_();
    });

    return result;
  });
}

function runFullRefresh() {
  return withRunLogging_('runFullRefresh', function () {
    const result = {};

    result.refreshSourceExports = runLoggedStep_('runFullRefresh', '1. Refresh Source Exports', function () {
      return refreshSourceExports();
    });

    result.runAllSummaries = runLoggedStep_('runFullRefresh', '2. Run All Summaries', function () {
      return runAllSummaries();
    });

    logRun_('runFullRefresh', RUN_STATUS.SUCCESS, '✅ Full refresh completed successfully (CVI Baseline skipped - run separately if needed)', {
      totalSteps: 2,
      sourceExportResult: result.refreshSourceExports,
      summariesResult: result.runAllSummaries,
      note: 'CVI Baseline refresh takes 2-3 minutes and is skipped to avoid timeout. Run separately if needed.'
    });

    return result;
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

function runInitialHubSetup() {
  return withRunLogging_('runInitialHubSetup', function () {
    const result = {};

    result.setupProjectSheets = runLoggedStep_('runInitialHubSetup', 'setupProjectSheets', function () { return setupProjectSheets(); });
    result.initializeHubDriveFolders = runLoggedStep_('runInitialHubSetup', 'initializeHubDriveFolders', function () { return initializeHubDriveFolders(); });
    result.refreshNetworkMapping = runLoggedStep_('runInitialHubSetup', 'refreshNetworkMapping', function () { return refreshNetworkMapping(); });

    result.sourceConfiguration = summarizeSourceConfiguration_();
    logRun_(
      'runInitialHubSetup',
      result.sourceConfiguration.needsConfiguration.length || result.sourceConfiguration.invalidConfigKeys.length
        ? RUN_STATUS.WARNING
        : RUN_STATUS.SUCCESS,
      'Source configuration status',
      result.sourceConfiguration
    );

    result.refreshSourceExports = runLoggedStep_('runInitialHubSetup', 'refreshSourceExports', function () { return refreshSourceExports(); });

    result.sourceImportStatus = summarizeSourceImportStatus_(result.refreshSourceExports, result.sourceConfiguration);
    logRun_(
      'runInitialHubSetup',
      result.sourceImportStatus.failedSources.length || result.sourceImportStatus.pendingConfiguration.length
        ? RUN_STATUS.WARNING
        : RUN_STATUS.SUCCESS,
      'Source import status',
      result.sourceImportStatus
    );

    result.runAllSummaries = runLoggedStep_('runInitialHubSetup', 'runAllSummaries', function () { return runAllSummaries(); });

    return result;
  });
}

function runLoggedStep_(parentAction, stepName, fn) {
  const startedAt = new Date();
  logRun_(parentAction, RUN_STATUS.RUNNING, 'Starting step: ' + stepName, {
    stepName: stepName,
    startedAt: startedAt
  });

  try {
    const stepResult = fn();
    const finishedAt = new Date();
    logRun_(parentAction, RUN_STATUS.SUCCESS, 'Completed step: ' + stepName, {
      stepName: stepName,
      startedAt: startedAt,
      finishedAt: finishedAt,
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      result: stepResult || null
    });
    return stepResult;
  } catch (err) {
    const failedAt = new Date();
    logRun_(parentAction, RUN_STATUS.ERROR, 'Failed step: ' + stepName + ' :: ' + String(err), {
      stepName: stepName,
      startedAt: startedAt,
      failedAt: failedAt,
      elapsedMs: failedAt.getTime() - startedAt.getTime(),
      stack: err && err.stack ? err.stack : ''
    });
    throw new Error(parentAction + ' failed at ' + stepName + ': ' + String(err));
  }
}

function summarizeSourceConfiguration_() {
  const expectedSources = Object.keys(SOURCE_SYSTEMS).map(function (k) {
    return SOURCE_SYSTEMS[k];
  });

  const map = getConfigMap_();
  const sourceKeys = Object.keys(map).filter(function (key) {
    return key.indexOf(CONFIG_KEYS.SOURCE_PREFIX) === 0;
  });

  const parsedBySource = {};
  const invalidConfigKeys = [];

  sourceKeys.forEach(function (key) {
    const payload = map[key];
    if (!payload) return;

    try {
      const cfg = JSON.parse(payload);
      const sourceName = String(cfg.sourceSystem || '').trim();
      if (!sourceName) return;

      parsedBySource[sourceName] = {
        enabled: !!cfg.enabled,
        spreadsheetId: String(cfg.spreadsheetId || '').trim(),
        exportTab: String(cfg.exportTab || '').trim()
      };
    } catch (err) {
      invalidConfigKeys.push(key);
    }
  });

  const readySources = [];
  const needsConfiguration = [];

  expectedSources.forEach(function (sourceName) {
    const cfg = parsedBySource[sourceName];
    if (!cfg) {
      needsConfiguration.push({ source: sourceName, reason: 'Missing source config entry' });
      return;
    }
    if (!cfg.enabled) {
      needsConfiguration.push({ source: sourceName, reason: 'Source is disabled (enabled=false)' });
      return;
    }
    if (!cfg.spreadsheetId || !cfg.exportTab) {
      needsConfiguration.push({ source: sourceName, reason: 'Missing spreadsheetId or exportTab' });
      return;
    }
    readySources.push(sourceName);
  });

  return {
    expectedSources: expectedSources,
    readySources: readySources,
    needsConfiguration: needsConfiguration,
    invalidConfigKeys: invalidConfigKeys
  };
}

function summarizeSourceImportStatus_(importResult, configStatus) {
  const imported = (importResult && importResult.imported) ? importResult.imported : [];
  const failed = (importResult && importResult.failed) ? importResult.failed : [];

  return {
    importedSources: imported.map(function (x) { return x.source; }),
    importedRowCounts: imported,
    failedSources: failed,
    pendingConfiguration: (configStatus && configStatus.needsConfiguration) ? configStatus.needsConfiguration : []
  };
}
