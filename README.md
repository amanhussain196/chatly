# Chatly

A real-time voice and chat platform for friends to play games together.

## Features
- **No Login:** Just enter a username and go.
- **Rooms:** Create or join private rooms with codes.
- **Voice Chat:** Real-time WebRTC voice communication.
- **Text Chat:** Instant messaging with emoji support (native).
- **Responsive:** Works great on Mobile and Desktop.

## How to Run

### Prerequisites
- Node.js installed

### Steps
1. **Start the Server:**
   ```bash
   cd server
   npm install
   npm run dev
   ```
   (Server runs on port 3001)

2. **Start the Client:**
   ```bash
   cd client
   npm install
   npm run dev
   ```
   (Client runs on port 5173 usually)

3. **Open in Browser:**
   Go to `http://localhost:5173`

## Building Android APK
This project uses Capacitor to wrap the web app.

1. **Build the Web App:**
   ```bash
   cd client
   npm run build
   ```

2. **Sync with Capacitor:**
   ```bash
   npx cap add android
   npx cap sync
   ```

3. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```
   From Android Studio, you can build the signed APK or run on a simulator/device.

## Tech Stack
- Client: React, Vite, TypeScript, Simple-Peer (WebRTC), Socket.io-client
- Server: Node.js, Express, Socket.io
- Stylng: Vanilla CSS (Dark Premium Theme)
