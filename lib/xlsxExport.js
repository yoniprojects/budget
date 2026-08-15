// Ported from budget_blend.html's xlsx* helpers and buildExportWorkbook().
// Logic is unchanged from the app - only the input (an explicit `state`
// object instead of the page's global appState/expenseCategories/etc.) and
// the base64->binary and final blob->buffer steps differ, since there's no
// `atob`/`Blob` in Node.

const JSZip = require('jszip');
const { EXPORT_TEMPLATE_B64 } = require('./_template');

const EXPORT_MONTH_FULL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

function xlsxColToNum(col){ let n=0; for(const ch of col) n = n*26 + (ch.charCodeAt(0)-64); return n; }
function xlsxSplitRef(ref){ const m = ref.match(/^([A-Z]+)(\d+)$/); return {col:m[1], row:parseInt(m[2],10)}; }
function xlsxEscape(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function xlsxGetRowBlock(sheetXml, rowNum){
  const re = new RegExp(`<row r="${rowNum}"[^>]*(?:/>|>[\\s\\S]*?</row>)`);
  const m = sheetXml.match(re);
  return m ? {text:m[0], index:m.index} : null;
}
function xlsxGetCellInRow(rowText, ref){
  const re = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const m = rowText.match(re);
  return m ? {text:m[0], index:m.index} : null;
}
function xlsxCellAttrs(cellText){ const m = cellText.match(/^<c([^>]*?)(?:\/>|>)/); return m ? m[1] : ''; }
function xlsxStyleFromAttrs(attrs){ const m = attrs.match(/\ss="(\d+)"/); return m ? m[1] : null; }
function xlsxBuildCell(ref, style, kind, value){
  const sAttr = style != null ? ` s="${style}"` : '';
  if(value === '' || value === null || value === undefined) return `<c r="${ref}"${sAttr}/>`;
  if(kind === 'str') return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(value)}</t></is></c>`;
  if(kind === 'n') return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
  if(kind === 'f') return `<c r="${ref}"${sAttr}><f>${xlsxEscape(String(value).replace(/^=/,''))}</f></c>`;
  throw new Error('bad kind '+kind);
}
function xlsxSetCell(sheetXml, ref, kind, value, styleHintRef){
  const {col, row} = xlsxSplitRef(ref);
  const rowBlock = xlsxGetRowBlock(sheetXml, row);
  if(!rowBlock) throw new Error(`Row ${row} not found for ${ref}`);
  let rowText = rowBlock.text;
  const existing = xlsxGetCellInRow(rowText, ref);
  let style = existing ? xlsxStyleFromAttrs(xlsxCellAttrs(existing.text)) : null;
  if(style == null && styleHintRef){
    const hintRow = xlsxGetRowBlock(sheetXml, xlsxSplitRef(styleHintRef).row);
    if(hintRow){
      const hc = xlsxGetCellInRow(hintRow.text, styleHintRef);
      if(hc) style = xlsxStyleFromAttrs(xlsxCellAttrs(hc.text));
    }
  }
  const newCell = xlsxBuildCell(ref, style, kind, value);
  if(existing){
    rowText = rowText.slice(0, existing.index) + newCell + rowText.slice(existing.index + existing.text.length);
  } else {
    const cellRe = /<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
    const targetColNum = xlsxColToNum(col);
    const openTagMatch = rowText.match(/^<row[^>]*>/);
    cellRe.lastIndex = openTagMatch ? openTagMatch[0].length : 0;
    let m, insertAt = null;
    while((m = cellRe.exec(rowText))){
      if(xlsxColToNum(m[1]) > targetColNum){ insertAt = m.index; break; }
    }
    if(insertAt == null){
      const closeIdx = rowText.lastIndexOf('</row>');
      insertAt = closeIdx !== -1 ? closeIdx : rowText.length;
    }
    rowText = rowText.slice(0, insertAt) + newCell + rowText.slice(insertAt);
  }
  return sheetXml.slice(0, rowBlock.index) + rowText + sheetXml.slice(rowBlock.index + rowBlock.text.length);
}

// state = { period, expenseCategories, incomeSources, budgets, txExpenses, txIncome }
// (the exact shape stored in the Firestore doc)
async function buildExportWorkbook(state){
  const bin = Buffer.from(EXPORT_TEMPLATE_B64, 'base64');
  const zip = await JSZip.loadAsync(bin);

  let sheet1 = await zip.file('xl/worksheets/sheet1.xml').async('string'); // Summary
  let sheet2 = await zip.file('xl/worksheets/sheet2.xml').async('string'); // Transactions

  const { period, expenseCategories, incomeSources, budgets, txExpenses, txIncome } = state;

  const yy = String(period.year).slice(-2);
  const title = `Monthly Budget ${EXPORT_MONTH_FULL[period.month-1]} '${yy}`;
  sheet1 = xlsxSetCell(sheet1, 'B2', 'str', title);

  // Un-hide row 14: the template's own August example used it as a hidden
  // "Savings" hack; we treat every row 9-26 as a uniform, visible slot.
  sheet1 = sheet1.replace(/(<row r="14"[^>]*?)\shidden="1"/, '$1');

  const EXP_FIRST=9, EXP_LAST=26, INC_FIRST=9, INC_LAST=26;
  for(let i=0;i<(EXP_LAST-EXP_FIRST+1);i++){
    const row = EXP_FIRST+i;
    const name = expenseCategories[i] ? expenseCategories[i].name : '';
    sheet1 = xlsxSetCell(sheet1, `B${row}`, 'str', name, 'B9');
    const formula = name ? `IF(ISBLANK($B${row}), "", SUMIF(Transactions!$E:$E,$B${row},Transactions!$C:$C))` : '';
    sheet1 = xlsxSetCell(sheet1, `D${row}`, name ? 'f' : 'n', formula, 'D9');
  }
  sheet1 = xlsxSetCell(sheet1, 'D8', 'f', `SUM(D${EXP_FIRST}:D${EXP_LAST})`);

  for(let i=0;i<(INC_LAST-INC_FIRST+1);i++){
    const row = INC_FIRST+i;
    const name = incomeSources[i] ? incomeSources[i].name : '';
    sheet1 = xlsxSetCell(sheet1, `F${row}`, 'str', name, 'F9');
    const formula = name ? `IF(ISBLANK($F${row}), "", SUMIF(Transactions!$K:$K,$F${row},Transactions!$I:$I))` : '';
    sheet1 = xlsxSetCell(sheet1, `H${row}`, name ? 'f' : 'n', formula, 'H9');
  }
  sheet1 = xlsxSetCell(sheet1, 'H8', 'f', `SUM(H${INC_FIRST}:H${INC_LAST})`);

  const BUD_ROWS = [8,9,10];
  BUD_ROWS.forEach((row, i)=>{
    const b = budgets[i];
    if(!b){
      sheet1 = xlsxSetCell(sheet1, `J${row}`, 'str', '');
      sheet1 = xlsxSetCell(sheet1, `M${row}`, 'n', '');
      return;
    }
    sheet1 = xlsxSetCell(sheet1, `J${row}`, 'str', b.name);
    const spentExpr = `SUMIF(Transactions!$E:$E,J${row},Transactions!$C:$C)`;
    const targetExpr = b.mode === 'percent' ? `(H$8*${b.value/100})` : `${b.value}`;
    sheet1 = xlsxSetCell(sheet1, `M${row}`, 'f', `${targetExpr}-${spentExpr}`);
  });

  const TX_FIRST=4, TX_LAST=59;
  const txCap = TX_LAST - TX_FIRST + 1;
  for(let i=0;i<txCap;i++){
    const row = TX_FIRST+i;
    const t = txExpenses[i];
    if(t){
      sheet2 = xlsxSetCell(sheet2, `B${row}`, 'str', t.date, 'B4');
      sheet2 = xlsxSetCell(sheet2, `C${row}`, 'n', t.amt, 'C4');
      sheet2 = xlsxSetCell(sheet2, `D${row}`, 'str', t.desc, 'D4');
      sheet2 = xlsxSetCell(sheet2, `E${row}`, 'str', t.cat, 'E4');
    } else {
      sheet2 = xlsxSetCell(sheet2, `B${row}`, 'str', '');
      sheet2 = xlsxSetCell(sheet2, `C${row}`, 'n', '');
      sheet2 = xlsxSetCell(sheet2, `D${row}`, 'str', '');
      sheet2 = xlsxSetCell(sheet2, `E${row}`, 'str', '');
    }
    const inc = txIncome[i];
    if(inc){
      sheet2 = xlsxSetCell(sheet2, `H${row}`, 'str', inc.date, 'H4');
      sheet2 = xlsxSetCell(sheet2, `I${row}`, 'n', inc.amt, 'I4');
      sheet2 = xlsxSetCell(sheet2, `J${row}`, 'str', inc.desc, 'J4');
      sheet2 = xlsxSetCell(sheet2, `K${row}`, 'str', inc.cat, 'K4');
    } else {
      sheet2 = xlsxSetCell(sheet2, `H${row}`, 'str', '');
      sheet2 = xlsxSetCell(sheet2, `I${row}`, 'n', '');
      sheet2 = xlsxSetCell(sheet2, `J${row}`, 'str', '');
      sheet2 = xlsxSetCell(sheet2, `K${row}`, 'str', '');
    }
  }

  zip.file('xl/worksheets/sheet1.xml', sheet1);
  zip.file('xl/worksheets/sheet2.xml', sheet2);

  // Force full recalculation on open, since new formulas/values were written
  // without updating every cached <v>.
  let wbXml2 = await zip.file('xl/workbook.xml').async('string');
  wbXml2 = /<calcPr/.test(wbXml2)
    ? wbXml2.replace(/<calcPr[^/]*\/>/, '<calcPr fullCalcOnLoad="1"/>')
    : wbXml2.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', wbXml2);

  // calcChain.xml is stale after our edits; drop it (and its references) and
  // let Excel/LibreOffice rebuild it on open.
  zip.remove('xl/calcChain.xml');
  let ctypes2 = await zip.file('[Content_Types].xml').async('string');
  ctypes2 = ctypes2.replace(/<Override PartName="\/xl\/calcChain\.xml"[^/]*\/>/, '');
  zip.file('[Content_Types].xml', ctypes2);
  let wbRels2 = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  wbRels2 = wbRels2.replace(/<Relationship[^>]*calcChain\.xml[^>]*\/>/, '');
  zip.file('xl/_rels/workbook.xml.rels', wbRels2);

  return zip.generateAsync({type:'nodebuffer'});
}

module.exports = { buildExportWorkbook, EXPORT_MONTH_FULL };
