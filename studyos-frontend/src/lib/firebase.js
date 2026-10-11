import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';

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

export const app = isFirebaseConfigured
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
              emailVerified: Boolean(user.emailVerified),
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
    signUpWithPassword: async ({ email, password, name }) => {
      if (!firebaseAuth) {
        return { data: null, error: new Error('Firebase Auth is not configured') };
      }
      try {
        const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        if (name && result.user) {
          await updateProfile(result.user, { displayName: name });
        }
        try {
          await sendEmailVerification(result.user);
        } catch (verifErr) {
          console.warn('Initial email verification request notice:', verifErr);
        }
        return { data: result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    resetPasswordForEmail: async (email) => {
      if (!firebaseAuth) {
        return { error: new Error('Firebase Auth is not configured') };
      }
      try {
        await sendPasswordResetEmail(firebaseAuth, email);
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    resendVerificationEmail: async () => {
      if (!firebaseAuth || !firebaseAuth.currentUser) {
        return { error: new Error('No user is currently signed in.') };
      }
      try {
        await sendEmailVerification(firebaseAuth.currentUser);
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    signOut: () => (firebaseAuth ? firebaseSignOut(firebaseAuth) : Promise.resolve())
  }
};

