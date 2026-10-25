import {test,expect} from '@playwright/test'
import {createHash} from 'node:crypto'
test('extraction hashing and completed-run reuse work in a real browser without Node modules',async({page,context})=>{
 await context.route('https://*.supabase.co/**',route=>route.abort())
 await page.goto('/login')
 const text='Synthetic résumé: Excel, C++ and 東京',type='vacancy',kind='requirements'
 const expected=createHash('sha256').update('ai-extraction-v1\n'+type+'\n'+kind+'\n'+text).digest('hex')
 const result=await page.evaluate(async({text,type,kind})=>{
  const {computeInputHash,findExistingExtraction}=await import('/src/services/aiExtractionService.js')
  const hash=await computeInputHash(text,type,kind)
  const completed={id:'synthetic-completed',input_hash:hash,status:'completed'}
  const failed={id:'synthetic-failed',input_hash:hash,status:'failed'}
  return {secure:window.isSecureContext,hash,reused:(await findExistingExtraction(text,type,kind,[failed,completed]))?.id,
   failedReuse:await findExistingExtraction(text,type,kind,[failed]),
   changed:await computeInputHash(text+' changed',type,kind),
   otherType:await computeInputHash(text,'jobseeker','profile')}
 },{text,type,kind})
 expect(result.secure).toBe(true)
 expect(result.hash).toBe(expected)
 expect(result.reused).toBe('synthetic-completed')
 expect(result.failedReuse).toBeNull()
 expect(result.changed).not.toBe(expected)
 expect(result.otherType).not.toBe(expected)
})
