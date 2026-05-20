# Shadow Cards — Interaction Specification

> Version: 2026-04-19  
> Coverage: Card Operations · Canvas Operations · Multi-Select · Marquee Selection · Arena · Command Terminal · Keyboard Shortcuts

---

## 1. Event Layering Architecture

The canvas is composed of **three overlapping layers**, with event priority from top to bottom:

| Layer | Component | Responsibility |
|---|---|---|
| **① Overlay div** (React) | `handleSelectMouseDown / Move / Up` | Marquee box, selection ring, Shift/Cmd multi-select, Arena edge hit |
| **② Matter.js Mouse Constraint** | `DeskInputHandler` + `attachMatterEvents` | Single-card drag, inertia, startdrag/enddrag, tap/dblclick detection |
| **③ WebGL canvas** | `CardRenderer` | Rendering; does not receive events directly |

**Rules:**
- The Overlay div's `mousedown` fires before Matter's internal processing.
- Matter's `startdrag` only triggers when a real drag begins (after ~1 frame); a secondary `hitTest` verifies texture-level hit to prevent "ghost drags".
- Pointer events (Arena operations) are independent of mouse events and do not conflict.

---

## 2. Card Tap (Single Click)

### Trigger Conditions
Left-click lands **on a card**, and:
- Shift / Cmd / Ctrl is not held
- Arena edge hit is not triggered

### Behavior
1. Set selection = `{ clickedCardId }`; deselect all other cards.
2. Render layer updates the highlight ring (purple, tight border, border-radius=14px).
3. Matter captures that body and prepares for drag (`dragBody` assigned).
4. If mouse **did not move** (Δ < 5 world units at enddrag) → fire `onCardTap` callback (select).

### Tap Delay Mechanism
- After a click, a **320ms** timer starts; `onCardTap` only executes after timeout.
- Purpose: if the same card is clicked again within 320ms, upgrade to double-click (Flip) and cancel the single-click callback.

### Conflict Notes
- Clicking on blank area → enters marquee selection flow (see Section 4).
- Matter may grab the body via physics bounding box first; `startdrag`'s `hitTest` verifies texture-level hit. If not matched, cancels Matter drag and canvas proceeds with marquee selection.

---

## 3. Card Double-Click (Flip)

### Trigger Conditions
- Two clicks on **the same card** with interval < **350ms**
- Second click Δ < 5 (confirmed as click, not drag)

### Behavior
1. Cancel the 320ms timer from the first click (suppress `onCardTap`).
2. Call `renderer.toggleFlip(cardId)` — flip front/back animation.
3. Fire `onCardFlip` callback (can be used for command log).

### Notes
- Double-click detection is fully implemented inside `DeskInputHandler`; **does not rely on the browser `dblclick` event**.
- After double-click, `lastTapCardId` resets to prevent the third click being misidentified as a second double-click sequence.

---

## 4. Marquee Selection (Rubber-band Marquee)

### Trigger Conditions
Left mouse button pressed **on blank area** (`hitTest` returns null), and Shift is not held.

### Behavior
1. Clear current selection (if any).
2. `isSelectingRef.current = true`, record starting coordinates.
3. On mouse move: update the marquee rectangle in real time (screen coordinates), call `hitTestRect` to highlight matching cards.
4. On mouse up: marquee ends, final selection is retained.

### Conflict Avoidance with Physics Drag
- `onMouseDown` does **not** call `stopImmediatePropagation` (reverted); React layer receives events normally.
- In Matter `startdrag`, `hitTest` runs on `mouseDownScreenX/Y`; if no texture-level hit → manually zero `mc.body / mc.constraint.bodyB` to cancel ghost drag without interfering with marquee selection.

### Known Limitations
- If marquee ends exactly on a Matter body, Matter may have prepared a drag; but `startdrag`'s hitTest check will cancel it.

---

## 5. Multi-Select

### Shift + Click
- Toggle the clicked card's selection state (deselect if selected, add if not).
- Does not clear other selected cards.
- Does not trigger `startdrag` (`e.stopPropagation()` prevents Matter from receiving).

### Marquee Select
- Selection set expands/shrinks in real time during drag.
- After marquee ends, Shift+click can append to selection.

