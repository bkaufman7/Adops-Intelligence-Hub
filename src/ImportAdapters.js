function toNumberOrZero_(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

function toCtrPercentOrBlank_(clicks, impressions) {
  return impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : '';
}

function isBlankImportedRow_(row) {
  return !row || row.every(function (value) {
    return value === '' || value === null || value === undefined;
  });
}

function enrichWithNetworkMapping_(networkId, networkName, advertiser, accountRepOps, mapping) {
  const lookup = mapping || buildNetworkMap_();
  const normalizedId = String(networkId || '').trim();
  const normalizedName = String(networkName || '').trim();
  const normalizedAdvertiser = String(advertiser || '').trim();
  const normalizedRep = String(accountRepOps || '').trim();
  const mapHit = lookup['id:' + normalizedId] ||
    lookup['name:' + normalizedName.toLowerCase()] ||
    lookup['advertiser:' + normalizedAdvertiser.toLowerCase()] ||
    {};

  return {
    networkId: normalizedId || String(mapHit['Network ID'] || '').trim(),
    networkName: normalizedName || String(mapHit['Network Name'] || '').trim(),
    advertiser: normalizedAdvertiser || String(mapHit['Advertiser'] || '').trim(),
    accountRepOps: normalizedRep || String(mapHit['Account REP OPS'] || '').trim()
  };
}

function getIssueTypeMode_() {
  return String(PropertiesService.getScriptProperties().getProperty('ISSUE_TYPE_MODE') || 'RAW').toUpperCase();
}

function normalizeIssueTypeForMode_(text) {
  const input = normalizeIssueText_(text);
  if (!input) {
    return '';
  }
  if (getIssueTypeMode_() !== 'CLEAN') {
    return input;
  }

  return input
    .replace(/\s*\([^)]*Low Priority[^)]*\)/gi, '')
    .replace(/[🟥🟦🟨🟩🚨⚠️✅👍]/g, '')
    .replace(/\b(BILLING|DELIVERY|PERFORMANCE|COST)\s*:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function importProject1Rows_(sourceCfg) {
  // Dedicated adapter for CM360 Audit System export.
  // Expected headers (26 columns):
  //   Event Date | Source System | Source Project | Config ID | Advertiser | Campaign |
  //   Placement ID | Placement Name | Issue Flags | Impressions | Clicks |
  //   Delivery Timestamp | Source Email Subject | Row ID | Source Email Link |
  //   Source File Name | Source File Link | Network ID | Network Name |
  //   Placement Start Date | Placement End Date | Ad Type | Creative |
  //   Placement Pixel Size | Creative Pixel Size | Export Timestamp
  
  let externalSs;
  try {
    externalSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
  } catch (err) {
    throw new Error(
      'Cannot access source spreadsheet for ' + SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT +
      ' (spreadsheetId=' + (sourceCfg.spreadsheetId || '') + '). ' +
      'Share the sheet with the account running the Hub script. Root error: ' + String(err)
    );
  }

  const tab = externalSs.getSheetByName(sourceCfg.exportTab);
  if (!tab) {
    logRun_('importProject1Rows_', RUN_STATUS.WARNING, 'Missing CM360 export tab', sourceCfg);
    return [];
  }

  const range = tab.getDataRange();
  const values = range ? range.getValues() : [];
  if (!Array.isArray(values) || values.length < 2) return [];

  const headers = values[0].map(String);
  const importTimestamp = new Date();
  const mapping = buildNetworkMap_();

  const events = values.slice(1).filter(function (row) {
    return !isBlankImportedRow_(row);
  }).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) { data[h] = row[i]; });

    // Extract raw values
    const networkId = data['Network ID'] != null ? String(data['Network ID']).trim() : '';
    const networkName = String(data['Network Name'] || data['Advertiser'] || '').trim();
    const advertiser = String(data['Advertiser'] || '').trim();
    const impressions = toNumberOrZero_(data['Impressions']);
    const clicks = toNumberOrZero_(data['Clicks']);
    const enriched = enrichWithNetworkMapping_(networkId, networkName, advertiser, '', mapping);
    const ctr = toCtrPercentOrBlank_(clicks, impressions);
    const issueText = normalizeIssueText_(data['Issue Type'] || data['Issue Flags'] || '');

    if (!issueText) {
      return null;
    }

    const event = {
      'Event Date':             data['Event Date'] || '',
      'Source Project':         sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT,
      'Network ID':             enriched.networkId,
      'Network Name':           enriched.networkName,
      'Advertiser':             enriched.advertiser,
      'Campaign':               data['Campaign'] || '',
      'Placement ID':           data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name':         data['Placement Name'] || '',
      'Issue Type':             issueText,
      'Issue Flags':            issueText,
      'Issue Detail':           '',
      'Impressions':            impressions,
      'Clicks':                 clicks,
      'Difference %':           ctr,
      'Account REP OPS':        enriched.accountRepOps,
      'Source File Name':       data['Source File Name'] || sourceCfg.exportTab || 'CM360_Flagged_Export',
      'Export Timestamp':       data['Export Timestamp'] || data['Event Date'] || importTimestamp,
      'Import Timestamp':       importTimestamp,
      'Full Row Hash':          '',
      'Raw JSON Snapshot':      JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  }).filter(Boolean);

  return events;
}

