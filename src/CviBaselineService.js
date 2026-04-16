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
  const sourceSs = withSpreadsheetRetry_('chunked baseline kickoff open source spreadsheet', function () {
    return SpreadsheetApp.openById(sourceCfg.spreadsheetId);
  });
  const tab = withSpreadsheetRetry_('chunked baseline kickoff open source tab', function () {
    return sourceSs.getSheetByName(dataTabName);
  });
  if (!tab) {
    throw new Error('CVI baseline tab not found: ' + dataTabName);
  }

  const lastRow = withSpreadsheetRetry_('chunked baseline kickoff get source lastRow', function () {
    return tab.getLastRow();
  });
  const lastColumn = withSpreadsheetRetry_('chunked baseline kickoff get source lastColumn', function () {
    return tab.getLastColumn();
  });
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

  ensureChunkedCviStagingSheet_(state.stagingSheetName);

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
    return withChunkStateFailover_('runChunkedCviBaselineContinuation', function () {
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

      ensureChunkedCviStagingSheet_(state.stagingSheetName);

      const sourceSs = withSpreadsheetRetry_('chunked baseline continuation open source spreadsheet', function () {
        return SpreadsheetApp.openById(state.sourceSpreadsheetId);
      });
      const tab = withSpreadsheetRetry_('chunked baseline continuation open source tab', function () {
        return sourceSs.getSheetByName(state.sourceTabName);
      });
      if (!tab) {
        throw new Error('CVI baseline tab not found during continuation: ' + state.sourceTabName);
      }

      const headers = withSpreadsheetRetry_('chunked baseline continuation read headers', function () {
        return tab.getRange(1, 1, 1, state.lastColumn).getValues()[0].map(String);
      });
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

      const values = withSpreadsheetRetry_('chunked baseline continuation read chunk values', function () {
        return tab.getRange(chunkStartRow, 1, chunkLength, state.lastColumn).getValues();
      });
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
        withSpreadsheetRetry_('chunked baseline continuation append staging rows', function () {
          appendRows_(state.stagingSheetName, [CVI_BASELINE_COLUMNS], outRows);
          return true;
        });
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
    }, function (state, err) {
      if (!state || !state.jobId || !isRetryableSpreadsheetError_(err)) {
        return null;
      }

      const retryContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineContinuation', 75 * 1000);
      logRun_('runChunkedCviBaselineContinuation', RUN_STATUS.WARNING,
        'Retryable Spreadsheet timeout in chunk continuation. Re-queued next continuation.', {
          jobId: state.jobId,
          cursorRow: state.cursorRow,
          lastRow: state.lastRow,
          error: String(err),
          continuation: retryContinuation
        }
      );
      return {
        jobId: state.jobId,
        requeuedAfterRetryableError: true,
        error: String(err),
        continuation: retryContinuation
      };
    });
  });
}

function runChunkedCviBaselineFinalize() {
  return withRunLogging_('runChunkedCviBaselineFinalize', function () {
    return withChunkStateFailover_('runChunkedCviBaselineFinalize', function () {
      const state = getChunkedCviBaselineState_();
      if (!state || !state.jobId) {
        throw new Error('Chunked CVI baseline state not found at finalize stage.');
      }

      if (!state.finalizePhase) {
        return initializeChunkedFinalizeState_(state);
      }

      if (state.finalizePhase === 'COPY_RETAINED') {
        return processChunkedFinalizeRetainedChunk_(state);
      }

      if (state.finalizePhase === 'APPEND_STAGED') {
        return processChunkedFinalizeStagedChunk_(state);
      }

      if (state.finalizePhase === 'SWAP_AND_FINISH') {
        return finishChunkedFinalizeAndQueuePipeline_(state);
      }

      throw new Error('Unknown chunked finalize phase: ' + state.finalizePhase);
    }, function (state, err) {
      if (!state || !state.jobId || !isRetryableSpreadsheetError_(err)) {
        return null;
      }

      const retryContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 90 * 1000);
      logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.WARNING,
        'Retryable Spreadsheet timeout in finalize stage. Re-queued finalize continuation.', {
          jobId: state.jobId,
          error: String(err),
          continuation: retryContinuation
        }
      );
      return {
        jobId: state.jobId,
        requeuedAfterRetryableError: true,
        error: String(err),
        continuation: retryContinuation
      };
    });
  });
}

