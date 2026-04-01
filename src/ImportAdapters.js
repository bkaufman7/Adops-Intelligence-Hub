function importProject1Rows_(sourceCfg) {
  // Dedicated adapter for CM360 Audit System export.
  // Expected headers (26 columns):
  //   Event Date | Source System | Source Project | Config ID | Advertiser | Campaign |
  //   Placement ID | Placement Name | Issue Flags | Impressions | Clicks |
  //   Delivery Timestamp | Source Email Subject | Row ID | Source Email Link |
  //   Source File Name | Source File Link | Network ID | Network Name |
  //   Placement Start Date | Placement End Date | Ad Type | Creative |
  //   Placement Pixel Size | Creative Pixel Size | Export Timestamp
  
  // Load Network_Mapping for lookups
  const networkMappingData = readTable_(SHEETS.NETWORK_MAPPING);
  const networkMap = {};
  networkMappingData.slice(1).forEach(function(row) {
    const netId = String(row[0] || '').trim();
    const netName = String(row[1] || '').trim().toLowerCase();
    const advertiser = String(row[2] || '').trim().toLowerCase();
    const rep = String(row[3] || '').trim();
    if (netId) networkMap['id:' + netId] = { networkId: netId, networkName: row[1], advertiser: row[2], rep: rep };
    if (netName) networkMap['name:' + netName] = { networkId: netId, networkName: row[1], advertiser: row[2], rep: rep };
    if (advertiser) networkMap['adv:' + advertiser] = { networkId: netId, networkName: row[1], advertiser: row[2], rep: rep };
  });
  
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

  const values = tab.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(String);
  const importTimestamp = new Date();

  return values.slice(1).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) { data[h] = row[i]; });

    // Extract raw values
    let networkId = data['Network ID'] != null ? String(data['Network ID']).trim() : '';
    const networkName = String(data['Network Name'] || data['Advertiser'] || '').trim();
    const advertiser = String(data['Advertiser'] || '').trim();
    const impressions = data['Impressions'] != null ? data['Impressions'] : 0;
    const clicks = data['Clicks'] != null ? data['Clicks'] : 0;
    
    // Lookup Network ID and Account REP OPS from Network_Mapping if needed
    let accountRepOps = '';
    if (!networkId && networkName) {
      // Lookup by network name
      const mapHit = networkMap['name:' + networkName.toLowerCase()] || {};
      networkId = mapHit.networkId || '';
      accountRepOps = mapHit.rep || '';
    } else if (networkId) {
      // Lookup by network ID
      const mapHit = networkMap['id:' + networkId] || {};
      accountRepOps = mapHit.rep || '';
    }
    
    // Calculate CTR as Difference %
    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : 0;

    const event = {
      // Core event fields
      'Event Date':             data['Event Date'] || '',
      'Source System':          SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT,
      'Source Project':         sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT,
      'Source Spreadsheet ID':  sourceCfg.spreadsheetId,
      'Source Tab':             sourceCfg.exportTab,

      // Provenance / email trail
      'Source Email Subject':   data['Source Email Subject'] || '',
      'Source File Name':       data['Source File Name'] || '',

      // Network / advertiser / placement
      'Network ID':             networkId,
      'Network Name':           networkName,
      'Advertiser':             advertiser,
      'Campaign':               data['Campaign'] || '',
      'Placement ID':           data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name':         data['Placement Name'] || '',
      'Account REP OPS':        accountRepOps,

      // Issue fields
      'Issue Flags':            data['Issue Flags'] || '',
      'Issue Detail':           '',

      // Metrics
      'Impressions':            impressions,
      'Clicks':                 clicks,
      'Difference %':           ctr,

      // CM360-specific fields promoted to flex slots
      'Additional Metric 1':    data['Delivery Timestamp'] || '',   // Delivery Timestamp
      'Additional Metric 2':    data['Ad Type'] || '',              // Ad Type

      // Timestamps
      'Export Timestamp':       data['Export Timestamp'] || '',
      'Import Timestamp':       importTimestamp,
      'Full Row Hash':          '',

      // Full fidelity — captures Config ID, Row ID, Placement Start/End Date,
      // Creative, Placement Pixel Size, Creative Pixel Size, and any future columns
      'Raw JSON Snapshot':      JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });
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

  const values = tab.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  const importTimestamp = new Date();

  return values.slice(1).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) {
      data[h] = row[i];
    });

    const issueType = normalizeIssueText_(data['Issue Type'] || data['Issue Flags'] || data['Flag(s)'] || data['Issue(s)'] || '');
    const impressions = data['Impressions'] != null ? data['Impressions'] : 0;
    const clicks = data['Clicks'] != null ? data['Clicks'] : 0;
    
    // Calculate CTR as Difference % if not provided
    let diffPct = data['CTR (%)'] != null ? data['CTR (%)'] : (data['Difference %'] != null ? data['Difference %'] : 0);
    if (!diffPct && impressions > 0) {
      diffPct = ((clicks / impressions) * 100).toFixed(2);
    }

    const event = {
      'Event Date': data['Report Date'] || data['Event Date'] || data['Date'] || '',
      'Source System': SOURCE_SYSTEMS.PROJECT_3_EOM,
      'Source Project': sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_3_EOM,
      'Source Spreadsheet ID': sourceCfg.spreadsheetId,
      'Source Tab': sourceCfg.exportTab,
      'Source Email Subject': data['Source Email Subject'] || data['Email Subject'] || '',
      'Source File Name': data['Source File Name'] || '',
      'Network ID': data['Network ID'] != null ? String(data['Network ID']) : '',
      'Network Name': data['Network Name'] || '',
      'Advertiser': data['Advertiser'] || data['Advertiser Name'] || '',
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name': data['Placement'] || data['Placement Name'] || '',
      'Account REP OPS': data['Owner (Ops)'] || '',
      'Issue Flags': issueType,
      'Issue Detail': data['Details'] || data['Issue Detail'] || '',
      'Impressions': impressions,
      'Clicks': clicks,
      'Difference %': diffPct,
      'Additional Metric 1': data['Flight Completion %'] || '',
      'Additional Metric 2': data['CPC Risk'] || '',
      'Export Timestamp': data['Export Timestamp'] || '',
      'Import Timestamp': importTimestamp,
      'Full Row Hash': '',
      'Raw JSON Snapshot': JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });
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

  const values = tab.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  const importTimestamp = new Date();

  return values.slice(1).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) {
      data[h] = row[i];
    });
    
    const impressions = data['Impressions'] != null ? data['Impressions'] : 0;
    const clicks = data['Clicks'] != null ? data['Clicks'] : 0;
    let diffPct = data['Difference %'] != null ? data['Difference %'] : 0;
    if (!diffPct && impressions > 0) {
      diffPct = ((clicks / impressions) * 100).toFixed(2);
    }

    const event = {
      'Event Date': data['Event Date'] || data['Date'] || '',
      'Source System': sourceSystem,
      'Source Project': sourceCfg.sourceProject || sourceSystem,
      'Source Spreadsheet ID': sourceCfg.spreadsheetId,
      'Source Tab': sourceCfg.exportTab,
      'Source Email Subject': data['Source Email Subject'] || data['Email Subject'] || '',
      'Source File Name': data['Source File Name'] || '',
      'Network ID': data['Network ID'] != null ? String(data['Network ID']) : '',
      'Network Name': data['Network Name'] || '',
      'Advertiser': data['Advertiser'] || data['Advertiser Name'] || '',
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] != null ? String(data['Placement ID']) : '',
      'Placement Name': data['Placement Name'] || data['Placement'] || '',
      'Account REP OPS': data['Account REP OPS'] || data['Owner (Ops)'] || '',
      'Issue Flags': data['Issue Flags'] || data['Flag(s)'] || data['Issue(s)'] || '',
      'Issue Detail': data['Issue Detail'] || '',
      'Impressions': impressions,
      'Clicks': clicks,
      'Difference %': diffPct,
      'Additional Metric 1': data['Additional Metric 1'] || '',
      'Additional Metric 2': data['Additional Metric 2'] || '',
      'Export Timestamp': data['Export Timestamp'] || '',
      'Import Timestamp': importTimestamp,
      'Full Row Hash': '',
      'Raw JSON Snapshot': JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });
}
