function refreshSourceExports() {
  return withRunLogging_('refreshSourceExports', function () {
    const result = {};
    result.imported = importFromConfiguredSources_();
    // CVI Baseline refresh is intentionally separate — it takes ~4 minutes and
    // would exceed the 6-minute Apps Script limit when combined with imports.
    // Use "Refresh CVI Baseline (Data Tab)" from the menu to update it independently.
    return result;
  });
}

function refreshCviBaselineReference() {
  return refreshCviBaselineReference_();
}

function buildNetworkGrading() {
  return withRunLogging_('buildNetworkGrading', function () {
    return buildNetworkGrading_();
  });
}

function buildRepGrading() {
  return withRunLogging_('buildRepGrading', function () {
    return buildRepGrading_();
  });
}

function buildAdvertiserGrading() {
  return withRunLogging_('buildAdvertiserGrading', function () {
    return buildAdvertiserGrading_();
  });
}

function setupDailyTrigger() {
  // Backward-compatible wrapper for existing menu/actions.
  return configureAutomationTriggers();
}

function configureAutomationTriggers() {
  return withRunLogging_('setupDailyTrigger', function () {
    // Remove existing automation triggers to avoid duplicates.
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function (trigger) {
      const handler = trigger.getHandlerFunction();
      if (handler === 'runFullRefresh' || handler === 'runFullRefreshContinuation') {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    // Create one daily kickoff trigger. runFullRefresh queues continuation automatically.
    ScriptApp.newTrigger('runFullRefresh')
      .timeBased()
      .atHour(6)
      .everyDays(1)
      .create();

    logRun_('setupDailyTrigger', RUN_STATUS.SUCCESS, 'Automation trigger configured for 6 AM kickoff', {
      function: 'runFullRefresh',
      schedule: 'Daily at 6:00 AM',
      continuation: 'runFullRefreshContinuation is queued automatically by runFullRefresh'
    });

    return {
      success: true,
      schedule: 'Daily at 6:00 AM',
      kickoffFunction: 'runFullRefresh',
      continuationFunction: 'runFullRefreshContinuation (auto-queued)'
    };
  });
}

function removeDailyTrigger() {
  return withRunLogging_('removeDailyTrigger', function () {
    const triggers = ScriptApp.getProjectTriggers();
    let removed = 0;
    triggers.forEach(function (trigger) {
      const handler = trigger.getHandlerFunction();
      if (handler === 'runFullRefresh' || handler === 'runFullRefreshContinuation') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });

    logRun_('removeDailyTrigger', RUN_STATUS.SUCCESS, 'Daily triggers removed', {
      triggersRemoved: removed
    });

    return { success: true, triggersRemoved: removed };
  });
}
function runAllSummaries(skipCrossEnrich) {
  return withRunLogging_('runAllSummaries', function () {
    const startedAtMs = Date.now();
    const result = {};

    result.normalizeRawEvents = runLoggedStep_('runAllSummaries', 'normalizeRawEvents_', function () {
      return normalizeRawEvents_();
    });
    
    // Cross-enrichment adds "Also Flagged By" columns but takes 1-2 minutes
    // Skip in fast mode to avoid timeouts
    if (!skipCrossEnrich) {
      result.crossEnrichLedger = runLoggedStep_('runAllSummaries', 'crossEnrichLedger_', function () {
        return crossEnrichLedger_();
      });
    } else {
      result.crossEnrichLedger = { skipped: true, reason: 'Fast mode - cross-enrichment disabled' };
    }
    
    if (skipCrossEnrich) {
      result.buildSummaries = runLoggedStep_('runAllSummaries', 'buildSummariesCore_', function () {
        return buildSummariesCore_();
      });
    } else {
      result.buildSummaries = runLoggedStep_('runAllSummaries', 'buildSummaries_', function () {
        return buildSummaries_();
      });
    }
    result.buildTrends = runLoggedStep_('runAllSummaries', 'buildTrends_', function () {
      return buildTrends_();
    });
    result.buildNetworkGrading = runLoggedStep_('runAllSummaries', 'buildNetworkGrading_', function () {
      return buildNetworkGrading_();
    });

    if (skipCrossEnrich) {
      // Fast mode: always defer heavy grading to avoid timeouts and lock contention.
      result.buildRepGrading = { skipped: true, reason: 'Deferred to continuation in fast mode' };
      result.buildAdvertiserGrading = { skipped: true, reason: 'Deferred to continuation in fast mode' };
      result.executiveArtifactsContinuation = runLoggedStep_('runAllSummaries', 'queueExecutiveArtifactsContinuation_', function () {
        return queueExecutiveArtifactsContinuation_();
      });
    } else if (shouldDeferHeavyGrading_(startedAtMs)) {
      result.buildRepGrading = { skipped: true, reason: 'Deferred to continuation to avoid timeout' };
      result.buildAdvertiserGrading = { skipped: true, reason: 'Deferred to continuation to avoid timeout' };
      result.gradingContinuation = runLoggedStep_('runAllSummaries', 'queueDeferredGradingContinuation_', function () {
        return queueDeferredGradingContinuation_();
      });
    } else {
      result.buildRepGrading = runLoggedStep_('runAllSummaries', 'buildRepGrading_', function () {
        return buildRepGrading_();
      });
      result.buildAdvertiserGrading = runLoggedStep_('runAllSummaries', 'buildAdvertiserGrading_', function () {
        return buildAdvertiserGrading_();
      });
    }

    // Generate unmapped networks summary last (non-critical, skip if time runs out)
    try {
      if (result.normalizeRawEvents && result.normalizeRawEvents.missingMappingCounts) {
        writeUnmappedNetworksSummary_(result.normalizeRawEvents.missingMappingCounts);
      }
    } catch (e) {
      // Ignore errors - unmapped summary is nice-to-have
    }

    return result;
  });
}

function runDeferredGradingContinuation() {
  return withRunLogging_('runDeferredGradingContinuation', function () {
    const result = {};

    result.buildRepGrading = runLoggedStep_('runDeferredGradingContinuation', 'buildRepGrading_', function () {
      return buildRepGrading_();
    });

    result.advertiserGradingContinuation = runLoggedStep_('runDeferredGradingContinuation', 'queueDeferredAdvertiserGradingContinuation_', function () {
      return queueDeferredAdvertiserGradingContinuation_();
    });

    return result;
  });
}

function runDeferredAdvertiserGradingContinuation() {
  return withRunLogging_('runDeferredAdvertiserGradingContinuation', function () {
    const result = {};

    result.buildAdvertiserGrading = runLoggedStep_('runDeferredAdvertiserGradingContinuation', 'buildAdvertiserGrading_', function () {
      return buildAdvertiserGrading_();
    });

    return result;
  });
}

function runExecutiveArtifactsContinuation() {
  return withRunLogging_('runExecutiveArtifactsContinuation', function () {
    const result = {};

    result.buildExecutiveSnapshot = runLoggedStep_('runExecutiveArtifactsContinuation', 'buildExecutiveSnapshotOnly_', function () {
      return buildExecutiveSnapshotOnly_();
    });

    result.presentationContinuation = runLoggedStep_('runExecutiveArtifactsContinuation', 'queuePresentationViewContinuation_', function () {
      return queuePresentationViewContinuation_();
    });

    return result;
  });
}

function runPresentationViewContinuation() {
  return withRunLogging_('runPresentationViewContinuation', function () {
    const result = {};

    result.buildPresentationView = runLoggedStep_('runPresentationViewContinuation', 'buildPresentationViewOnly_', function () {
      return buildPresentationViewOnly_();
    });

    result.gradingContinuation = runLoggedStep_('runPresentationViewContinuation', 'queueDeferredGradingContinuation_', function () {
      return queueDeferredGradingContinuation_();
    });

    return result;
  });
}

function queueDeferredGradingContinuation_() {
  const handlerName = 'runDeferredGradingContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 90 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: delayMs
  };
}

function queueDeferredAdvertiserGradingContinuation_() {
  const handlerName = 'runDeferredAdvertiserGradingContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 90 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: delayMs
  };
}

