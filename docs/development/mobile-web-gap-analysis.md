# Mobile vs Web Gap Analysis

Feature comparison between `apps/mobile` and `apps/web`.

---

## 1. Chat Features

### 1.1 Sending Messages

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Text send (WebSocket) | ✅ | ✅ | Same |
| Text send (REST fallback) | ❌ | ✅ | Mobile better |
| Enter to send / Shift+Enter newline | ✅ | ❌ | **Missing** — mobile requires send button |
| File attachment upload | ✅ | ✅ | Same (`POST /api/media/upload`) |
| Image attachment upload | ✅ | ✅ | Same |
| Workspace file attachment | ✅ | ❌ | **Missing** — no WorkspaceFilePicker |
| Send sound effect | ✅ | ❌ | Web has `playSendSound()` |
| @mention autocomplete | ✅ | ❌ | **Missing** — web has pinyin matching, keyboard nav, buddy weighting |

### 1.2 Receiving & Displaying Messages

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Real-time `message:new` | ✅ | ✅ | Same (mobile also listens `message:created`) |
| Message deduplication | ❌ | ✅ | Mobile better |
| Message normalization | ❌ | ✅ | Mobile has `normalizeMessage()` |
| Infinite scroll pagination | ✅ | ✅ | Same |
| Message grouping (5min same author) | ✅ | ✅ | Same |
| Date separator | ❌ | ✅ | Mobile better |
| New message divider | ❌ | ✅ | Mobile better |
| Receive sound effect | ✅ | ❌ | Web has `playReceiveSound()` |
| Virtualized scrolling | ✅ | ✅ | Web: `@tanstack/react-virtual`; Mobile: FlashList |

### 1.3 Message Actions

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Edit (inline) | ✅ | ✅ | Same |
| Delete (confirm dialog) | ✅ | ✅ | Same |
| Copy message | ✅ | ✅ | Same |
| Reply / quote | ✅ | ✅ | Same |
| Share message link | ✅ | ❌ | **Missing** |
| Emoji reactions | ✅ full picker | ⚠️ 6 quick emojis | **Missing** full picker |
| Click message anchor to jump | ✅ | ❌ | **Missing** |

### 1.4 Attachments & Files

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Image preview | ✅ | ✅ | Web has context menu |
| Image context menu | ✅ | ❌ | **Missing** — web has download/copy link/details/save to workspace |
| File card (FileCard) | ✅ detailed | ✅ basic | Web has richer type icons and color categories |
| File preview panel | ✅ | ❌ | **Missing** — web supports code highlight, CSV, ZIP, PDF |
| Save to workspace | ✅ | ❌ | **Missing** |
| Drag-and-drop upload | ✅ | N/A | Not applicable on mobile |

### 1.5 Real-time Status

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Typing indicator | ✅ | ✅ | Same (3s throttle/timeout) |
| member:joined / member:left | ✅ | ✅ | Same |
| Agent activity | ✅ | ✅ | Same |
| Socket reconnect recovery | ✅ | ✅ | Same (mobile adds AppState listener) |

### 1.6 Channel Features

| Capability | Web | Mobile | Gap |
|------------|:---:|:------:|-----|
| Channel list | ✅ | ✅ | Same |
| Channel category collapse | ✅ | ✅ | Same |
| Create channel | ✅ | ✅ | Same |
| Edit channel | ✅ | ❌ | **Missing** |
| Delete channel | ✅ | ❌ | **Missing** |
| Channel unread badge | ✅ | ❌ | **Missing** — web has `scoped-unread` API |
| Channel member list | ✅ | ❌ | **Missing** — web has `MemberList` sidebar |

---

## 2. Known Bugs

### 2.1 Messages not appearing after send

**Root cause:** WebSocket `message:send` is blocked by server-side `channel:join` membership check. If the user is not in `channel_members`, `channel:join` fails silently (mobile sends no ack callback). The user never joins the channel room and cannot receive `message:new` broadcasts.

**Fix plan:**
1. Add ack callback to `joinChannel`, fallback to REST on failure
2. Listen for socket `error` event and surface errors
3. After sending, fetch latest messages via REST to ensure sync

### 2.2 Attachment crash (fixed)

`att.mimeType.startsWith('image/')` crashed when `mimeType` was undefined. Fixed by using `getAttachmentContentType()` with fallback.

### 2.3 Keyboard behavior

- No Enter-to-send (TextInput lacks `onSubmitEditing`)
- Tapping outside input doesn't dismiss keyboard (missing `Keyboard.dismiss()`)

---

## 3. Tab Layout

Current bottom tabs:

| Tab | Icon | Content |
|-----|------|---------|
| Home | MessageSquare | Joined servers list + FAB to create |
| Discover | Compass | Browse/search public servers |
| Buddies | Bot | AI agent marketplace |
| Settings | Settings | User settings |

**Issue:** "Home" and "Discover" are separate tabs, fragmenting related functionality. Modern apps tend to merge these into a single entry with segmented controls or search filters.

---

## 4. Roadmap

### P0: Chat core fixes
- [x] Fix `mimeType.startsWith` crash
- [ ] Message send reliability (REST-first + WebSocket error handling)
- [ ] Enter-to-send support
- [ ] Tap-outside-to-dismiss keyboard
- [ ] Full emoji picker
- [ ] Channel member list

### P1: Chat parity
- [ ] @mention autocomplete
- [ ] Channel unread count
- [ ] Message anchor/highlight

### P2: Tab restructure
- [ ] Merge "Home" and "Discover" into unified tab
- [ ] Modern combined page design
