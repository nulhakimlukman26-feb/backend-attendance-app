const XLSX = require('xlsx');
const { parseTimeToMinutes } = require('./formatter');

// Ported from src/core/fileParser.js:4 - server-side version operates on Buffer
function parseAttendanceFile(arrayBuffer, fileName = 'upload.xlsx') {
  const warnings = [];
  try {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) throw new Error('File kosong atau tidak dapat dibaca');

    const range = XLSX.utils.decode_range(ws['!ref']);
    const totalRows = range.e.r + 1;
    const totalCols = range.e.c + 1;

    function getCell(r, c) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      return cell ? cell.v : null;
    }
    function getCellStr(r, c) {
      const v = getCell(r, c);
      return v !== null && v !== undefined ? String(v).trim() : '';
    }

    let periodStart = null;
    let periodEnd = null;
    let periodRaw = '';
    for (let r = 0; r < Math.min(10, totalRows); r++) {
      for (let c = 0; c < totalCols; c++) {
        const val = getCellStr(r, c);
        if (val.includes('Tanggal Kehadiran')) {
          periodRaw = val;
          const match = val.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s*~\s*(\d{1,2})-(\d{1,2})-(\d{4})/);
          if (match) {
            periodStart = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            periodEnd = new Date(parseInt(match[6]), parseInt(match[5]) - 1, parseInt(match[4]));
          }
          break;
        }
      }
      if (periodStart) break;
    }

    if (!periodStart || !periodEnd) warnings.push('Tidak dapat menemukan periode kehadiran. Akan mencoba mendeteksi dari data.');

    const employees = [];
    for (let r = 0; r < totalRows; r++) {
      let nameLabel = -1;
      let nameValue = '';
      let userId = '';
      let department = '';
      for (let c = 0; c < totalCols; c++) {
        const val = getCellStr(r, c);
        if (val.match(/^Nama[：:]/i)) { nameLabel = c; nameValue = getCellStr(r, c + 1); }
        if (val.match(/^User\s*ID[.．]*[：:]/i)) userId = getCellStr(r, c + 1);
        if (val.match(/^Dep(artemen|t)[：:]/i)) department = getCellStr(r, c + 1);
      }
      if (nameLabel === -1 || !nameValue) continue;

      const datesRow = r + 1;
      const timestampsRow = r + 2;
      if (datesRow >= totalRows) {
        warnings.push(`Karyawan "${nameValue}": tidak ada baris tanggal setelah header`);
        employees.push({ userId, name: nameValue, department, records: [] });
        continue;
      }

      const dateEntries = [];
      for (let c = 0; c < totalCols; c++) {
        const val = getCell(datesRow, c);
        if (val !== null && typeof val === 'number' && val >= 1 && val <= 31) dateEntries.push({ col: c, dateNum: val });
      }
      if (dateEntries.length === 0) {
        warnings.push(`Karyawan "${nameValue}": tidak ditemukan tanggal pada baris ${datesRow + 1}`);
        employees.push({ userId, name: nameValue, department, records: [] });
        continue;
      }

      let nextEmpRow = totalRows;
      for (let nr = r + 3; nr < totalRows; nr++) {
        let isNext = false;
        for (let c = 0; c < totalCols; c++) if (getCellStr(nr, c).match(/^Nama[：:]/i)) { isNext = true; break; }
        if (isNext) { nextEmpRow = nr; break; }
      }

      const colTimestamps = {};
      for (const e of dateEntries) colTimestamps[e.col] = [];
      for (let scanRow = timestampsRow; scanRow < nextEmpRow && scanRow < totalRows; scanRow++) {
        for (const entry of dateEntries) {
          const tsVal = getCellStr(scanRow, entry.col);
          if (tsVal) {
            const times = tsVal.split(/[\n\r]+/).map(t => t.trim()).filter(t => t.match(/^\d{1,2}:\d{2}$/));
            colTimestamps[entry.col].push(...times);
          }
        }
      }

      function formatDateSimple(d) { return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }

      const records = [];
      for (const entry of dateEntries) {
        let fullDate;
        if (periodStart) fullDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), entry.dateNum);
        else { fullDate = new Date(2026, 6, entry.dateNum); warnings.push('Menggunakan tanggal default karena periode tidak ditemukan'); }

        let checkIn = null, checkOut = null, status = 'Tidak Hadir', dataStatus = 'No Data';
        const times = colTimestamps[entry.col] || [];
        const rawTimestamps = times;
        if (times.length >= 2) { checkIn = times[0]; checkOut = times[times.length - 1]; status = 'Hadir'; dataStatus = 'Valid'; }
        else if (times.length === 1) {
          const timeMin = parseTimeToMinutes(times[0]);
          if (timeMin !== null && timeMin >= 840) { checkIn = null; checkOut = times[0]; }
          else { checkIn = times[0]; checkOut = null; }
          status = 'Data Tidak Lengkap'; dataStatus = 'Data Tidak Lengkap';
          warnings.push(`${nameValue} (${formatDateSimple(fullDate)}): Hanya ada satu timestamp "${times[0]}" - Dihitung 0,5 Hadir`);
        }
        records.push({ date: fullDate, checkIn, checkOut, rawTimestamps, status, dataStatus });
      }
      employees.push({ userId, name: nameValue, department, records });
    }

    if (employees.length === 0) warnings.push('Tidak ditemukan data karyawan dalam file');

    const dates = [];
    if (periodStart && periodEnd) {
      const cur = new Date(periodStart);
      while (cur <= periodEnd) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    }

    return { period: { start: periodStart, end: periodEnd, raw: periodRaw }, employees, dates, warnings, fileName, sheetName };
  } catch (error) {
    return { period: { start: null, end: null, raw: '' }, employees: [], dates: [], warnings: [`Error membaca file: ${error.message}`], fileName, sheetName: '', error: true };
  }
}

module.exports = { parseAttendanceFile };
