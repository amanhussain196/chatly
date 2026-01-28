# Nine Men's Morris - Final Fixes (v2.2)

## Recent Fixes

### 1. Adjacency List Corrections
**Issue:** Players couldn't move pieces to some legal positions (e.g., from 9 to 17, 11 to 19).
**Fix:** Updated the adjacency map to correctly represent all board connections, including cross-connections between rings.

**Corrected Connections:**
- **9 (Middle-Top)** <-> **1 (Outer-Top)** & **17 (Inner-Top)**
- **11 (Middle-Right)** <-> **3 (Outer-Right)** & **19 (Inner-Right)**
- **13 (Middle-Bottom)** <-> **5 (Outer-Bottom)** & **21 (Inner-Bottom)**
- **15 (Middle-Left)** <-> **7 (Outer-Left)** & **23 (Inner-Left)**

### 2. Mill Protection Logic
**Issue:** Players could remove protected pieces (those in mills).
**Fix:** Implemented strict validation on both client and server.

**Rules:**
1. **Protected:** A piece part of a mill **cannot be removed**.
2. **Exception:** If **ALL** opponent pieces are in mills, **ANY** piece can be removed.

**Visual Feedback:**
- Only **removable** pieces will glow orange.
- Protected pieces will remain normal, avoiding confusion.

### 3. Client-Side Validation
**Issue:** UI showed pieces as removable even if the move would be rejected.
**Fix:** Replicated mill checking logic on the frontend. The `isRemovable` flag now checks:
```typescript
if (!isInMill(board, index) || allOpponentInMills(opponentId)) {
    isRemovable = true;
}
```

## Complete Rules Summary

### Phases
1. **Placing:** Place 9 pieces on empty spots.
2. **Moving:** Slide pieces to adjacent connected spots.
3. **Flying:** When reduced to 3 pieces, fly to **ANY** empty spot.
4. **Removing:** Triggered after forming a mill (3 in a row). Remove 1 opponent piece.

### Winning
- Reduce opponent to **2 pieces**.
- **OR** Block opponent so they have **no valid moves**.

### Drawing
- If a player has no valid moves but has > 2 pieces, it's a **Draw** (Stalemate).

## Technical Details

### Files Updated
- `server/src/index.ts`: Adjacency list, move verification, `removing` phase logic.
- `client/src/components/Room/NineMensMorris.tsx`: Visual feedback for removable pieces, adjacency/mill helpers.

### Adjacency Map Reference
```typescript
const adjacency = [
    // Outer (0-7)
    [1, 7], [0, 2, 9], [1, 3], [2, 4, 11], [3, 5], [4, 6, 13], [5, 7], [0, 6, 15],
    // Middle (8-15)
    [9, 15], [1, 8, 10, 17], [9, 11], [3, 10, 12, 19], [11, 13], [5, 12, 14, 21], [13, 15], [7, 8, 14, 23],
    // Inner (16-23)
    [17, 23], [9, 16, 18], [17, 19], [11, 18, 20], [19, 21], [13, 20, 22], [21, 23], [15, 16, 22]
];
```
