import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import * as fs from 'fs';

let firebaseApp: App;

export function getFirebaseApp(): App {
  const apps = getApps();
  if (apps.length > 0) {
    firebaseApp = apps[0]!;
    return firebaseApp;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    firebaseApp = initializeApp({
      credential: cert(credentials),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else if (fs.existsSync(serviceAccountPath)) {
    const credentials = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    firebaseApp = initializeApp({
      credential: cert(credentials),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    firebaseApp = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    throw new Error('Firebase Admin SDK is not configured');
  }

  return firebaseApp;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}

