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
