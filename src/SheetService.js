function getOrCreateSheet_(name) {
  const targetName = String(name || '').trim();
  if (!targetName) {
    throw new Error('getOrCreateSheet_ requires a non-empty sheet name');
  }

  return runSheetWriteWithRetry_('getOrCreateSheet_(' + targetName + ')', function () {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
    }
    return sheet;
  });
}

function clearAndWriteTable_(sheetName, headers, rows) {
  return clearAndWriteTableChunked_(sheetName, headers, rows, 1000);
}

function clearAndWriteTableChunked_(sheetName, headers, rows, chunkSize) {
  const sheet = getOrCreateSheet_(sheetName);
  const safeRows = rows || [];
  const safeChunkSize = Math.max(100, Number(chunkSize) || 1000);

  runSheetWriteWithRetry_('clearAndWriteTable_(' + sheetName + ')', function () {
    sheet.clearContents();

    // Always write headers first, then chunk data rows to avoid one massive setValues call.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    if (!safeRows.length) {
      return;
    }

    var start = 0;
    while (start < safeRows.length) {
      var chunk = safeRows.slice(start, start + safeChunkSize);
      var startRow = start + 2;
      sheet.getRange(startRow, 1, chunk.length, headers.length).setValues(chunk);
      start += chunk.length;
    }
  });
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

function runSheetWriteWithRetry_(label, fn) {
  const maxAttempts = 4;

  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isRetryable = isRetryableSpreadsheetError_(err);
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      Utilities.sleep(attempt * 350);
    }
  }
}

function isRetryableSpreadsheetError_(err) {
  const message = String(err || '');
  return /timed out|Service Spreadsheets|internal error|try again/i.test(message);
}
