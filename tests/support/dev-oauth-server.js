import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

const env = parseEnv(await readFile(new URL('../../.env.local',import.meta.url),'utf8'))
if (env.VITE_SUPABASE_URL !== 'https://cdmkzzmaswwiryymtycn.supabase.co') throw new Error('Local OAuth server requires DEV connection')
// A separate loopback-only HTTP test server avoids changing the app's normal
// HTTPS configuration or requiring anyone to bypass a certificate warning.
const server = await createServer({ configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,open:false} })
await server.listen()
server.printUrls()
process.on('SIGINT',async()=>{await server.close();process.exit(0)})
process.on('SIGTERM',async()=>{await server.close();process.exit(0)})
