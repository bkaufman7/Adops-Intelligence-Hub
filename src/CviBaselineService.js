function refreshCviBaselineReference_() {
  return withRunLogging_('refreshCviBaselineReference_', function () {
    const sourceCfg = getCviSourceConfig_();
    const dataTabName = getConfigValue_(CONFIG_KEYS.CVI_BASELINE_TAB, 'Data');
    const retentionDays = parseInt(getConfigValue_(CONFIG_KEYS.CVI_BASELINE_RETENTION_DAYS, '7'), 10) || 7;

    const sourceSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
    const tab = sourceSs.getSheetByName(dataTabName);
    if (!tab) {
      throw new Error('CVI baseline tab not found: ' + dataTabName);
    }

    const values = tab.getDataRange().getValues();
    if (!values || values.length < 2) {
      logRun_('refreshCviBaselineReference_', RUN_STATUS.WARNING, 'No CVI baseline rows found', {
        spreadsheetId: sourceCfg.spreadsheetId,
        tab: dataTabName
      });
      return { sourceRows: 0, keptRows: 0, skippedRows: 0, totalBaselineRows: readTable_(SHEETS.CVI_DAILY_BASELINE).length };
    }

    const headers = values[0].map(String);
    const now = new Date();
    const snapshotDate = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const latestByPlacement = {};
    let skippedRows = 0;

    values.slice(1).forEach(function (row) {
      const data = {};
      headers.forEach(function (h, i) { data[h] = row[i]; });

      const placementId = String(data['Placement ID'] || '').trim();
      if (!placementId) {
        skippedRows += 1;
        return;
      }

      latestByPlacement[placementId] = {
        'Snapshot Date': snapshotDate,
        'Source System': SOURCE_SYSTEMS.PROJECT_2_CVI,
        'Source Project': sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_2_CVI,
        'Network ID': data['Network ID'] || '',
        'Advertiser ID': data['Advertiser ID'] || '',
        'Advertiser': data['Advertiser'] || '',
        'Campaign ID': data['Campaign ID'] || '',
        'Campaign': data['Campaign'] || '',
        'Placement ID': placementId,
        'Placement': data['Placement'] || '',
        'Impressions': data['Impressions'] || '',
        'Clicks': data['Clicks'] || '',
        'Import Timestamp': now,
        'Snapshot Key': snapshotDate + '|' + placementId,
        'Raw JSON Snapshot': JSON.stringify(data)
      };
    });

    const keptRows = Object.keys(latestByPlacement).map(function (placementId) {
      return latestByPlacement[placementId];
    });

    const existingRows = readTable_(SHEETS.CVI_DAILY_BASELINE);
    const cutoffDate = getDateOffsetString_(snapshotDate, -(Math.max(1, retentionDays) - 1));

    const retainedRows = existingRows.filter(function (row) {
      const d = normalizeSnapshotDate_(row['Snapshot Date']);
      if (!d) return false;
      if (d === snapshotDate) return false; // keep latest for today only
      return d >= cutoffDate;
    });

    const finalRows = retainedRows.concat(keptRows);

    clearAndWriteTable_(
      SHEETS.CVI_DAILY_BASELINE,
      CVI_BASELINE_COLUMNS,
      finalRows.map(function (r) { return toRow_(CVI_BASELINE_COLUMNS, r); })
    );

    return {
      sourceRows: values.length - 1,
      keptRows: keptRows.length,
      skippedRows: skippedRows,
      retainedRows: retainedRows.length,
      totalBaselineRows: finalRows.length,
      snapshotDate: snapshotDate,
      retentionDays: retentionDays,
      spreadsheetId: sourceCfg.spreadsheetId,
      tab: dataTabName
    };
  });
}

function normalizeSnapshotDate_(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    const d = value;
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  }

  const str = String(value).trim();
  if (!str) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return '';
}

function getCviSourceConfig_() {
  const sources = getEnabledSources_();
  const cvi = sources.find(function (s) {
    return s && s.sourceSystem === SOURCE_SYSTEMS.PROJECT_2_CVI;
  });

  if (!cvi) {
    throw new Error('Enabled source config not found for ' + SOURCE_SYSTEMS.PROJECT_2_CVI);
  }

  if (!cvi.spreadsheetId) {
    throw new Error('Missing spreadsheetId for ' + SOURCE_SYSTEMS.PROJECT_2_CVI);
  }

  return cvi;
}