function initializeChunkedFinalizeState_(state) {
  const baselineSourceSheetName = SHEETS.CVI_DAILY_BASELINE;
  const baselineOutputSheetName = 'CVI_Baseline_Next';
  const cutoffDate = getDateOffsetString_(state.snapshotDate, -(Math.max(1, state.retentionDays) - 1));

  withSpreadsheetRetry_('chunked finalize initialize output sheet', function () {
    const outputSheet = getOrCreateSheet_(baselineOutputSheetName);
    outputSheet.clearContents();
    outputSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);
    return true;
  });

  const baselineSourceLastRow = withSpreadsheetRetry_('chunked finalize read baseline source lastRow', function () {
    return getOrCreateSheet_(baselineSourceSheetName).getLastRow();
  });

  const stagingLastRow = withSpreadsheetRetry_('chunked finalize read staging lastRow', function () {
    return getOrCreateSheet_(state.stagingSheetName).getLastRow();
  });

  state.finalizePhase = 'COPY_RETAINED';
  state.finalizeChunkSize = 3000;
  state.finalizeCutoffDate = cutoffDate;
  state.finalizeBaselineSourceSheetName = baselineSourceSheetName;
  state.finalizeOutputSheetName = baselineOutputSheetName;
  state.finalizeBaselineCursorRow = 2;
  state.finalizeBaselineLastRow = baselineSourceLastRow;
  state.finalizeStagingCursorRow = 2;
  state.finalizeStagingLastRow = stagingLastRow;
  state.finalizeRetainedRows = 0;
  state.finalizeStagedRowsAppended = 0;
  state.finalizeOutputRows = 0;
  state.finalizeStartedAt = new Date().toISOString();
  saveChunkedCviBaselineState_(state);

  const continuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);

  logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.RUNNING, 'Initialized chunked finalize state', {
    jobId: state.jobId,
    snapshotDate: state.snapshotDate,
    retentionDays: state.retentionDays,
    cutoffDate: state.finalizeCutoffDate,
    baselineSourceLastRow: state.finalizeBaselineLastRow,
    stagingLastRow: state.finalizeStagingLastRow,
    finalizeChunkSize: state.finalizeChunkSize,
    continuation: continuation
  });

  return {
    jobId: state.jobId,
    finalizePhase: state.finalizePhase,
    continuation: continuation
  };
}

function processChunkedFinalizeRetainedChunk_(state) {
  const sourceSheet = getOrCreateSheet_(state.finalizeBaselineSourceSheetName || SHEETS.CVI_DAILY_BASELINE);
  const outputSheet = getOrCreateSheet_(state.finalizeOutputSheetName || 'CVI_Baseline_Next');

  if (state.finalizeBaselineCursorRow > state.finalizeBaselineLastRow) {
    state.finalizePhase = 'APPEND_STAGED';
    saveChunkedCviBaselineState_(state);
    const phaseContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
    logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Retained copy phase complete; moving to staged append phase', {
      jobId: state.jobId,
      retainedRows: state.finalizeRetainedRows,
      outputRows: state.finalizeOutputRows,
      continuation: phaseContinuation
    });
    return {
      jobId: state.jobId,
      finalizePhase: state.finalizePhase,
      retainedRows: state.finalizeRetainedRows,
      continuation: phaseContinuation
    };
  }

  const startRow = state.finalizeBaselineCursorRow;
  const endRow = Math.min(state.finalizeBaselineLastRow, startRow + state.finalizeChunkSize - 1);
  const rowCount = Math.max(0, endRow - startRow + 1);

  const chunkValues = withSpreadsheetRetry_('chunked finalize read retained source chunk', function () {
    return sourceSheet.getRange(startRow, 1, rowCount, CVI_BASELINE_COLUMNS.length).getValues();
  });

  const retainedChunk = [];
  for (var i = 0; i < chunkValues.length; i++) {
    const row = chunkValues[i];
    const snapshotDate = normalizeSnapshotDate_(row[0]);
    if (!snapshotDate) {
      continue;
    }
    if (snapshotDate === state.snapshotDate) {
      continue;
    }
    if (snapshotDate >= state.finalizeCutoffDate) {
      retainedChunk.push(row);
    }
  }

  if (retainedChunk.length) {
    withSpreadsheetRetry_('chunked finalize append retained chunk to output', function () {
      const outputStartRow = outputSheet.getLastRow() + 1;
      outputSheet.getRange(outputStartRow, 1, retainedChunk.length, CVI_BASELINE_COLUMNS.length).setValues(retainedChunk);
      return true;
    });
  }

  state.finalizeBaselineCursorRow = endRow + 1;
  state.finalizeRetainedRows += retainedChunk.length;
  state.finalizeOutputRows += retainedChunk.length;
  state.lastUpdatedAt = new Date().toISOString();
  saveChunkedCviBaselineState_(state);

  const completionPct = state.finalizeBaselineLastRow > 1
    ? Math.min(100, Math.round(((state.finalizeBaselineCursorRow - 2) / Math.max(1, state.finalizeBaselineLastRow - 1)) * 10000) / 100)
    : 100;

  const continuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
  logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Copied retained baseline chunk', {
    jobId: state.jobId,
    phase: 'COPY_RETAINED',
    sourceStartRow: startRow,
    sourceEndRow: endRow,
    sourceRowCount: rowCount,
    retainedRowsInChunk: retainedChunk.length,
    retainedRowsTotal: state.finalizeRetainedRows,
    outputRowsTotal: state.finalizeOutputRows,
    completionPct: completionPct,
    continuation: continuation
  });

  return {
    jobId: state.jobId,
    finalizePhase: state.finalizePhase,
    retainedRowsTotal: state.finalizeRetainedRows,
    continuation: continuation
  };
}

