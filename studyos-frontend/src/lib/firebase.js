import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

export const isSupabaseConfigured = isFirebaseConfigured;

const app = isFirebaseConfigured
  ? (!getApps().length ? initializeApp(firebaseConfig) : getApp())
  : null;

export const firebaseAuth = app ? getAuth(app) : null;

// Firebase auth client
export const authClient = {
  auth: {
    onAuthStateChange: (callback) => {
      if (!firebaseAuth) {
        return { data: { subscription: { unsubscribe: () => {} } } };
      }
      const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
        let session = null;
        if (user) {
          const token = await user.getIdToken();
          session = {
            access_token: token,
            user: {
              id: user.uid,
              email: user.email,
              user_metadata: { name: user.displayName, avatar_url: user.photoURL }
            }
          };
        }
        callback('SIGNED_IN', session);
      });
      return { data: { subscription: { unsubscribe } } };
    },
    signInWithPassword: async ({ email, password }) => {
      if (!firebaseAuth) {
        return { data: null, error: new Error('Firebase Auth is not configured') };
      }
      try {
        const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
        return { data: result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    signOut: () => (firebaseAuth ? firebaseSignOut(firebaseAuth) : Promise.resolve())
  }
};

export const supabase = authClient;
