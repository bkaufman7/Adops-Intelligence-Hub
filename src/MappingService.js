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
    clearAndWriteTable_(SHEETS.NETWORK_MAPPING, values[0] || [], values.slice(1));

    return { rows: Math.max(values.length - 1, 0), tab: tabName };
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
