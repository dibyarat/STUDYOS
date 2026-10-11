import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { AuthContext } from './auth-context.js'

const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001/api/v1/studyos').replace(/\/$/, '');

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const authRequestId = useRef(0)

  const syncUserAndLoadProfile = useCallback(async (sessionUser, requestId) => {
    if (!sessionUser) {
      if (requestId === authRequestId.current) setProfile(null);
      return;
    }

    try {
      const syncResponse = await fetch(`${API_URL}/sync-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionUser.access_token || ''}`
        },
        body: JSON.stringify({
          name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || 'StudyOS User',
          avatarUrl: sessionUser.user_metadata?.avatar_url || ''
        })
      });
      if (!syncResponse.ok) {
        throw new Error('StudyOS account sync failed');
      }

      const res = await fetch(`${API_URL}/profile/${sessionUser.id}`, {
        headers: {
          Authorization: `Bearer ${sessionUser.access_token || ''}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (requestId === authRequestId.current) setProfile(data.user);
      } else {
        if (requestId === authRequestId.current) setProfile(null);
      }
    } catch (error) {
      if (requestId === authRequestId.current) {
        console.error('Failed to sync user or load profile:', error);
      }
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!session?.user?.id || !session.access_token) return;
    try {
      const response = await fetch(`${API_URL}/profile/${session.user.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Profile refresh failed');
      const data = await response.json();
      setProfile(data.user);
    } catch (error) {
      console.error('Failed to refresh StudyOS profile:', error);
      throw error;
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    let hasReceivedAuthEvent = false
    let lastAccessToken = null

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      const accessToken = nextSession?.access_token || null
      if (hasReceivedAuthEvent && accessToken === lastAccessToken) return
      hasReceivedAuthEvent = true
      lastAccessToken = accessToken
      const requestId = ++authRequestId.current
      setSession(nextSession);
      if (nextSession?.user) {
        syncUserAndLoadProfile({
          ...nextSession.user,
          access_token: nextSession.access_token,
        }, requestId).then(() => {
          if (active && requestId === authRequestId.current) setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    })

    return () => {
      active = false
      authRequestId.current += 1
      subscription.subscription.unsubscribe()
    }
  }, [syncUserAndLoadProfile])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  return <AuthContext.Provider value={{ session, user: session?.user || null, profile, loading, configured: isSupabaseConfigured, signIn, signOut, reloadProfile }}>{children}</AuthContext.Provider>
}
