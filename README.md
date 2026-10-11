# StudyOS

StudyOS is a collaborative academic workspace featuring a React + Vite frontend with an Express, Prisma, and PostgreSQL backend.

---

## Architecture Overview

- **Frontend (`/studyos-frontend`)**: React, Vite, Lucide Icons, Firebase Web SDK (Auth).
- **Backend (`/backend`)**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Firebase Admin SDK, Cloudinary.

---

## Local Development

1. **Backend setup**:
   - Copy `backend/.env.template` to `backend/.env` and fill in your PostgreSQL URL, Firebase Admin credentials, and Cloudinary settings.
   - Install dependencies:
     ```bash
     cd backend
     npm install
     ```
   - Run Prisma migrations and generate client:
     ```bash
     npx prisma migrate deploy
     npx prisma generate
     ```
   - Start the backend server:
     ```bash
     npm run dev
     ```

2. **Frontend setup**:
   - Copy `studyos-frontend/.env.example` to `studyos-frontend/.env` and configure your Firebase Web credentials and backend URL (`http://localhost:3001/api/v1/studyos`).
   - Install dependencies:
     ```bash
     cd ../studyos-frontend
     npm install
     ```
   - Start the Vite dev server:
     ```bash
     npm run dev
     ```

---

## Backend Deployment (Render)

### Option 1: Render Blueprint (Automatic via `render.yaml`)

1. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
2. Connect your GitHub repository (`STUDYOS`).
3. Render reads `render.yaml` automatically and creates the `studyos-backend` web service.
4. Fill in the required environment variables in the Render dashboard and deploy!

### Option 2: Manual Web Service Setup on Render

1. Click **New > Web Service** and connect your repository.
2. Configure settings:
   - **Name**: `studyos-backend`
   - **Root Directory**: `backend`
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:migrate` *(runs Prisma migrations before starting)*
   - **Health Check Path**: `/health`
3. Add Environment Variables:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: PostgreSQL connection string (pooled or transaction pooler)
   - `DIRECT_URL`: PostgreSQL direct connection string (required by Prisma for migrations)
   - `FRONTEND_URL`: Production URL of your deployed frontend (e.g. `https://studyos.vercel.app`)
   - `CORS_ORIGINS`: Optional comma-separated origins (e.g. preview deployment URLs)
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID
   - `FIREBASE_STORAGE_BUCKET`: Your Firebase storage bucket
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: Full JSON contents of your Firebase service account key
   - `CLOUDINARY_CLOUD_NAME`: Cloudinary cloud name
   - `CLOUDINARY_API_KEY`: Cloudinary API key
   - `CLOUDINARY_API_SECRET`: Cloudinary API secret

> **Note**: Render provides `PORT` automatically. Never commit `.env` files or service account JSON files to GitHub.

---

## Frontend Deployment (Vercel)

1. Import the repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `studyos-frontend`.
3. Set the Framework Preset to **Vite**.
4. Configure Environment Variables in Vercel:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_CAMPUSMATE_URL`
   - `VITE_API_URL`: Your Render backend base URL ending in `/api/v1/studyos` (e.g. `https://studyos-backend.onrender.com/api/v1/studyos`)
5. After deploying both:
   - Copy your Vercel deployment URL and set it as `FRONTEND_URL` on Render.
   - Trigger a redeploy on Render if needed so CORS allows requests from your Vercel domain.