# Channel Posting Rules UX Enhancement TODO

## P1: Input Box Hint (C2)
- [x] Update `message-input.tsx` (Web) to show hint when user cannot post
- [x] Add i18n keys for hint messages
- [x] Sync translations to all languages
- [ ] Update mobile chat input to show hint (optional)
- [ ] Test: verify hint shows for each rule type

## P1: Error Code i18n (C3)
- [x] Update `message.handler.ts` to return errorCode + ruleType
- [x] Update CanPostResult to include ruleType
- [x] Add i18n keys for all error messages
- [x] Sync translations to all languages
- [ ] Test: verify error messages are localized

## P2: Settings Page Icons (B2)
- [x] Update `channel-posting-rule-settings.tsx` with Lucide icons
- [x] Show icon in rule description
- [x] Show icon and count badge in current rule display
- [x] Add Tooltip on hover (via title attribute)
- [ ] Test: verify icons display correctly

## P2: Channel List Icons (B3) ✅
- [x] 后端 API 已返回 postingRule
- [x] Update `channel-sidebar.tsx` to show rule icons
- [x] Add icon only for non-everyone rules
- [x] Show count badge for specific_users
- [ ] Add Tooltip on hover (后续优化)

## P3: WebSocket Real-time (A2) ✅
- [x] Backend already broadcasts 'channel:posting-rule-changed' event
- [x] Listen for event in Web settings component
- [x] Refresh rule data and channels list on change
- [x] Listen for event in channel sidebar
- [x] Mobile: add WebSocket listener with toast notification
- [x] Add i18n key for rule changed notification
- [ ] Test: verify real-time sync across clients

## PR Update ✅
- [x] Squash commits
- [x] Rebase origin/main
- [x] Push to remote
- [x] Monitor CI checks until pass
- [x] Fix unit tests (add ruleType to expected results)

## 可选优化已完成 ✅
- [x] Mobile WebSocket listener
- [x] Tooltip on hover (via title attribute)
- [x] Toast notification when rule changes
- [x] i18n key for rule changed notification
