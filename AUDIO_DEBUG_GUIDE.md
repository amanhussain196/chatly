# Quick Debug Guide - Mobile Audio Issues

## Quick Checks (30 seconds)

### 1. Check AudioContext State
Open Chrome DevTools (chrome://inspect) and run:
```javascript
// In browser console
console.log('AudioContext state:', window.audioContext?.state);
```
**Expected:** `running`  
**If suspended:** User hasn't interacted with the page yet

### 2. Check Audio Tracks
```javascript
// Check if local stream has audio tracks
const audioTracks = localStream?.getAudioTracks();
console.log('Audio tracks:', audioTracks?.length);
console.log('Track enabled:', audioTracks?.[0]?.enabled);
console.log('Track state:', audioTracks?.[0]?.readyState);
```
**Expected:** 
- Length: 1
- Enabled: true
- State: "live"

### 3. Check Audio Element
```javascript
// Find audio elements
const audioElements = document.querySelectorAll('audio');
audioElements.forEach((audio, i) => {
    console.log(`Audio ${i}:`, {
        srcObject: !!audio.srcObject,
        paused: audio.paused,
        volume: audio.volume,
        muted: audio.muted,
        readyState: audio.readyState
    });
});
```
**Expected:**
- srcObject: true
- paused: false
- volume: 1
- muted: false
- readyState: 4 (HAVE_ENOUGH_DATA)

---

## Common Issues & Quick Fixes

### Issue 1: "NotAllowedError: play() failed"
**Cause:** User hasn't interacted with the page  
**Fix:** 
```javascript
// Force unlock audio
document.addEventListener('click', async () => {
    const audioContext = new AudioContext();
    await audioContext.resume();
    console.log('Audio unlocked!');
}, { once: true });
```
**User Action:** Tap anywhere on the screen

---

### Issue 2: AudioContext state is "suspended"
**Cause:** Mobile browser auto-suspends AudioContext  
**Fix:**
```javascript
// Resume AudioContext
const audioContext = new AudioContext();
await audioContext.resume();
console.log('New state:', audioContext.state);
```
**User Action:** Tap screen or press any button

---

### Issue 3: Audio element has no srcObject
**Cause:** Stream not set or WebRTC connection failed  
**Fix:**
```javascript
// Check WebRTC connection
console.log('Peers:', peers);
console.log('Local stream:', localStream);

// Manually set stream (for testing)
const audioEl = document.querySelector('audio');
audioEl.srcObject = localStream;
await audioEl.play();
```
**Check:** WebRTC logs for connection errors

---

### Issue 4: Audio plays but no sound
**Cause:** Volume is 0 or muted  
**Fix:**
```javascript
// Check and fix volume
const audioEl = document.querySelector('audio');
console.log('Volume:', audioEl.volume, 'Muted:', audioEl.muted);
audioEl.volume = 1.0;
audioEl.muted = false;
```

---

### Issue 5: "Timeout waiting for loadedmetadata"
**Cause:** Stream is not ready or invalid  
**Fix:**
```javascript
// Check stream validity
const stream = audioEl.srcObject;
console.log('Stream:', stream);
console.log('Active:', stream?.active);
console.log('Tracks:', stream?.getTracks());

// Check if tracks are active
stream?.getTracks().forEach(track => {
    console.log('Track:', track.kind, 'State:', track.readyState, 'Enabled:', track.enabled);
});
```
**Expected:** All tracks should be "live" and enabled

---

## Emergency Recovery Commands

### Force Audio Restart
```javascript
// Stop all current audio
document.querySelectorAll('audio').forEach(audio => {
    audio.pause();
    audio.srcObject = null;
});

// Get fresh stream
const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
console.log('New stream:', newStream.id);

// Set to audio element
const audioEl = document.querySelector('audio');
audioEl.srcObject = newStream;
await audioEl.play();
```

### Reset WebRTC Connection
```javascript
// In Room component, trigger re-initialization
// This would need to be exposed via a debug button
window.location.reload(); // Quick but dirty fix
```

---

## Monitoring Audio in Real-Time

### Add Visual Indicators
```javascript
// Monitor audio levels
const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();
const source = audioContext.createMediaStreamSource(stream);
source.connect(analyser);

const dataArray = new Uint8Array(analyser.frequencyBinCount);

function checkAudioLevel() {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    console.log('Audio level:', average);
    requestAnimationFrame(checkAudioLevel);
}
checkAudioLevel();
```

---

## Log Filtering

### Show Only Audio Logs
```javascript
// In Chrome DevTools Console, use filter:
[Audio]
[App]
```

### Show Only Errors
```javascript
// Filter by:
failed
error
Error
```

---

## Network Debugging

### Check STUN/TURN Servers
```javascript
// Test STUN server connectivity
const pc = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
});

pc.onicecandidate = (e) => {
    if (e.candidate) {
        console.log('ICE Candidate:', e.candidate.type, e.candidate.address);
    }
};

// Create dummy offer to trigger ICE gathering
pc.createOffer().then(offer => pc.setLocalDescription(offer));
```

**Expected:** Should see "srflx" or "relay" candidates

---

## Performance Monitoring

### Check Audio Processing Delay
```javascript
// Monitor audio latency
const audioEl = document.querySelector('audio');
console.log('Buffered:', audioEl.buffered.length);
if (audioEl.buffered.length > 0) {
    console.log('Buffer start:', audioEl.buffered.start(0));
    console.log('Buffer end:', audioEl.buffered.end(0));
    console.log('Current time:', audioEl.currentTime);
}
```

---

## Mobile-Specific Checks

### Check WebView Version
```javascript
// In Android WebView
console.log('User Agent:', navigator.userAgent);
// Look for Chrome version number
```
**Minimum Required:** Chrome 90+

### Check Permissions
```javascript
// Check microphone permission
navigator.permissions.query({ name: 'microphone' })
    .then(result => {
        console.log('Microphone permission:', result.state);
    });
```
**Expected:** "granted"

---

## When All Else Fails

1. **Clear App Data:**
   - Settings → Apps → Chatly → Storage → Clear Data

2. **Reinstall APK:**
   - Uninstall completely
   - Restart device
   - Install fresh APK

3. **Test on Different Device:**
   - Try newer Android version
   - Try different manufacturer

4. **Check Server Logs:**
   - Verify WebRTC signaling is working
   - Check for CORS issues
   - Verify STUN/TURN server accessibility

---

## Contact Developer With:

When reporting issues, include:

1. **Device Info:**
   ```javascript
   console.log({
       userAgent: navigator.userAgent,
       platform: navigator.platform,
       vendor: navigator.vendor
   });
   ```

2. **Console Logs:**
   - Full console output from app start to error
   - Filter for [Audio] and [App] tags

3. **Network Info:**
   - WiFi or Mobile Data?
   - Network speed
   - Any VPN or proxy?

4. **Exact Steps:**
   - What you did
   - What you expected
   - What actually happened

5. **Screenshots/Recording:**
   - Screen recording of the issue
   - Screenshot of console errors

---

**Last Updated:** 2026-01-28
