function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function clearAndWriteTable_(sheetName, headers, rows) {
  const sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  const values = [headers].concat(rows || []);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
}

function appendRows_(sheetName, headers, rows) {
  if (!rows || !rows.length) {
    return;
  }

  const sheet = getOrCreateSheet_(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow === 0 && headers && headers.length) {
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function readTable_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (header, idx) {
      obj[String(header)] = row[idx];
    });
    return obj;
  });
}

function toRow_(headers, obj) {
  return headers.map(function (header) {
    return obj[header] !== undefined ? obj[header] : '';
  });
}