function processChunkedFinalizeStagedChunk_(state) {
  const stagingSheet = getOrCreateSheet_(state.stagingSheetName);
  const outputSheet = getOrCreateSheet_(state.finalizeOutputSheetName || 'CVI_Baseline_Next');

  if (state.finalizeStagingCursorRow > state.finalizeStagingLastRow) {
    state.finalizePhase = 'SWAP_AND_FINISH';
    saveChunkedCviBaselineState_(state);
    const phaseContinuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
    logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Staged append phase complete; moving to swap/finish', {
      jobId: state.jobId,
      stagedRowsAppended: state.finalizeStagedRowsAppended,
      outputRows: state.finalizeOutputRows,
      continuation: phaseContinuation
    });
    return {
      jobId: state.jobId,
      finalizePhase: state.finalizePhase,
      stagedRowsAppended: state.finalizeStagedRowsAppended,
      continuation: phaseContinuation
    };
  }

  const startRow = state.finalizeStagingCursorRow;
  const endRow = Math.min(state.finalizeStagingLastRow, startRow + state.finalizeChunkSize - 1);
  const rowCount = Math.max(0, endRow - startRow + 1);

  const chunkValues = withSpreadsheetRetry_('chunked finalize read staged chunk', function () {
    return stagingSheet.getRange(startRow, 1, rowCount, CVI_BASELINE_COLUMNS.length).getValues();
  });

  if (chunkValues.length) {
    withSpreadsheetRetry_('chunked finalize append staged chunk to output', function () {
      const outputStartRow = outputSheet.getLastRow() + 1;
      outputSheet.getRange(outputStartRow, 1, chunkValues.length, CVI_BASELINE_COLUMNS.length).setValues(chunkValues);
      return true;
    });
  }

  state.finalizeStagingCursorRow = endRow + 1;
  state.finalizeStagedRowsAppended += chunkValues.length;
  state.finalizeOutputRows += chunkValues.length;
  state.lastUpdatedAt = new Date().toISOString();
  saveChunkedCviBaselineState_(state);

  const completionPct = state.finalizeStagingLastRow > 1
    ? Math.min(100, Math.round(((state.finalizeStagingCursorRow - 2) / Math.max(1, state.finalizeStagingLastRow - 1)) * 10000) / 100)
    : 100;

  const continuation = queueChunkedCviContinuation_('runChunkedCviBaselineFinalize', 45 * 1000);
  logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Appended staged snapshot chunk', {
    jobId: state.jobId,
    phase: 'APPEND_STAGED',
    stagingStartRow: startRow,
    stagingEndRow: endRow,
    chunkRowsAppended: chunkValues.length,
    stagedRowsAppendedTotal: state.finalizeStagedRowsAppended,
    outputRowsTotal: state.finalizeOutputRows,
    completionPct: completionPct,
    continuation: continuation
  });

  return {
    jobId: state.jobId,
    finalizePhase: state.finalizePhase,
    stagedRowsAppendedTotal: state.finalizeStagedRowsAppended,
    continuation: continuation
  };
}