### Cmd/Ctrl + Click (Quick Link)
- Prerequisite: **exactly 1** card is currently selected, and the clicked card is **a different** card.
- Behavior: execute `/link A B` to create a connection line between the two cards; result shown in log.
- Otherwise (0 or ≥2 cards selected): Cmd+Click acts as a normal click, selecting the card.

---

## 6. Card Drag

### Trigger Conditions
Mouse down on a card then moves ≥ 5 world units (Matter `startdrag` fires).

### Behavior
1. After `startdrag`: `isDragging=true`, `bringToFront`, cursor → `grabbing`.
2. Matter physics constraint (stiffness=0.6, damping=0.12) pulls body to follow mouse.
3. Call `onDragChange(cardId)` to notify the parent.
4. `enddrag`: `isDragging=false`; if Δ < 5 → enter tap/dblclick detection; otherwise end drag.

### Cursor Feedback
| State | cursor |
|---|---|
| Hovering over card | `grab` |
| Dragging | `grabbing` |
| Pan mode (Space held) | `grab` |
| Panning | `grabbing` |
| Default blank area | `default` |

---

## 7. Canvas Pan

### Trigger Methods

| Action | Triggers |
|---|---|
| Middle mouse button drag | ✅ |
| Space held + left mouse drag | ✅ |
| Trackpad two-finger swipe (deltaX > 0.5 or deltaY < 60 or non-integer) | ✅ (detected in onWheel) |
| Mouse scroll wheel up/down | ❌ (goes to zoom) |

### Inertia
- After releasing mouse/Space pan, glides at last-frame velocity * 0.92/frame decay until < 0.3px/frame.

### Matter Sync
- `syncMatterViewport()` is called every frame during pan to keep Matter mouse constraint world coordinates correct.

---

## 8. Canvas Zoom

### Trigger Methods

| Action | Triggers |
|---|---|
| Ctrl + scroll wheel | ✅ Zoom anchored to mouse position |
| Mouse scroll wheel (large step, integer deltaY ≥ 60) | ✅ Anchored to mouse, 0.92/1.08 step |
| Trackpad pinch (i.e. Ctrl + wheel) | ✅ Continuous zoom `2^(-deltaY*0.008)` |

### Zoom Settle Debounce
- During zoom: `setZoomSettled(false)` → pause LOD texture re-baking (resumes after 180ms).
- Prevents high-frequency zoom gestures from triggering excessive GPU redraws.

---

## 9. Arena Operations

Arena is the circular scene area, handled via independent **Pointer Events** (not mouse events), fully decoupled from card interactions.

### Hit Detection Rules
- `arenaEdgeHitTest`: hitting the Arena edge ring → takes priority over card selection (Overlay mousedown returns immediately).
- Distinguishes `center`: drag to move Arena; `edge` (non-center): drag to resize radius.

### Arena Move
- PointerDown in Arena center area → `type: 'move'`
- PointerMove: `arena.x += (wx - drag.startWx)` (world-coordinate delta).

### Arena Resize (Stretch)
- PointerDown on Arena edge → `type: 'resize'`
- PointerMove: `arena.radius = Math.max(100, startRadius + Δdist / zoom)`.

### Arena Double-Click
- Triggers Arena activation (runs built-in script, e.g. Magic Circle shuffle).

---

## 10. Command Terminal Keyboard Interaction

### Autocomplete Dropdown **Open**

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move highlight among candidates; **does not trigger history** |
| `Tab` or `Enter` | **Complete**: fills the selected (or first) candidate into input, cursor to end, does not send |
| `Escape` | Close autocomplete, clear highlight, input unchanged |

### Autocomplete Dropdown **Closed**

| Key | Behavior |
|---|---|
| `Enter` | Send command (`executeCmd`) |
| `↑` | History back: saves current input on first press, then loads latest history entry |
| `↓` | History forward: returns to saved input; restores savedInput if at end |
| `Tab` | Trigger autocomplete query (even if no candidates) |
| `Escape` | Close autocomplete + **clear input**, reset history index |

### Command Log
- Each execution is appended to the log (max 50 entries retained).
- Log area max-height 160px; auto-scrolls to bottom when new entry is added.
- Log is above the input box; both belong to `#command-terminal` flex column.

