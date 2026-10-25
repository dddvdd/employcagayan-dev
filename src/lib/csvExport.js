import Papa from 'papaparse'

// Treat formula-like text as literal cells. Keep the original text intact;
// Papa Parse handles separators, quotes and line breaks after escaping.
const formulaPrefix=/^[\s\p{Cc}\p{Cf}]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20\t\r\n]/u

export function spreadsheetCsv(rows){
 return Papa.unparse(rows,{escapeFormulae:formulaPrefix})
}
