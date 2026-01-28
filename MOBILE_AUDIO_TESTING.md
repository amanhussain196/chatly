# Mobile Audio Testing Checklist

## Pre-Testing Setup
- [ ] Build the APK with the latest changes
- [ ] Install APK on test device
- [ ] Enable Chrome DevTools for WebView debugging (if needed)
- [ ] Clear app data before testing

## Test Scenarios

### 1. First Install - Fresh Start
**Steps:**
1. Install APK on device
2. Open app for first time
3. Complete login/authentication
4. **TAP ANYWHERE** on the screen (this is critical!)
5. Navigate to a room or DM
6. Initiate a call

**Expected Result:**
- [ ] Audio works on first call attempt
- [ ] Console shows: `[App] Global AudioContext created`
- [ ] Console shows: `[App] Global AudioContext resumed after user interaction`
- [ ] Console shows: `[Audio] Audio playing successfully`

**Status:** ___________

---

### 2. Cold Start Test
**Steps:**
1. Force close the app completely
2. Reopen the app
3. Navigate to a room
4. Make a call immediately (without much interaction)

**Expected Result:**
- [ ] Audio works within 1-2 seconds
- [ ] May see "🔊 Connecting..." briefly
- [ ] Console shows retry attempts if needed
- [ ] Audio eventually plays successfully

**Status:** ___________

---

### 3. Incoming Call Test
**Steps:**
1. Have another user call you
2. Accept the incoming call
3. Listen for audio

**Expected Result:**
- [ ] Audio from caller is heard immediately
- [ ] Your audio is transmitted to caller
- [ ] No delay or silence

**Status:** ___________

---

### 4. Multiple Calls Test
**Steps:**
1. Make a call, talk for 10 seconds
2. End the call
3. Immediately make another call
4. Repeat 3-4 times

**Expected Result:**
- [ ] First call: Audio works
- [ ] Second call: Audio works immediately
- [ ] Third call: Audio works immediately
- [ ] Fourth call: Audio works immediately
- [ ] No degradation in audio quality

**Status:** ___________

---

### 5. Background/Foreground Test
**Steps:**
1. Start a call
2. Press home button (app goes to background)
3. Wait 5 seconds
4. Return to app (foreground)
5. Continue talking

**Expected Result:**
- [ ] Audio continues working after returning
- [ ] No reconnection needed
- [ ] Audio quality remains good

**Status:** ___________

---

### 6. Permission Denied Test
**Steps:**
1. Deny microphone permission
2. Try to make a call
3. Grant permission when prompted
4. Try call again

**Expected Result:**
- [ ] App handles permission denial gracefully
- [ ] After granting permission, audio works
- [ ] Clear error message shown to user

**Status:** ___________

---

### 7. Network Switch Test
**Steps:**
1. Start a call on WiFi
2. Switch to mobile data mid-call
3. Continue talking

**Expected Result:**
- [ ] Call continues without dropping
- [ ] Audio may have brief interruption but recovers
- [ ] Connection re-establishes automatically

**Status:** ___________

---

### 8. Low Battery Test
**Steps:**
1. Test with device battery below 20%
2. Make a call
3. Check audio quality

**Expected Result:**
- [ ] Audio works normally
- [ ] No battery-saving interference
- [ ] Audio quality is consistent

**Status:** ___________

---

## Debug Console Logs to Check

### Success Indicators:
```
✅ [App] Global AudioContext created, state: running
✅ [App] Global AudioContext resumed after user interaction, state: running
✅ [Audio] Direct stream provided
✅ [Audio] Attempting to play audio stream (attempt 1)...
✅ [Audio] Audio metadata loaded
✅ [Audio] Audio playing successfully
✅ Audio track enabled: <id>, state: live
```

### Warning Signs:
```
⚠️ [Audio] Audio play failed (attempt X): NotAllowedError
⚠️ [Audio] Retrying in Xms...
⚠️ [Audio] Max retries reached. Waiting for user interaction...
```

### Error Indicators:
```
❌ [Audio] Failed to initialize/resume AudioContext
❌ [Audio] Audio play failed: <error>
❌ Failed to get user media: <error>
```

---

## Device Testing Matrix

| Device Model | Android Version | Test Result | Notes |
|--------------|----------------|-------------|-------|
| ____________ | ______________ | ⬜ Pass ⬜ Fail | _____ |
| ____________ | ______________ | ⬜ Pass ⬜ Fail | _____ |
| ____________ | ______________ | ⬜ Pass ⬜ Fail | _____ |

---

## Known Issues & Workarounds

### Issue: Audio still not working on first call
**Workaround:** 
- Ensure user taps screen at least once before making call
- Check if AudioContext is in 'running' state in console

### Issue: Audio works but with delay
**Workaround:**
- This is normal for first 1-2 seconds
- Check network latency
- Verify STUN/TURN servers are reachable

### Issue: Audio cuts out intermittently
**Workaround:**
- Check network stability
- Verify device is not in battery saver mode
- Check for background apps consuming resources

---

## Regression Testing

After confirming audio works, verify these features still work:

- [ ] Text messaging in rooms
- [ ] Text messaging in DMs
- [ ] User presence indicators
- [ ] Mute/unmute functionality
- [ ] Voice visualizer animations
- [ ] Game functionality (if applicable)
- [ ] Friend system
- [ ] Notifications

---

## Sign-Off

**Tester Name:** _______________
**Date:** _______________
**Overall Result:** ⬜ Pass ⬜ Fail
**Comments:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## Next Steps if Tests Fail

1. Check console logs for specific errors
2. Verify AudioContext state
3. Test on different Android version
4. Check WebView version on device
5. Review MOBILE_AUDIO_FIX.md for troubleshooting
6. Contact developer with:
   - Device model and Android version
   - Console logs
   - Specific test scenario that failed
   - Screenshots/screen recordings if possible
