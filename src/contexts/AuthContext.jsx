import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { authService } from '../services/authService'
import { createAuthSessionController } from '../domain/authSession.js'
import { needsMfaChallenge } from '../domain/authPolicy.js'
import { rememberAuthCategory } from '../lib/authIntent.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [account, setAccount] = useState({ session: null, profile: null, assurance: null, factors: [], loading: true, error: null })
  const controller = useRef(null)

  useEffect(() => {
    const current = createAuthSessionController({
      getSession: authService.getSession,
      loadAccount: authService.loadAccount,
      subscribe(handler) {
        const { data: { subscription } } = authService.onAuthStateChange(handler)
        return () => subscription.unsubscribe()
      },
      publish: setAccount,
    })
    controller.current = current
    current.start()
    return () => {
      current.stop()
      if (controller.current === current) controller.current = null
    }
  }, [])

  const refreshAccount = useCallback(() => controller.current?.refresh(), [])
  const signInWithGoogle = useCallback(({ category = 'jobseeker' } = {}) => {
    rememberAuthCategory(category)
    const redirectTo = new URL('/auth/callback', window.location.origin).toString()
    return authService.signInWithGoogle(redirectTo)
  }, [])
  const signInWithPassword = useCallback((email, password) => {
    rememberAuthCategory('partner')
    return authService.signInWithPassword(email, password)
  }, [])
  const signOut = useCallback(async () => {
    controller.current?.clear()
    return authService.signOut()
  }, [])

  const value = useMemo(() => ({
    ...account,
    user: account.session?.user ?? null,
    mfaRequired: needsMfaChallenge(account.profile, account.assurance, account.factors),
    refreshAccount, signInWithGoogle, signInWithPassword, signOut,
  }), [account, refreshAccount, signInWithGoogle, signInWithPassword, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