function getDateOffsetString_(yyyyMmDd, dayDelta) {
  const parts = String(yyyyMmDd || '').split('-');
  if (parts.length !== 3) {
    return yyyyMmDd;
  }

  const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  base.setDate(base.getDate() + dayDelta);
  return Utilities.formatDate(base, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function startChunkedCviBaselineAndContinue_() {
  const action = 'startChunkedCviBaselineAndContinue_';
  const sourceCfg = getCviSourceConfig_();
  const dataTabName = getConfigValue_(CONFIG_KEYS.CVI_BASELINE_TAB, 'Data');
  const retentionDays = parseInt(getConfigValue_(CONFIG_KEYS.CVI_BASELINE_RETENTION_DAYS, '7'), 10) || 7;
  const sourceSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
  const tab = sourceSs.getSheetByName(dataTabName);
  if (!tab) {
    throw new Error('CVI baseline tab not found: ' + dataTabName);
  }

  const lastRow = tab.getLastRow();
  const lastColumn = tab.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    logRun_(action, RUN_STATUS.WARNING, 'No CVI baseline rows found for chunked runner', {
      spreadsheetId: sourceCfg.spreadsheetId,
      tab: dataTabName,
      lastRow: lastRow,
      lastColumn: lastColumn
    });
    return { sourceRows: 0, queued: false };
  }

  const snapshotDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const jobId = 'cvi-chunk-' + String(Date.now());
  const state = {
    jobId: jobId,
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
    sourceSpreadsheetId: sourceCfg.spreadsheetId,
    sourceTabName: dataTabName,
    sourceProject: sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_2_CVI,
    snapshotDate: snapshotDate,
    retentionDays: retentionDays,
    chunkSize: 4000,
    startRow: 2,
    cursorRow: 2,
    lastRow: lastRow,
    lastColumn: lastColumn,
    chunksCompleted: 0,
    sourceRowsScanned: 0,
    skippedRows: 0,
    stagedRows: 0,
    stagingSheetName: 'CVI_Baseline_Staging'
  };

  clearChunkedCviContinuationTrigger_('runChunkedCviBaselineContinuation');
  clearChunkedCviContinuationTrigger_('runChunkedCviBaselineFinalize');

  const stagingSheet = getOrCreateSheet_(state.stagingSheetName);
  stagingSheet.clearContents();
  stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);

  saveChunkedCviBaselineState_(state);
  const continuation = queueChunkedCviContinuation_('runChunkedCviBaselineContinuation', 45 * 1000);

  logRun_(action, RUN_STATUS.SUCCESS, 'Chunked CVI baseline pipeline initialized', {
    jobId: state.jobId,
    snapshotDate: state.snapshotDate,
    sourceSpreadsheetId: state.sourceSpreadsheetId,
    sourceTabName: state.sourceTabName,
    sourceRowsTotal: Math.max(0, state.lastRow - 1),
    chunkSize: state.chunkSize,
    retentionDays: state.retentionDays,
    continuation: continuation
  });

  return {
    jobId: state.jobId,
    snapshotDate: state.snapshotDate,
    sourceRowsTotal: Math.max(0, state.lastRow - 1),
    chunkSize: state.chunkSize,
    continuation: continuation
  };
}

