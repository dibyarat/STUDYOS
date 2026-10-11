import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
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
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const rawJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const credentials = JSON.parse(rawJson);
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
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'campassist-1ffac';
    firebaseApp = initializeApp({
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    });
  }

  return firebaseApp;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}