function importProject2Rows_(sourceCfg) {
  return importGenericRows_(sourceCfg, SOURCE_SYSTEMS.PROJECT_2_CVI);
}

function importProject3Rows_(sourceCfg) {
  let externalSs;
  try {
    externalSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
  } catch (err) {
    throw new Error(
      'Cannot access source spreadsheet for ' + SOURCE_SYSTEMS.PROJECT_3_EOM +
      ' (spreadsheetId=' + (sourceCfg.spreadsheetId || '') + '). ' +
      'Share the sheet with the account running the Hub script. Root error: ' + String(err)
    );
  }

  const tab = externalSs.getSheetByName(sourceCfg.exportTab);
  if (!tab) {
    logRun_('importProject3Rows_', RUN_STATUS.WARNING, 'Missing EOM violations tab', sourceCfg);
    return [];
  }

  const range = tab.getDataRange();
  const values = range ? range.getValues() : [];
  if (!Array.isArray(values) || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  const importTimestamp = new Date();
  const mapping = buildNetworkMap_();

  const advertiserMismatches = {};

  return values.slice(1).filter(function (row) {
    return !isBlankImportedRow_(row);
  }).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) {
      data[h] = row[i];
    });

    const issueType = normalizeIssueTypeForMode_(data['Issue Type'] || data['Issue Flags'] || data['Flag(s)'] || data['Issue(s)'] || '');
    const impressions = toNumberOrZero_(data['Impressions']);
    const clicks = toNumberOrZero_(data['Clicks']);
    const sourceCtr = data['CTR (%)'] != null ? String(data['CTR (%)']).trim() : '';
    const diffPct = sourceCtr || toCtrPercentOrBlank_(clicks, impressions);
    const sourceAdvertiser = String(data['Advertiser'] || data['Advertiser Name'] || '').trim();
    const enriched = enrichWithNetworkMapping_(
      data['Network ID'] != null ? String(data['Network ID']) : '',
      data['Network Name'] || '',
      sourceAdvertiser,
      data['Owner (Ops)'] || '',
      mapping
    );

    if (sourceAdvertiser && enriched.advertiser && sourceAdvertiser.toLowerCase() !== String(enriched.advertiser).toLowerCase()) {
      const mismatchKey = [enriched.networkId || '', sourceAdvertiser, enriched.advertiser].join('||');
      advertiserMismatches[mismatchKey] = (advertiserMismatches[mismatchKey] || 0) + 1;
    }

    const event = {
      'Event Date': data['Report Date'] || data['Event Date'] || data['Date'] || '',
      'Source Project': sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_3_EOM,
      'Network ID': enriched.networkId,
      'Network Name': enriched.networkName,
      'Advertiser': enriched.advertiser,
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name': data['Placement'] || data['Placement Name'] || '',
      'Account REP OPS': enriched.accountRepOps,
      'Issue Type': issueType,
      'Issue Flags': issueType,
      'Issue Detail': data['Details'] || data['Issue Detail'] || '',
      'Impressions': impressions,
      'Clicks': clicks,
      'Difference %': diffPct,
      'Source File Name': data['Source File Name'] || sourceCfg.exportTab || 'Violations',
      'Export Timestamp': data['Export Timestamp'] || data['Report Date'] || data['Event Date'] || importTimestamp,
      'Import Timestamp': importTimestamp,
      'Full Row Hash': '',
      'Raw JSON Snapshot': JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });

  const mismatchItems = Object.keys(advertiserMismatches).map(function (key) {
    const parts = key.split('||');
    return {
      networkId: parts[0] || '',
      sourceAdvertiser: parts[1] || '',
      mappingAdvertiser: parts[2] || '',
      count: advertiserMismatches[key]
    };
  }).sort(function (a, b) {
    return b.count - a.count;
  });

  if (mismatchItems.length) {
    logRun_('importProject3Rows_', RUN_STATUS.WARNING, 'Source advertiser differs from mapping advertiser', {
      distinctMismatches: mismatchItems.length,
      topMismatches: mismatchItems.slice(0, 20)
    });
  }

  return events;
}