function queueExecutiveArtifactsContinuation_() {
  const handlerName = 'runExecutiveArtifactsContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 90 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: delayMs
  };
}

function queuePresentationViewContinuation_() {
  const handlerName = 'runPresentationViewContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 90 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: delayMs
  };
}

function shouldDeferHeavyGrading_(startedAtMs) {
  // Apps Script hard limit is ~6 minutes. Defer heavy grading if run has
  // already used most of the budget.
  const elapsedMs = Date.now() - startedAtMs;
  return elapsedMs >= 240000;
}

function runAllSummariesFast() {
  return runAllSummaries(true);
}

/**
 * One-button full pipeline (continuation-safe):
 *
 * Stage 1 (this function): CVI Baseline only (~3-4 min), then queues Stage 2.
 * Stage 2 (runBaselineRefreshContinuation): Source exports, then queues summaries/grading chain.
 * Remaining stages: existing runFullRefreshContinuation → executive → presentation → grading chain.
 *
 * Each stage stays well under the 6-minute Apps Script limit.
 */
function runBaselineAndFullRefresh() {
  return withRunLogging_('runBaselineAndFullRefresh', function () {
    const result = {};

    result.refreshCviBaseline = runLoggedStep_('runBaselineAndFullRefresh', '1. Refresh CVI Baseline', function () {
      return refreshCviBaselineReference_();
    });

    result.continuation = runLoggedStep_('runBaselineAndFullRefresh', '2. Queue Source Exports Continuation', function () {
      return queueBaselineRefreshContinuation_();
    });

    logRun_('runBaselineAndFullRefresh', RUN_STATUS.SUCCESS,
      '✅ CVI Baseline done. Source exports + summaries/grading queued via continuation chain.',
      {
        baselineResult: result.refreshCviBaseline,
        nextStep: 'runBaselineRefreshContinuation triggers in ~60s'
      }
    );

    return result;
  });
}

