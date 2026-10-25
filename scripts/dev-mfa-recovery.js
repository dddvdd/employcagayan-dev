import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { devClients } from './lib/devClients.js'
import { recoverPartnerMfa } from './lib/mfaRecovery.js'

// Run only on a trusted DEV operator workstation. Secrets are requested through
// masked terminal input, never command arguments, browser code or log files.
const {values}=parseArgs({options:{target:{type:'string'},case:{type:'string'},method:{type:'string',default:'in_person'},request:{type:'string'},'identity-verified':{type:'boolean',default:false}}})
if(!values.target || (!values.request && (!values.case || !values['identity-verified']))) throw new Error('Specify target and verified identity case, or an existing request to resume')
if(!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Recovery requires an interactive trusted terminal')
const output=new Writable({write(chunk,encoding,callback){callback()}})
output.isTTY=true
output.columns=process.stdout.columns ?? 80
const terminal=createInterface({input:process.stdin,output,terminal:true})
const secret=async prompt=>{process.stdout.write(prompt);const value=await terminal.question('');process.stdout.write('\n');return value}
const safe=(value,label)=>{if(value.error) throw new Error(`${label} failed (${value.error.code ?? value.error.status ?? 'request'})`);return value.data}
let actor
let request
try {
  const clients=await devClients()
  actor=clients.normal()
  const email=await secret('Authorized administrator email: ')
  const password=await secret('Administrator password (hidden): ')
  safe(await actor.auth.signInWithPassword({email,password}),'Administrator sign-in')
  const factors=safe(await actor.auth.mfa.listFactors(),'Administrator factor list').totp.filter(factor=>factor.status==='verified')
  if(!factors.length) throw new Error('Enroll your administrator authenticator through the application first')
  const code=await secret('Current administrator authenticator code (hidden): ')
  safe(await actor.auth.mfa.challengeAndVerify({factorId:factors[0].id,code}),'Administrator TOTP verification')
  const completed=await recoverPartnerMfa({actor,operator:clients.operator,targetUserId:values.target,
    verificationReference:values.case,verificationMethod:values.method,identityVerified:values['identity-verified'],requestId:values.request,
    onPrepared:id=>{request=id;process.stdout.write(`Approved recovery request: ${id}\n`)},
  })
  console.log(`Recovery ${completed.requestId} completed. The account must sign in and enroll a new authenticator before Partner access.`)
} catch(error) {
  console.error(`Recovery stopped: ${error.message}`)
  if(request) console.error(`The account may remain locked. Resume request ${request}; never reactivate it manually.`)
  process.exitCode=1
} finally {
  terminal.close()
  if(actor) await actor.auth.signOut({scope:'local'})
}
