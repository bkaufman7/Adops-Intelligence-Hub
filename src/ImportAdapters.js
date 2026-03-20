function importProject1Rows_(sourceCfg) {
  return importGenericRows_(sourceCfg, SOURCE_SYSTEMS.PROJECT_1_CM360_AUDIT);
}

function importProject2Rows_(sourceCfg) {
  return importGenericRows_(sourceCfg, SOURCE_SYSTEMS.PROJECT_2_CVI);
}

function importProject3Rows_(sourceCfg) {
  return importGenericRows_(sourceCfg, SOURCE_SYSTEMS.PROJECT_3_EOM);
}

function importGenericRows_(sourceCfg, sourceSystem) {
  const externalSs = SpreadsheetApp.openById(sourceCfg.spreadsheetId);
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
