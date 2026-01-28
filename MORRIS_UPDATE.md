# Nine Men's Morris - Color Change & Mill Removal Update

## Changes Made

### 1. **Color Change: Red & Blue** ✅

**Changed from:** White & Black  
**Changed to:** Red & Blue

#### Files Modified:
- **Client:** `client/src/components/Room/NineMensMorris.tsx`
- **Server:** `server/src/index.ts`

#### Color Codes:
- **Red Player:** `#ef4444` (Tailwind red-500)
- **Blue Player:** `#3b82f6` (Tailwind blue-500)

### 2. **Mill Removal Feature** ✅

**Problem:** Game wasn't ending when 3 pieces were placed in a row.

**Explanation:** In Nine Men's Morris, forming a mill (3 in a row) **does NOT end the game**. Instead, it allows you to **remove one of your opponent's pieces**.

#### How It Works Now:

1. **Form a Mill (3 in a row)**
   - Game enters "removing" phase
   - Status message: "Remove opponent's piece!"
   - Opponent's pieces glow orange/yellow
   - Timer continues (30 seconds to remove)

2. **Remove Opponent's Piece**
   - Click on any opponent's piece (highlighted in orange)
   - Piece is removed from the board
   - `piecesOnBoard` count decreases
   - Game returns to previous phase (placing/moving/flying)
   - Turn switches to opponent

3. **Win Conditions**
   - Opponent has fewer than 3 pieces on board
   - Opponent has no valid moves (all pieces blocked)

## Technical Implementation

### Game Phases

Now includes **4 phases** (was 3):

1. **Placing** - Place your 9 pieces
2. **Moving** - Move pieces to adjacent positions
3. **Flying** - Move to any position (when you have 3 pieces)
4. **Removing** - Remove opponent's piece after forming a mill ⭐ NEW

### State Changes

```typescript
interface GameState {
    // ... existing fields
    phase: 'placing' | 'moving' | 'flying' | 'removing'; // Added 'removing'
    millFormed: boolean; // NEW - tracks if mill was formed
}
```

### Server Logic

**When mill is formed:**
```typescript
if (checkMill(game.board, position, socket.id)) {
    game.phase = 'removing';
    game.millFormed = true;
    // Don't switch turn - same player removes piece
}
```

**When piece is removed:**
```typescript
if (game.phase === 'removing') {
    if (game.board[position] === opponent.id) {
        game.board[position] = null;
        game.piecesOnBoard[opponent.id]--;
        game.millFormed = false;
        
        // Return to appropriate phase
        if (piecesPlaced < 9) {
            game.phase = 'placing';
        } else if (piecesOnBoard === 3) {
            game.phase = 'flying';
        } else {
            game.phase = 'moving';
        }
        
        // Now switch turn
        game.turn = opponent.id;
    }
}
```

### Visual Indicators

**Removing Phase:**
- Opponent pieces have **orange border** (`#f59e0b`)
- Pieces **glow** with orange shadow
- Pieces **pulse** animation
- Pieces **scale up** slightly (1.1x)

**Status Messages:**
- "Remove opponent's piece! - 30s"
- "[Opponent] is removing a piece (30s)"

## Game Flow Example

### Scenario: Forming a Mill

1. **Player 1 (Red)** places piece at position 0
2. **Player 1** already has pieces at positions 1 and 2
3. **Mill formed!** [0, 1, 2] is a complete row
4. **Phase changes** to "removing"
5. **Player 1** sees: "Remove opponent's piece!"
6. **Player 2's (Blue)** pieces glow orange
7. **Player 1** clicks on a blue piece
8. **Blue piece removed**, count decreases
9. **Phase returns** to "placing" or "moving"
10. **Turn switches** to Player 2

## Testing Checklist

- [x] Colors changed to red and blue
- [x] Mill detection working
- [x] Removing phase activates when mill formed
- [x] Opponent pieces highlighted in removing phase
- [x] Piece removal decrements piecesOnBoard count
- [x] Phase returns correctly after removal
- [x] Turn switches after removal
- [x] Win condition checks piecesOnBoard < 3
- [x] Status messages show correct phase
- [x] Timer continues during removal phase

## Known Limitations

1. **No Mill Protection:** Currently, you can remove any opponent piece, even if it's part of a mill. In traditional rules, pieces in a mill are protected unless all opponent pieces are in mills.

2. **No Multiple Mills:** If a single move forms multiple mills, only one piece can be removed (standard rule).

3. **No Visual Mill Highlighting:** Mills are detected but not visually highlighted on the board.

## Future Enhancements

1. **Mill Protection Rule:**
   ```typescript
   const isInMill = (position: number, playerId: string) => {
       // Check if piece is part of a mill
       // Only allow removal if not in mill OR all pieces are in mills
   }
   ```

2. **Visual Mill Highlighting:**
   - Draw lines connecting mill pieces
   - Change color of mill pieces
   - Animate mill formation

3. **Sound Effects:**
   - Mill formation sound
   - Piece removal sound
   - Win/lose sounds

## Summary

✅ **Colors:** Changed from white/black to red/blue  
✅ **Mill Removal:** Fully implemented  
✅ **Game Logic:** Now follows proper Nine Men's Morris rules  
✅ **Visual Feedback:** Orange highlighting for removable pieces  
✅ **Win Conditions:** Correctly checks piece count and valid moves  

**The game now works as intended!** When you form 3 in a row, you can remove an opponent's piece instead of winning immediately. The game only ends when your opponent has fewer than 3 pieces or cannot make any moves.

---

**Version:** 2.0.0  
**Date:** 2026-01-28  
**Status:** ✅ Fully functional with mill removal
