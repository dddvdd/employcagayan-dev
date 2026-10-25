import {readFile,writeFile,stat} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {prepareDataset} from './lib/matching-evaluation-schema.mjs'
import {evaluateMatchingDataset} from './lib/matching-evaluation.mjs'
export async function runMatchingEvaluation(args,{stdout=process.stdout,stderr=process.stderr}={}){
 try{
  const [command,input,output,...options]=args
  if(command==='--help'&&args.length===1){
   stdout.write('Local matching evaluation. No network or database access.\nPrepare blinded pending reviews: node scripts/evaluate-matching.mjs prepare INPUT.json OUTPUT.json\nEvaluate labels: node scripts/evaluate-matching.mjs evaluate DATASET.json REPORT.json [--k N] [--split validation|calibration]\nOutputs must be new files. Synthetic cases never establish reviewed employment quality.\n');return 0
  }
  if(!['prepare','evaluate'].includes(command)||!input||!output||resolve(input)===resolve(output))throw Error('EVALUATION_ARGUMENTS')
  const settings={},seen=new Set()
  for(let i=0;i<options.length;i+=2){
   const option=options[i],value=options[i+1]
   if(command!=='evaluate'||!['--k','--split'].includes(option)||seen.has(option)||value===undefined)throw Error('EVALUATION_ARGUMENTS')
   seen.add(option)
   if(option==='--k'){if(!/^[1-9]\d?$|^100$/.test(value))throw Error('EVALUATION_ARGUMENTS');settings.k=Number(value)}
   else{if(!['validation','calibration'].includes(value))throw Error('EVALUATION_ARGUMENTS');settings.split=value}
  }
  if((await stat(input)).size>20*1024*1024)throw Error('EVALUATION_FILE_SIZE')
  const bytes=await readFile(input)
  if(bytes.length>20*1024*1024)throw Error('EVALUATION_FILE_SIZE')
  let dataset;try{dataset=JSON.parse(bytes.toString('utf8'))}catch{throw Error('EVALUATION_JSON')}
  const result=command==='prepare'?prepareDataset(dataset):await evaluateMatchingDataset(dataset,settings)
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
  stdout.write(JSON.stringify(command==='prepare'?{operation:'prepared',cases:result.cases.length,review_status:'pending'}:
   {operation:'evaluated',assessment:result.assessment,reviewed_cases:result.review_coverage.approved_cases,complete_queries:result.review_coverage.complete_queries,deployment_authorized:false})+'\n')
  return 0
 }catch(error){
  const safe=typeof error?.message==='string'&&/^EVALUATION_[A-Z_]+$/.test(error.message)?error.message:error?.code==='EEXIST'?'EVALUATION_OUTPUT_EXISTS':'EVALUATION_FAILED'
  stderr.write('Matching evaluation failed: '+safe+'. No source values or diagnostics were logged.\n');return 1
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runMatchingEvaluation(process.argv.slice(2))
