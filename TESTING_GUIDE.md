# Quick Testing Guide

## 🚀 How to Test the Fixes

### 1. Loading Time Test
```
Expected: App loads in < 5 seconds even on slow network
```

**Steps:**
1. Clear browser cache
2. Open app on slow 3G network (or throttle network in DevTools)
3. Time from page load to seeing the home screen
4. ✅ Should complete within 5 seconds
5. ❌ If stuck on "Loading..." for >5s, check console for timeout warnings

**Console Logs to Watch:**
- `[Auth] Auth initialization timeout, proceeding...` (if slow)
- `[Socket] Connection timeout` (if socket slow)
- `Connected to socket server` (success)

---

### 2. WebRTC Voice Test

#### Test A: Mobile Network (MOST IMPORTANT)
```
Expected: Voice works on 4G/5G mobile networks
```

**Steps:**
1. User A: Join room on mobile 4G/5G
2. User B: Join same room on WiFi
3. Both enable microphone
4. Check if both can hear each other
5. ✅ Voice should work (may take 3-5 seconds to connect)
6. Check logs for TURN usage

**Console Logs to Watch:**
```
[WebRTC] Requesting user media...
[WebRTC] Got local stream: <id> with 1 audio tracks
[WebRTC] New user ready: <peer-id>
[WebRTC] ICE state (Init) <peer-id>: checking
[WebRTC] ICE state (Init) <peer-id>: connected  ✅
[WebRTC] Received stream from <peer-id>
[Audio] Audio playing successfully
```

**If Connection Fails:**
```
[WebRTC] Peer error (Recv) <peer-id>: Connection failed
[WebRTC] Attempting to reconnect to <peer-id>...  ← Should see this!
[WebRTC] ICE state (Init) <peer-id>: checking
[WebRTC] ICE state (Init) <peer-id>: connected  ← Should succeed on retry
```

#### Test B: 1-1 Call
```
Expected: Direct calls work reliably
```

**Steps:**
1. User A calls User B
2. User B accepts
3. Both should hear each other
4. If connection fails, should auto-reconnect within 3 seconds

#### Test C: Room with Multiple Users
```
Expected: Voice works with 3+ users
```

**Steps:**
1. Create room
2. 3+ users join
3. All enable microphones
4. Everyone should hear everyone else
5. Check logs for multiple peer connections

---

## 🔍 Debugging WebRTC Issues

### Check ICE Candidates
Open browser console and type:
```javascript
// This will show you what type of connection is being used
// Look for "relay" (TURN) or "host"/"srflx" (STUN)
```

### Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **No audio** | Peer connects but no sound | Check microphone permissions, audio element muted |
| **Connection failed** | Peer error in logs | Wait 3s for auto-reconnect, check TURN servers |
| **Slow connection** | Takes >10s to connect | Normal on mobile, TURN relay is slower than direct |
| **Audio cuts out** | Connected then disconnects | Network instability, should auto-reconnect |

---

## 📊 Expected Behavior

### Connection Timeline:
```
0s:   User joins room
0s:   Request microphone permission
1s:   Got local stream
1s:   Emit webrtc_ready
2s:   Receive signal from peer
2s:   ICE state: checking
3-5s: ICE state: connected ✅
5s:   Receive remote stream
5s:   Audio playing
```

### On Mobile Network (with TURN):
```
0s:   User joins room
0s:   Request microphone permission
1s:   Got local stream
1s:   Emit webrtc_ready
2s:   Receive signal from peer
2s:   ICE state: checking
5-8s: ICE gathering (trying STUN, then TURN)
8-10s: ICE state: connected (via TURN relay) ✅
10s:  Receive remote stream
10s:  Audio playing
```

---

## 🎯 Success Criteria

✅ **Loading Time:**
- App loads in < 5 seconds on 3G
- No indefinite "Loading..." screen

✅ **WebRTC Audio:**
- Voice works on mobile 4G/5G networks
- Auto-reconnects on temporary failures
- Logs show ICE state transitions
- TURN servers used when needed

✅ **User Experience:**
- Clear "Connecting..." indicator
- Audio plays within 10 seconds
- No manual reconnection needed

---

## 🛠️ Advanced Debugging

### Enable Verbose WebRTC Logs:
Add to browser console:
```javascript
localStorage.setItem('debug', 'simple-peer,socket.io-client');
```

### Check TURN Server Connectivity:
```bash
# Test if TURN server is reachable
curl -v turn:openrelay.metered.ca:80
```

### Monitor Network Traffic:
1. Open DevTools → Network tab
2. Filter: WS (WebSocket)
3. Look for Socket.io messages
4. Check for 'signal' events with ICE candidates

---

## 📝 Report Issues

If voice still doesn't work, collect:
1. Console logs (full)
2. Network type (WiFi/4G/5G)
3. Browser and OS version
4. Screenshot of WebRTC logs
5. Time taken to fail/connect
