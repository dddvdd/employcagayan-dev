import { createServer } from 'vite'

// Owning Vite in this process avoids shell-process-tree teardown hanging on
// restricted Windows environments. A busy port fails instead of reusing a
// server whose application/configuration we cannot verify.
export default async function localServer() {
  const testPort = Number(process.env.EMPLOY_PLAYWRIGHT_PORT || 5173)
  const server = await createServer({
    // Only this owned mock server exercises the prepared generation UI.
    // Actual DEV builds keep their publication-dependent feature gate.
    define: { 'import.meta.env.VITE_ENABLE_MANAGED_EXTRACTION': JSON.stringify('true') },
    server: { host: '127.0.0.1', port: testPort, strictPort: true, open: false },
  })
  try {
    await server.listen()
  } catch (error) {
    await server.close()
    throw error
  }
  return () => server.close()
}
