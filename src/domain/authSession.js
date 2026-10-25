// Prevent late account reads from surviving logout, token changes or unmount.
// Supabase calls run outside the synchronous auth-event callback.
export function createAuthSessionController({ getSession, loadAccount, subscribe, publish, defer = setTimeout, cancelDeferred = clearTimeout }) {
  let revision = 0
  let stopped = false
  let timer = null
  let unsubscribe = () => {}
  const empty = { session: null, profile: null, assurance: null, factors: [], error: null, loading: false }

  async function resolve(session, ticket) {
    try {
      const account = await loadAccount(session)
      if (!stopped && ticket === revision) publish({ ...empty, ...account, session, loading: false })
    } catch {
      if (!stopped && ticket === revision) publish({ ...empty, session, error: 'We could not verify your account. Check your connection and try again.' })
    }
  }

  function accept(session) {
    const ticket = ++revision
    if (timer !== null) cancelDeferred(timer)
    timer = null
    if (stopped) return
    if (!session?.user) return publish(empty)
    publish({ ...empty, session, loading: true })
    timer = defer(() => { timer = null; void resolve(session, ticket) }, 0)
  }

  async function refresh() {
    const ticket = ++revision
    if (timer !== null) cancelDeferred(timer)
    timer = null
    if (stopped) return
    publish({ ...empty, loading: true })
    try {
      const { session } = await getSession()
      if (stopped || ticket !== revision) return
      if (!session?.user) return publish(empty)
      publish({ ...empty, session, loading: true })
      await resolve(session, ticket)
    } catch {
      if (!stopped && ticket === revision) publish({ ...empty, error: 'We could not restore your session. Please try again.' })
    }
  }

  return {
    start() {
      const ticket = revision
      unsubscribe = subscribe((_event, session) => accept(session))
      void getSession().then(({ session }) => {
        if (!stopped && ticket === revision) accept(session)
      }).catch(() => {
        if (!stopped && ticket === revision) publish({ ...empty, error: 'We could not restore your session. Please try again.' })
      })
    },
    refresh,
    clear() { accept(null) },
    stop() {
      stopped = true
      revision += 1
      if (timer !== null) cancelDeferred(timer)
      unsubscribe()
    },
  }
}