function runBaselineRefreshContinuation() {
  return withRunLogging_('runBaselineRefreshContinuation', function () {
    const result = {};

    result.refreshSourceExports = runLoggedStep_('runBaselineRefreshContinuation', '1. Refresh Source Exports', function () {
      return refreshSourceExports();
    });

    result.continuation = runLoggedStep_('runBaselineRefreshContinuation', '2. Queue Summaries + Grading Continuation', function () {
      return queueRunFullRefreshContinuation_();
    });

    logRun_('runBaselineRefreshContinuation', RUN_STATUS.SUCCESS,
      '✅ Source exports done. Summaries/grading queued via continuation chain.',
      {
        sourceResult: result.refreshSourceExports,
        nextStep: 'runFullRefreshContinuation triggers in ~60s, then executive/grading continuations follow automatically'
      }
    );

    return result;
  });
}

function queueBaselineRefreshContinuation_() {
  const handlerName = 'runBaselineRefreshContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 60 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return { handler: handlerName, scheduledFor: runAt, delayMs: delayMs };
}

function runFullRefresh() {
  return withRunLogging_('runFullRefresh', function () {
    const result = {};

    result.refreshSourceExports = runLoggedStep_('runFullRefresh', '1. Refresh Source Exports', function () {
      return refreshSourceExports();
    });

    result.continuation = runLoggedStep_('runFullRefresh', '2. Queue Summaries Continuation', function () {
      return queueRunFullRefreshContinuation_();
    });

    logRun_('runFullRefresh', RUN_STATUS.SUCCESS, '✅ Source refresh completed. Summaries queued in continuation trigger.', {
      totalSteps: 2,
      sourceExportResult: result.refreshSourceExports,
      continuation: result.continuation,
      note: 'Imports can consume most of the 6-minute Apps Script limit. Summaries are run in a separate one-time continuation trigger to avoid timeout. CVI Baseline remains a separate manual refresh.'
    });

    return result;
  });
}

function runFullRefreshContinuation() {
  return withRunLogging_('runFullRefreshContinuation', function () {
    const result = {};

    result.runAllSummaries = runLoggedStep_('runFullRefreshContinuation', 'Run All Summaries Fast (timeout-safe)', function () {
      return runAllSummariesFast();
    });

    logRun_('runFullRefreshContinuation', RUN_STATUS.SUCCESS, '✅ Continuation summaries completed successfully.', {
      summariesResult: result.runAllSummaries,
      note: 'This continuation is queued by runFullRefresh to stay under Apps Script execution limits. Fast mode is used for time-driven reliability.'
    });

    return result;
  });
}

function queueRunFullRefreshContinuation_() {
  const handlerName = 'runFullRefreshContinuation';
  const triggers = ScriptApp.getProjectTriggers();

  // Keep only one pending continuation trigger at a time.
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const delayMs = 60 * 1000;
  const runAt = new Date(Date.now() + delayMs);

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .at(runAt)
    .create();

  return {
    handler: handlerName,
    scheduledFor: runAt,
    delayMs: delayMs
  };
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

function setIssueTypeModeRaw() {
  return withRunLogging_('setIssueTypeModeRaw', function () {
    PropertiesService.getScriptProperties().setProperty('ISSUE_TYPE_MODE', 'RAW');
    return { issueTypeMode: 'RAW' };
  });
}

function setIssueTypeModeClean() {
  return withRunLogging_('setIssueTypeModeClean', function () {
    PropertiesService.getScriptProperties().setProperty('ISSUE_TYPE_MODE', 'CLEAN');
    return { issueTypeMode: 'CLEAN' };
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
