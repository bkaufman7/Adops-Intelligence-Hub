function refreshNetworkMapping() {
  return withRunLogging_('refreshNetworkMapping', function () {
    const spreadsheetId = getConfigValue_(CONFIG_KEYS.MAPPING_SOURCE_SPREADSHEET_ID, '');
    const tabName = getConfigValue_(CONFIG_KEYS.MAPPING_SOURCE_TAB, 'Networks');

    if (!spreadsheetId) {
      throw new Error('Config missing mapping_source_spreadsheet_id');
    }

    const sourceSs = SpreadsheetApp.openById(spreadsheetId);
    const sourceTab = sourceSs.getSheetByName(tabName);
    if (!sourceTab) {
      throw new Error('Mapping source tab not found: ' + tabName);
    }

    const values = sourceTab.getDataRange().getValues();
    
    // Find the column index where "Network ID" header starts
    // (Source tab has personal log in columns A-B, mapping data starts at column P)
    const headerRow = values[0] || [];
    let startCol = -1;
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim() === 'Network ID') {
        startCol = i;
        break;
      }
    }
    
    if (startCol === -1) {
      throw new Error('Could not find "Network ID" column in source mapping tab. Check that column P has "Network ID" header.');
    }
    
    // Extract only the mapping columns (Network ID, Network Name, Advertiser, Account REP OPS)
    // Expected: 4 columns starting from "Network ID"
    const mappingHeaders = headerRow.slice(startCol, startCol + 4);
    const mappingData = values.slice(1).map(function(row) {
      return row.slice(startCol, startCol + 4);
    });
    
    clearAndWriteTable_(SHEETS.NETWORK_MAPPING, mappingHeaders, mappingData);

    return { 
      rows: mappingData.length, 
      tab: tabName,
      startColumn: startCol + 1,
      columnsExtracted: mappingHeaders
    };
  });
}

function buildNetworkMap_() {
  const rows = readTable_(SHEETS.NETWORK_MAPPING);
  const map = {};

  rows.forEach(function (row) {
    const id = String(row['Network ID'] || '').trim();
    const name = String(row['Network Name'] || '').trim().toLowerCase();
    const advertiser = String(row['Advertiser'] || '').trim().toLowerCase();

    if (id) {
      map['id:' + id] = row;
    }

    if (name) {
      map['name:' + name] = row;
    }

    // Also match on advertiser column - many events use advertiser as network name
    if (advertiser) {
      map['advertiser:' + advertiser] = row;
    }
  });

  return map;
}
