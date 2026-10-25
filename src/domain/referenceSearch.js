// Quote PostgREST values so punctuation stays data inside logical filters.
export function referenceTextFilter(columns,search){
 const literal=String(search).trim().replace(/[\\%_]/g,'\\$&')
 const value=JSON.stringify('%'+literal+'%')
 return columns.map(column=>column+'.ilike.'+value).join(',')
}