function finishChunkedFinalizeAndQueuePipeline_(state) {
  const ss = SpreadsheetApp.getActive();
  const oldBaseline = getOrCreateSheet_(SHEETS.CVI_DAILY_BASELINE);
  const outputSheet = getOrCreateSheet_(state.finalizeOutputSheetName || 'CVI_Baseline_Next');

  withSpreadsheetRetry_('chunked finalize swap sheets', function () {
    // Keep a temporary name to avoid naming conflict while swapping.
    const oldName = oldBaseline.getName();
    oldBaseline.setName('CVI_Baseline_Old_' + String(Date.now()));
    outputSheet.setName(oldName);
    ss.deleteSheet(oldBaseline);
    return true;
  });

  withSpreadsheetRetry_('chunked finalize reset ingest staging sheet', function () {
    const stagingSheet = getOrCreateSheet_(state.stagingSheetName);
    stagingSheet.clearContents();
    stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);
    return true;
  });

  clearChunkedCviBaselineState_();

  const downstreamContinuation = queueBaselineRefreshContinuation_();

  logRun_('runChunkedCviBaselineFinalize', RUN_STATUS.SUCCESS, 'Finalize complete. Source exports continuation queued.', {
    jobId: state.jobId,
    snapshotDate: state.snapshotDate,
    sourceRowsScanned: state.sourceRowsScanned,
    stagedRows: state.stagedRows,
    skippedRows: state.skippedRows,
    retainedRows: state.finalizeRetainedRows,
    stagedRowsAppended: state.finalizeStagedRowsAppended,
    totalBaselineRows: state.finalizeOutputRows,
    continuation: downstreamContinuation
  });

  return {
    jobId: state.jobId,
    snapshotDate: state.snapshotDate,
    sourceRowsScanned: state.sourceRowsScanned,
    stagedRows: state.stagedRows,
    skippedRows: state.skippedRows,
    retainedRows: state.finalizeRetainedRows,
    stagedRowsAppended: state.finalizeStagedRowsAppended,
    totalBaselineRows: state.finalizeOutputRows,
    continuation: downstreamContinuation
  };
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

function ensureChunkedCviStagingSheet_(sheetName) {
  withSpreadsheetRetry_('chunked baseline ensure staging sheet', function () {
    const stagingSheet = getOrCreateSheet_(sheetName || 'CVI_Baseline_Staging');
    const hasHeader = stagingSheet.getLastRow() >= 1;
    if (!hasHeader) {
      stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);
      return true;
    }

    const currentHeader = stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).getValues()[0];
    let headerMatches = true;
    for (var i = 0; i < CVI_BASELINE_COLUMNS.length; i++) {
      if (String(currentHeader[i] || '') !== String(CVI_BASELINE_COLUMNS[i] || '')) {
        headerMatches = false;
        break;
      }
    }

    if (!headerMatches) {
      stagingSheet.clearContents();
      stagingSheet.getRange(1, 1, 1, CVI_BASELINE_COLUMNS.length).setValues([CVI_BASELINE_COLUMNS]);
    }
    return true;
  });
}

function withSpreadsheetRetry_(label, fn) {
  const maxAttempts = 4;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      const retryable = isRetryableSpreadsheetError_(err);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      logRun_('withSpreadsheetRetry_', RUN_STATUS.WARNING, 'Retryable spreadsheet operation failed; retrying', {
        label: label,
        attempt: attempt,
        maxAttempts: maxAttempts,
        error: String(err)
      });
      Utilities.sleep(attempt * 400);
    }
  }
}

function withChunkStateFailover_(actionName, runnerFn, errorHandlerFn) {
  try {
    return runnerFn();
  } catch (err) {
    if (typeof errorHandlerFn !== 'function') {
      throw err;
    }

    let state = null;
    try {
      state = getChunkedCviBaselineState_();
    } catch (stateErr) {
      logRun_(actionName, RUN_STATUS.WARNING, 'Failed to load chunked state during failover handling', {
        error: String(stateErr)
      });
    }

    const handled = errorHandlerFn(state, err);
    if (handled) {
      return handled;
    }
    throw err;
  }
}
