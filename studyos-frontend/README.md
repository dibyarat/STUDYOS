# StudyOS Frontend

This is the existing StudyOS Vite + React frontend. It preserves the approved StudyOS visual interface while adding the Phase 1 Firebase authentication boundary for the shared CampusMate identity.

## Phase 1 Setup

Copy `.env.example` to `.env` and provide the Firebase configuration used by CampusMate:

```text
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=campassist-1ffac.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=campassist-1ffac
VITE_FIREBASE_STORAGE_BUCKET=campassist-1ffac.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_CAMPUSMATE_URL=https://campassist.me
```

Without Firebase values, the app intentionally shows a configuration state instead of pretending localStorage is production authentication. Once configured, the app resolves the existing Firebase session, gates the StudyOS UI, uses the authenticated user in the header, and supports sign out.

The workspace currently contains no CampusMate backend, Prisma schema, or storage implementation. Those integrations must be added in later phases without replacing the existing UI.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