function runChunkedCviBaselineContinuation() {
  return withRunLogging_('runChunkedCviBaselineContinuation', function () {
    const state = getChunkedCviBaselineState_();
    if (!state || !state.jobId) {
      throw new Error('Chunked CVI baseline state not found. Start with runBaselineAndFullRefresh.');
    }

    if (state.cursorRow > state.lastRow) {
      logRun_('runChunkedCviBaselineContinuation', RUN_STATUS.WARNING, 'No remaining source rows. Queuing finalize stage.', {
        jobId: state.jobId,
        cursorRow: state.cursorRow,
        lastRow: state.lastRow
      });
      const finalizeContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
      return { jobId: state.jobId, queuedFinalize: true, continuation: finalizeContinuation };
    }

    const sourceSs = SpreadsheetApp.openById(state.sourceSpreadsheetId);
    const tab = sourceSs.getSheetByName(state.sourceTabName);
    if (!tab) {
      throw new Error('CVI baseline tab not found during continuation: ' + state.sourceTabName);
    }

    const headers = tab.getRange(1, 1, 1, state.lastColumn).getValues()[0].map(String);
    const chunkStartRow = state.cursorRow;
    const chunkEndRow = Math.min(state.lastRow, chunkStartRow + state.chunkSize - 1);
    const chunkLength = Math.max(0, chunkEndRow - chunkStartRow + 1);
    if (chunkLength <= 0) {
      const finalizeContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
      return { jobId: state.jobId, queuedFinalize: true, continuation: finalizeContinuation };
    }

    logRun_('runChunkedCviBaselineContinuation', RUN_STATUS.RUNNING, 'Processing source chunk', {
      jobId: state.jobId,
      chunkNumber: state.chunksCompleted + 1,
      chunkStartRow: chunkStartRow,
      chunkEndRow: chunkEndRow,
      chunkLength: chunkLength,
      totalSourceRows: Math.max(0, state.lastRow - 1)
    });

    const values = tab.getRange(chunkStartRow, 1, chunkLength, state.lastColumn).getValues();
    const now = new Date();
    const outRows = [];
    let skippedInChunk = 0;

    values.forEach(function (row) {
      const data = {};
      headers.forEach(function (h, i) { data[h] = row[i]; });

      const placementId = String(data['Placement ID'] || '').trim();
      if (!placementId) {
        skippedInChunk += 1;
        return;
      }

      outRows.push(toRow_(CVI_BASELINE_COLUMNS, {
        'Snapshot Date': state.snapshotDate,
        'Source System': SOURCE_SYSTEMS.PROJECT_2_CVI,
        'Source Project': state.sourceProject,
        'Network ID': data['Network ID'] || '',
        'Advertiser ID': data['Advertiser ID'] || '',
        'Advertiser': data['Advertiser'] || '',
        'Campaign ID': data['Campaign ID'] || '',
        'Campaign': data['Campaign'] || '',
        'Placement ID': placementId,
        'Placement': data['Placement'] || '',
        'Impressions': data['Impressions'] || '',
        'Clicks': data['Clicks'] || '',
        'Import Timestamp': now,
        'Snapshot Key': state.snapshotDate + '|' + placementId,
        'Raw JSON Snapshot': JSON.stringify(data)
      }));
    });

    if (outRows.length) {
      appendRows_(state.stagingSheetName, [CVI_BASELINE_COLUMNS], outRows);
    }

    state.cursorRow = chunkEndRow + 1;
    state.chunksCompleted += 1;
    state.sourceRowsScanned += chunkLength;
    state.skippedRows += skippedInChunk;
    state.stagedRows += outRows.length;
    state.lastUpdatedAt = new Date().toISOString();
    saveChunkedCviBaselineState_(state);

    const hasMore = state.cursorRow <= state.lastRow;
    const completionPct = state.lastRow > 1
      ? Math.min(100, Math.round((state.sourceRowsScanned / Math.max(1, (state.lastRow - 1))) * 10000) / 100)
      : 100;

    logRun_('runChunkedCviBaselineContinuation', RUN_STATUS.SUCCESS, hasMore ? 'Chunk processed; continuation queued' : 'Final chunk processed; finalize queued', {
      jobId: state.jobId,
      chunkNumber: state.chunksCompleted,
      chunkStartRow: chunkStartRow,
      chunkEndRow: chunkEndRow,
      chunkLength: chunkLength,
      rowsWrittenToStaging: outRows.length,
      skippedRowsInChunk: skippedInChunk,
      sourceRowsScanned: state.sourceRowsScanned,
      stagedRows: state.stagedRows,
      skippedRowsTotal: state.skippedRows,
      cursorRowNext: state.cursorRow,
      totalSourceRows: Math.max(0, state.lastRow - 1),
      completionPct: completionPct
    });

    if (hasMore) {
      const continuation = queueChunkedCviContinuation_('runChunkedCviBaselineContinuation', 45 * 1000);
      return {
        jobId: state.jobId,
        hasMore: true,
        continuation: continuation,
        sourceRowsScanned: state.sourceRowsScanned,
        totalSourceRows: Math.max(0, state.lastRow - 1),
        completionPct: completionPct
      };
    }

    state.status = 'INGEST_COMPLETE';
    saveChunkedCviBaselineState_(state);
    const finalizeContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
    return {
      jobId: state.jobId,
      hasMore: false,
      queuedFinalize: true,
      continuation: finalizeContinuation,
      stagedRows: state.stagedRows,
      skippedRows: state.skippedRows
    };
  });
}

