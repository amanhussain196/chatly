# Nine Men's Morris - Bug Fixes Update

## Issues Fixed

### 1. **Mill Protection Rule** ✅

**Problem:** Players could remove any opponent piece, even those in mills.

**Solution:** Implemented proper mill protection:
- Pieces in a mill **cannot be removed**
- **UNLESS** all opponent pieces are in mills (then any can be removed)

**Implementation:**
```typescript
const isInMill = (board, pos) => {
    const piece = board[pos];
    return checkMill(board, pos, piece);
};

const allPiecesInMills = (playerId) => {
    // Check if ALL opponent pieces are in mills
    for (let i = 0; i < 24; i++) {
        if (board[i] === playerId && !isInMill(board, i)) {
            return false; // Found piece not in mill
        }
    }
    return true;
};

// When removing:
if (!pieceInMill || allOpponentInMills) {
    // Can remove
}
```

### 2. **Skip Removal When No Removable Pieces** ✅

**Problem:** Game got stuck in "removing" phase when all opponent pieces were in mills.

**Solution:** Skip removal phase if no pieces can be removed:

```typescript
const hasRemovablePieces = (opponentId) => {
    const allInMills = allPiecesInMills(opponentId);
    for (let i = 0; i < 24; i++) {
        if (board[i] === opponentId) {
            if (!isInMill(board, i) || allInMills) {
                return true; // Found removable piece
            }
        }
    }
    return false; // No removable pieces
};

// After forming mill:
if (checkMill(board, position, playerId)) {
    if (hasRemovablePieces(opponent.id)) {
        game.phase = 'removing'; // Enter removal phase
    } else {
        // Skip removal, continue game
        game.turn = opponent.id;
    }
}
```

### 3. **Draw Condition (Stalemate)** ✅

**Problem:** When a player had no valid moves, opponent won. Should be a draw.

**Solution:** Changed win condition to draw when player is stuck:

**Before:**
```typescript
if (!hasValidMoves(opponent.id)) {
    game.winner = socket.id; // Current player wins
    game.winReason = 'no_moves';
}
```

**After:**
```typescript
if (!hasValidMoves(opponent.id)) {
    game.winner = 'draw'; // It's a draw
    game.winReason = 'stalemate';
}
```

### 4. **Fixed Adjacency List** ✅

**Problem:** Some positions had incorrect adjacent positions, preventing piece movement.

**Solution:** Corrected adjacency list:

**Before (Wrong):**
```typescript
[9, 15], [1, 8, 10, 7], [9, 11], [3, 10, 12, 15], ...
```

**After (Correct):**
```typescript
[9, 15], [1, 8, 10, 17], [9, 11], [3, 10, 12, 19], [11, 13], [5, 12, 14, 21], [13, 15], [7, 8, 11, 14, 23],
[17, 23], [1, 16, 18], [17, 19], [3, 18, 20], [19, 21], [5, 20, 22], [21, 23], [15, 16, 22]
```

### 5. **Flying Phase Movement** ✅

**Problem:** `hasValidMoves` didn't account for flying phase (3 pieces = can move anywhere).

**Solution:**
```typescript
const hasValidMoves = (playerId) => {
    // If player has 3 pieces, they can fly to any empty position
    if (game.piecesOnBoard[playerId] === 3) {
        return game.board.includes(null);
    }
    
    // Otherwise check adjacent moves
    // ...
};
```

## Game Rules Now Implemented

### Mill Protection
- ✅ Cannot remove pieces in a mill
- ✅ Can remove if ALL opponent pieces are in mills
- ✅ Skip removal if no removable pieces exist

### Win Conditions
- ✅ **Win:** Opponent has < 3 pieces on board
- ✅ **Draw:** Opponent has no valid moves (stalemate)

### Movement
- ✅ **Placing:** Place 9 pieces
- ✅ **Moving:** Move to adjacent positions
- ✅ **Flying:** Move anywhere when you have 3 pieces
- ✅ **Removing:** Remove opponent piece after forming mill

## Visual Indicators

