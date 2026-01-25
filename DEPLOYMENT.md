# Deployment Guide for Chatly

## 1. Deploy the Server (Backend)

We will use **Render** (or Railway) for the backend because it supports persistent WebSocket connections.

1.  Create an account on [Render.com](https://render.com).
2.  Click **New +** and select **Web Service**.
3.  Connect your GitHub repository: `amanhussain196/chatly`.
4.  Configure the service:
    *   **Name**: `chatly-server` (or similar)
    *   **Root Directory**: `server`
    *   **Runtime**: Node
    *   **Build Command**: `npm install && npm run build` (Render usually runs install automatically, so `npm run build` is key)
    *   **Start Command**: `npm start`
5.  Click **Create Web Service**.
6.  Wait for the deployment to finish. Copy the **Service URL** (e.g., `https://chatly-server.onrender.com`).

## 2. Deploy the Client (Frontend)

We will use **Vercel** for the frontend for best performance and ease of use.

1.  Create an account on [Vercel.com](https://vercel.com).
2.  Click **Add New...** -> **Project**.
3.  Import your GitHub repository: `amanhussain196/chatly`.
4.  Configure the project:
    *   **Framework Preset**: Vite (should be detected automatically).
    *   **Root Directory**: Click "Edit" and select `client`.
    *   **Environment Variables**:
        *   Key: `VITE_SERVER_URL`
        *   Value: Paste your Render Service URL (e.g., `https://chatly-server.onrender.com`)
5.  Click **Deploy**.

## 3. Verify

1.  Open your Vercel deployment URL.
2.  Open the console (F12) to check for any connection errors.
3.  Test 2 clients connecting to the same room.