function runChunkedCviBaselineFinalize() {
  return withRunLogging_('runChunkedCviBaselineFinalize', function () {
    const state = getChunkedCviBaselineState_();
    if (!state || !state.jobId) {
      throw new Error('Chunked CVI baseline state not found at finalize stage.');
    }

    logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.RUNNING, 'Starting finalize phase (dedupe + retention + write)', {
      jobId: state.jobId,
      stagedRowsExpected: state.stagedRows,
      snapshotDate: state.snapshotDate,
      retentionDays: state.retentionDays
    });

    const stagedRows = readTable_(state.stagingSheetName);
    const latestByPlacement = {};
    let dedupeSkipped = 0;

    stagedRows.forEach(function (row) {
      const placementId = String(row['Placement ID'] || '').trim();
      if (!placementId) {
        dedupeSkipped += 1;
        return;
      }
      latestByPlacement[placementId] = row;
    });

    const keptRows = Object.keys(latestByPlacement).map(function (placementId) {
      return latestByPlacement[placementId];
    });

    const existingRows = readTable_(SHEETS.CVI_DAILY_BASELINE);
    const cutoffDate = getDateOffsetString_(state.snapshotDate, -(Math.max(1, state.retentionDays) - 1));
    const retainedRows = existingRows.filter(function (row) {
      const d = normalizeSnapshotDate_(row['Snapshot Date']);
      if (!d) return false;
      if (d === state.snapshotDate) return false;
      return d >= cutoffDate;
    });

    const finalRows = retainedRows.concat(keptRows);

    logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.RUNNING, 'Writing final baseline table', {
      jobId: state.jobId,
      stagedRowsRead: stagedRows.length,
      dedupeSkippedRows: dedupeSkipped,
      uniquePlacementsKept: keptRows.length,
      retainedRowsFromHistory: retainedRows.length,
      finalRowsToWrite: finalRows.length,
      cutoffDate: cutoffDate
    });

    clearAndWriteTableChunked_(
      SHEETS.CVI_DAILY_BASELINE,
      CVI_BASELINE_COLUMNS,
      finalRows.map(function (r) { return toRow_(CVI_BASELINE_COLUMNS, r); }),
      800
    );

    const stagingSheet = getOrCreateSheet_(state.stagingSheetName);
    stagingSheet.clearContents();
    stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);

    clearChunkedCviBaselineState_();

    const downstreamContinuation = queueBaselineRefreshContinuation_();

    logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Finalize complete. Source exports continuation queued.', {
      jobId: state.jobId,
      snapshotDate: state.snapshotDate,
      sourceRowsScanned: state.sourceRowsScanned,
      stagedRows: state.stagedRows,
      skippedRows: state.skippedRows,
      keptRows: keptRows.length,
      retainedRows: retainedRows.length,
      totalBaselineRows: finalRows.length,
      continuation: downstreamContinuation
    });

    return {
      jobId: state.jobId,
      snapshotDate: state.snapshotDate,
      sourceRowsScanned: state.sourceRowsScanned,
      stagedRows: state.stagedRows,
      skippedRows: state.skippedRows,
      keptRows: keptRows.length,
      retainedRows: retainedRows.length,
      totalBaselineRows: finalRows.length,
      continuation: downstreamContinuation
    };
  });
}

function getChunkedCviBaselineState_() {
  const raw = PropertiesService.getScriptProperties().getProperty('CVI_BASELINE_CHUNK_STATE');
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

function saveChunkedCviBaselineState_(state) {
  PropertiesService.getScriptProperties().setProperty('CVI_BASELINE_CHUNK_STATE', JSON.stringify(state || {}));
}

function clearChunkedCviBaselineState_() {
  PropertiesService.getScriptProperties().deleteProperty('CVI_BASELINE_CHUNK_STATE');
}

function queueChunkedCviContinuation_(handlerName, delayMs) {
  clearChunkedCviContinuationTrigger_(handlerName);

  const safeDelayMs = Math.max(30 * 1000, Number(delayMs) || (45 * 1000));
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

function clearChunkedCviContinuationTrigger_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
