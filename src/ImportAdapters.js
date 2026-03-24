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

  const values = tab.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(String);
  const importTimestamp = new Date();

  return values.slice(1).map(function (row) {
    const data = {};
    headers.forEach(function (h, i) { data[h] = row[i]; });

    const event = {
      // Core event fields
      'Event Date':             data['Event Date'] || '',
      'Source System':          SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT,
      'Source Project':         sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT,
      'Source Spreadsheet ID':  sourceCfg.spreadsheetId,
      'Source Tab':             sourceCfg.exportTab,

      // Provenance / email trail
      'Source Email Subject':   data['Source Email Subject'] || '',
      'Source Email Link':      data['Source Email Link'] || '',
      'Source File Name':       data['Source File Name'] || '',
      'Source File Link':       data['Source File Link'] || '',

      // Network / advertiser / placement
      'Network ID':             data['Network ID'] || '',
      'Network Name':           data['Network Name'] || '',
      'Advertiser':             data['Advertiser'] || '',
      'Campaign':               data['Campaign'] || '',
      'Placement ID':           data['Placement ID'] || '',
      'Placement Name':         data['Placement Name'] || '',

      // Issue fields
      'Issue Type Raw':         '',           // CM360 export has no separate Issue Type column
      'Issue Flags':            data['Issue Flags'] || '',
      'Issue Detail':           '',

      // Metrics
      'Impressions':            data['Impressions'] || '',
      'Clicks':                 data['Clicks'] || '',
      'Difference %':           '',

      // CM360-specific fields promoted to flex slots
      'Additional Metric 1':   data['Delivery Timestamp'] || '',   // Delivery Timestamp
      'Additional Metric 2':   data['Ad Type'] || '',              // Ad Type

      // Status / handling
      'Status Raw':             '',
      'Handled Notes':          '',

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

    const event = {
      'Event Date': data['Report Date'] || data['Event Date'] || data['Date'] || '',
      'Source System': SOURCE_SYSTEMS.PROJECT_3_EOM,
      'Source Project': sourceCfg.sourceProject || SOURCE_SYSTEMS.PROJECT_3_EOM,
      'Source Spreadsheet ID': sourceCfg.spreadsheetId,
      'Source Tab': sourceCfg.exportTab,
      'Source Email Subject': data['Source Email Subject'] || data['Email Subject'] || '',
      'Source Email Link': data['Source Email Link'] || '',
      'Source File Name': data['Source File Name'] || '',
      'Source File Link': data['Source File Link'] || '',
      'Network ID': data['Network ID'] || '',
      'Network Name': data['Network Name'] || '',
      'Advertiser': data['Advertiser'] || data['Advertiser Name'] || '',
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] || '',
      'Placement Name': data['Placement'] || data['Placement Name'] || '',
      'Issue Type Raw': issueType,
      'Issue Flags': issueType,
      'Issue Detail': data['Details'] || data['Issue Detail'] || '',
      'Impressions': data['Impressions'] || '',
      'Clicks': data['Clicks'] || '',
      'Difference %': data['CTR (%)'] || data['Difference %'] || '',
      'Additional Metric 1': data['Flight Completion %'] || '',
      'Additional Metric 2': data['CPC Risk'] || '',
      'Status Raw': data['Owner (Ops)'] || '',
      'Handled Notes': '',
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

    const event = {
      'Event Date': data['Event Date'] || data['Date'] || '',
      'Source System': sourceSystem,
      'Source Project': sourceCfg.sourceProject || sourceSystem,
      'Source Spreadsheet ID': sourceCfg.spreadsheetId,
      'Source Tab': sourceCfg.exportTab,
      'Source Email Subject': data['Source Email Subject'] || data['Email Subject'] || '',
      'Source Email Link': data['Source Email Link'] || '',
      'Source File Name': data['Source File Name'] || '',
      'Source File Link': data['Source File Link'] || '',
      'Network ID': data['Network ID'] || '',
      'Network Name': data['Network Name'] || '',
      'Advertiser': data['Advertiser'] || data['Advertiser Name'] || '',
      'Campaign': data['Campaign'] || data['Campaign Name'] || '',
      'Placement ID': data['Placement ID'] || '',
      'Placement Name': data['Placement Name'] || data['Placement'] || '',
      'Issue Type Raw': data['Issue Type Raw'] || data['Issue Type'] || '',
      'Issue Flags': data['Issue Flags'] || data['Flag(s)'] || data['Issue(s)'] || '',
      'Issue Detail': data['Issue Detail'] || '',
      'Impressions': data['Impressions'] || '',
      'Clicks': data['Clicks'] || '',
      'Difference %': data['Difference %'] || '',
      'Additional Metric 1': data['Additional Metric 1'] || '',
      'Additional Metric 2': data['Additional Metric 2'] || '',
      'Status Raw': data['Status Raw'] || data['Status'] || '',
      'Handled Notes': data['Handled Notes'] || '',
      'Export Timestamp': data['Export Timestamp'] || '',
      'Import Timestamp': importTimestamp,
      'Full Row Hash': '',
      'Raw JSON Snapshot': JSON.stringify(data)
    };

    event['Full Row Hash'] = computeFullRowHash_(event);
    return event;
  });
}
