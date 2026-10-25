import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import {spreadsheetCsv} from '../../src/lib/csvExport.js'
const parse=csv=>{const result=Papa.parse(csv,{delimiter:','});assert.deepEqual(result.errors,[]);return result.data}
test('all formula/control/fullwidth prefixes receive a literal text marker, including leading whitespace and format characters',()=>{
 const values=['=1+1','+1+1','-1+1','@SUM(1,2)','\ttext','\rtext','\ntext','＝1+1','＋1+1','－1+1','＠SUM(1,2)','  =1+1','\u00a0+1+1','\ufeff=1+1','\u200b=1+1',' \tordinary','\u0001=1+1']
 const csv=spreadsheetCsv(values.map(value=>[value])),rows=parse(csv)
 assert.equal(rows.length,values.length)
 rows.forEach((row,index)=>assert.equal(row[0],"'"+values[index]))
 assert.ok(csv.startsWith('"\'=1+1"'))
})
test('ordinary names, punctuation-sensitive skills, non-Latin text and internal line breaks stay intact',()=>{
 const values=['Fixture person','C++','C#','São José','パン屋','Baking + pastry','A@B','line one\nline two','word, next','a "quoted" word']
 assert.deepEqual(parse(spreadsheetCsv([values])),[values])
})
test('negative numeric values remain numbers at serialization while dangerous numeric-looking strings stay text',()=>{
 const row=[-12,0,42,true,false,null,undefined,'-12','+639000000000']
 const values=parse(spreadsheetCsv([row]))[0]
 assert.deepEqual(values,['-12','0','42','true','false','','',"'-12","'+639000000000"])
})
test('object headers and explicit field/data shapes receive the same protection',()=>{
 const objectCsv=spreadsheetCsv([{'=Heading':'@value','Plain':'ordinary'}])
 assert.deepEqual(parse(objectCsv),[["'=Heading",'Plain'],["'@value",'ordinary']])
 const explicit=spreadsheetCsv({fields:['Safe','+Header'],data:[['=1+1',7]]})
 assert.deepEqual(parse(explicit),[['Safe',"'+Header"],["'=1+1",'7']])
})
test('embedded delimiter/quote sequences never create a new formula cell or extra row',()=>{
 const payloads=['plain,=1+1','plain";=1+1','plain",=1+1','plain\r\n=1+1','"\n=1+1','safe;=1+1']
 const rows=parse(spreadsheetCsv(payloads.map(value=>({Label:value,Count:1}))))
 assert.deepEqual(rows[0],['Label','Count']);assert.equal(rows.length,payloads.length+1)
 payloads.forEach((value,index)=>assert.deepEqual(rows[index+1],[value,'1']))
})
test('already literal-marked fields are not repeatedly prefixed and sequential exports are deterministic',()=>{
 const source=[{A:"'=1+1",B:'=1+1'}],one=spreadsheetCsv(source)
 assert.equal(one,spreadsheetCsv(source))
 assert.deepEqual(parse(one),[['A','B'],["'=1+1","'=1+1"]])
 for(let i=0;i<4;i++)assert.equal(parse(spreadsheetCsv([['=1+1','=1+1']]))[0][1],"'=1+1")
})
test('export protection leaves source records and static vacancy template shapes intact',()=>{
 const source=[{Name:'=1+1',Notes:'line\ntext',Count:3}],before=structuredClone(source)
 spreadsheetCsv(source);assert.deepEqual(source,before)
 const template=[['Company Name','Position','Slots'],['Fixture company','C++ developer','15']]
 assert.deepEqual(parse(spreadsheetCsv(template)),template)
})