---

## 11. Keyboard Shortcuts Overview

| Shortcut | Scope | Behavior |
|---|---|---|
| `Space` hold | Canvas (global) | Enter pan mode (cursor: grab) |
| `Space` + left drag | Canvas | Pan canvas |
| `Shift` + left click | Card | Toggle card multi-select |
| `Cmd/Ctrl` + left click | Card (when exactly 1 selected) | Quick-link two cards |
| `Ctrl` + scroll | Canvas | Zoom (anchored to mouse) |
| `↑` / `↓` | Command input | History / autocomplete candidate navigation (mutually exclusive) |
| `Tab` | Command input | Trigger/confirm autocomplete |
| `Enter` | Command input (no autocomplete) | Send command |
| `Escape` | Command input | Close autocomplete / clear input |

> **Common shortcuts not yet implemented (potential conflict risks):**
> - `Delete` / `Backspace` to delete selected cards (currently only via UI button)
> - `Escape` to cancel marquee selection (currently waits for mouseup)
> - `Cmd+A` to select all
> - `Cmd+Z` to undo

---

## 12. Known Conflicts & Edge Cases

### 12.1 Ghost Drag (Fixed)
**Problem:** Matter physics bounding box is larger than the rendered card (rounded corners/rotation), causing drag to trigger when clicking blank space between cards, blocking marquee selection.  
**Fix:** In `startdrag`, use `renderer.hitTest(mouseDownScreenX, mouseDownScreenY)` for texture-level verification; if no hit, manually zero `mc.body / mc.constraint`.

### 12.2 Marquee + Click Simultaneously Active (Fixed)
**Problem:** `stopImmediatePropagation` was blocking the React Overlay layer's `onMouseDown`, preventing marquee selection from ever starting.  
**Fix:** Reverted; `stopImmediatePropagation` is no longer called. Ghost drag is cancelled by `startdrag` verification instead.

### 12.3 Double-Click vs Single-Click Re-triggering Marquee Within TAP_DELAY
**Problem:** After the first click of a double-click, if blank area is clicked again within 320ms, there is a dangling `pendingTapId`.  
**Current State:** `enddrag` first calls `clearTimeout(pendingTapId)`; a mousedown on blank area does not trigger `enddrag`, so `pendingTapId` executes naturally after 320ms. This is correct behavior in most cases.

### 12.4 Arena Edge Hit vs Card Click Priority
**Rule:** Overlay `handleSelectMouseDown` iterates all Arenas first; if `arenaEdgeHitTest` hits, it returns immediately (skipping card selection/marquee). Arena Pointer Event handlers run independently.

### 12.5 Cmd+Click Quick-Link Ambiguity
**Rule:** Link is created only when `prevIds.length === 1 && prevIds[0] !== hitId`. If 0 or ≥2 cards are selected, Cmd+Click degrades to normal click (selects only `hitId`).

### 12.6 Space Pan vs Keyboard Input Conflict
**Problem:** When the command input box is focused, the `Space` key event is consumed by the input box and does not trigger pan mode.  
**Current State:** `onKeyDown` listener is on `window`, but the text input processes keydown first and it does not bubble up to trigger Space pan. This is the intended behavior (canvas shortcuts should not fire while input box is active).

---

## 13. Recommended Follow-up Fix Priorities

| Priority | Issue | Suggestion |
|----|----|----|
| 🔴 High | `Delete` key to delete selected cards is missing | Listen for Delete in global keydown (when input is not focused), call `deleteCard(id)` |
| 🔴 High | `Escape` key to cancel marquee selection | When marquee is in progress, Escape terminates marquee and clears selection |
| 🟡 Medium | `Cmd+A` select all | Global keydown, select all visible cards |
| 🟡 Medium | `Cmd+Z` undo | Requires CommandHistory state machine (significant change) |
| 🟢 Low | Arena linkage with trackpad pinch zoom | Should Arena radius change with overall zoom, or stay fixed in world size? — needs product decision |
| 🟢 Low | Keyboard shortcut isolation when command input is focused | Clearly document which shortcuts still work when input box is active (e.g. Escape to close autocomplete) |