function normalizeIssueText_(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(function (part) { return String(part || '').trim(); })
    .filter(Boolean)
    .join(', ');
}

function importGenericRows_(sourceCfg, sourceSystem) {
  let externalSs;
  try {
    externalSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
  } catch (err) {
    throw new Error(
      'Cannot access source spreadsheet for ' + sourceSystem +
      ' (spreadsheetId=' + (sourceCfg.spreadsheetId || '') + '). ' +
      'Share the sheet with the account running the Hub script. Root error: ' + String(err)
    );
  }

  const tab = externalSs.getSheetByName(sourceCfg.exportTab);
  if (!tab) {
    logRun_('importGenericRows_', RUN_STATUS.WARNING, 'Missing source tab', sourceCfg);
    return [];
  }

  const range = tab.getDataRange();
  const values = range ? range.getValues() : [];
  if (!Array.isArray(values) || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  const importTimestamp = new Date();
  const mapping = buildNetworkMap_();

  return values.slice(1).filter(function (row) {
    return !isBlankImportedRow_(row);
  }).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) {
      data[h] = row[i];
    });
    
    const impressions = toNumberOrZero_(data['Impressions']);
    const clicks = toNumberOrZero_(data['Clicks']);
    const enriched = enrichWithNetworkMapping_(
      data['Network ID'] != null ? String(data['Network ID']) : '',
      data['Network Name'] || '',
      data['Advertiser'] || data['Advertiser Name'] || '',
      data['Account REP OPS'] || data['Owner (Ops)'] || '',
      mapping
    );
    let issueType = normalizeIssueText_(data['Issue Type'] || data['Issue Flags'] || data['Flag(s)'] || data['Issue(s)'] || '');
    if (!issueType && sourceSystem === SOURCE_SYSTEMS.PROJECT_2_CVI) {
      issueType = 'CVI_CLICKS_GT_IMPRESSIONS';
    }
    const diffPct = toCtrPercentOrBlank_(clicks, impressions);

    const event = {
      'Event Date': data['Event Date'] || data['Date'] || '',
      'Source Project': sourceCfg.sourceProject || sourceSystem,
      'Network ID': enriched.networkId,
      'Network Name': enriched.networkName,
      'Advertiser': enriched.advertiser,
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name': data['Placement Name'] || data['Placement'] || '',
      'Issue Type': issueType,
      'Issue Flags': issueType,
      'Issue Detail': data['Issue Detail'] || '',
      'Impressions': impressions,
      'Clicks': clicks,
      'Difference %': diffPct,
      'Account REP OPS': enriched.accountRepOps,
      'Source File Name': data['Source File Name'] || sourceCfg.exportTab || 'Output',
      'Export Timestamp': data['Export Timestamp'] || data['Event Date'] || data['Date'] || importTimestamp,
      'Import Timestamp': importTimestamp,
      'Full Row Hash': '',
      'Raw JSON Snapshot': JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });
}