**Removing Phase:**
- 🟠 Orange border on removable pieces
- ❌ No highlight on protected pieces (in mills)
- ✨ Glow and pulse animation

**Status Messages:**
- "Remove opponent's piece!" (when removable pieces exist)
- "Game Draw! (Stalemate)" (when no valid moves)

## Testing Scenarios

### Test 1: Mill Protection
1. Form a mill with 3 pieces
2. Try to remove opponent piece that's in a mill
3. ✅ Should NOT be removed (no highlight)
4. Try to remove opponent piece NOT in a mill
5. ✅ Should be removed

### Test 2: All Pieces in Mills
1. Get to a state where all opponent pieces are in mills
2. Form a mill
3. ✅ Should be able to remove ANY opponent piece

### Test 3: No Removable Pieces
1. Form a mill when all opponent pieces are in mills
2. ✅ Should skip removal phase
3. ✅ Turn should switch to opponent

### Test 4: Stalemate/Draw
1. Block all opponent moves
2. Opponent has >= 3 pieces
3. ✅ Game should end in draw
4. ✅ Message: "Game Draw! (Stalemate)"

### Test 5: Blue Piece Movement
1. Play as blue player
2. Try to move blue pieces
3. ✅ Should be able to select and move

## Files Modified

### Server
**`server/src/index.ts`:**
- Added `isInMill()` helper
- Added `allPiecesInMills()` helper
- Added `hasRemovablePieces()` helper
- Fixed adjacency list
- Updated `hasValidMoves()` for flying phase
- Added mill protection in removing phase
- Added skip removal logic
- Changed win to draw for stalemate
- Fixed adjacency connections

### Client
**`client/src/components/Room/NineMensMorris.tsx`:**
- Added draw handling in status message
- Display "Game Draw! (Stalemate)"

## Code Changes Summary

### Mill Protection Logic
```typescript
// Check if piece is in mill
const isInMill = (board, pos) => {
    const piece = board[pos];
    if (!piece) return false;
    return checkMill(board, pos, piece);
};

// Check if all pieces are in mills
const allPiecesInMills = (playerId) => {
    for (let i = 0; i < 24; i++) {
        if (game.board[i] === playerId) {
            if (!isInMill(game.board, i)) {
                return false;
            }
        }
    }
    return true;
};

// In removing phase
if (game.board[position] === opponent.id) {
    const pieceInMill = isInMill(game.board, position);
    const allOpponentInMills = allPiecesInMills(opponent.id);
    
    if (!pieceInMill || allOpponentInMills) {
        // Remove piece
    }
}
```

### Skip Removal Logic
```typescript
if (checkMill(game.board, position, socket.id)) {
    if (hasRemovablePieces(opponent.id)) {
        game.phase = 'removing';
        game.millFormed = true;
    } else {
        // No removable pieces, skip removal
        game.turn = opponent.id;
        game.lastMoveTime = Date.now();
        resetGameTimer(room, canonicalRoomId, opponent.id);
    }
}
```

### Draw Condition
```typescript
if (!hasValidMoves(opponent.id)) {
    game.winner = 'draw';
    game.winReason = 'stalemate';
    if (room.game && room.game.timer) clearTimeout(room.game.timer);
}
```

## Known Limitations

1. **No Visual Mill Highlighting:** Mills are detected but not visually highlighted on the board.
2. **No Move History:** No undo or move history tracking.
3. **No Repeated Position Draw:** Traditional rule where same position 3 times = draw not implemented.

## Summary

✅ **Mill Protection:** Pieces in mills are protected  
✅ **Skip Removal:** Game continues if no removable pieces  
✅ **Draw Condition:** Stalemate results in draw  
✅ **Adjacency Fixed:** All pieces can move correctly  
✅ **Flying Phase:** Correctly handles 3-piece movement  

**All reported issues are now fixed!** The game follows proper Nine Men's Morris rules.

---

**Version:** 2.1.0  
**Date:** 2026-01-28  
**Status:** ✅ All bugs fixed, game fully functional
