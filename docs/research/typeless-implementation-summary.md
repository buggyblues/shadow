# TypeLess Voice Input Implementation Summary

## Overview

Implementation of TypeLess AI-inspired voice input for Shadow mobile application with optional cloud-based LLM enhancement.

## Architecture

### Mobile Implementation

```
┌─────────────────────────────────────────────────────────┐
│                    Voice Input Flow                     │
├─────────────────────────────────────────────────────────┤
│  User presses mic button → Recording starts             │
│           ↓                                             │
│  Speech Recognition (local) → Streaming transcript      │
│           ↓                                             │
│  Local Processing (fillers, duplicates, punctuation)    │
│           ↓                                             │
│  Text appended to input field (real-time)               │
│           ↓                                             │
│  User releases button → Recording stops                 │
│           ↓                                             │
│  Optional: Cloud LLM Enhancement                        │
│           ↓                                             │
│  Final text in input field                              │
└─────────────────────────────────────────────────────────┘
```

### Server Implementation

```
┌─────────────────────────────────────────────────────────┐
│              Cloud Enhancement Service                  │
├─────────────────────────────────────────────────────────┤
│  POST /api/voice/enhance                                │
│           ↓                                             │
│  LLM Provider (OpenAI/Anthropic/Alibaba/Custom)         │
│           ↓                                             │
│  Advanced Processing:                                   │
│    - Self-correction detection                          │
│    - Entity recognition                                 │
│    - List formatting                                    │
│    - Tone adjustment                                    │
│           ↓                                             │
│  Return enhanced transcript                             │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Press-and-Hold Interaction

**TypeLess Style:**
- Desktop: Hold Fn key
- Mobile: Long press mic button

**Our Implementation:**
- `TypelessMicButton` with animated feedback
- Pulse ring animation during recording
- Scale animation on press

### 2. Append Mode (Not Overwrite)

**Problem:** Traditional voice input replaces existing text

**Solution:**
```typescript
// Capture text before recording
const textBeforeRecording = getCurrentText?.() ?? ''

// Append new text
const separator = textBeforeRecording && newText ? ' ' : ''
onTranscriptChange(textBeforeRecording + separator + newText)
```

### 3. Local Processing Pipeline

**Processing Order:**
1. **Streaming** (real-time): Filler removal, deduplication, punctuation
2. **Final** (on stop): Self-correction detection, list formatting
3. **Cloud** (optional): LLM-based enhancement

**Filler Words (Chinese):**
```javascript
['嗯', '啊', '呃', '哎', '唉', '哦', '喔']
```

**Filler Words (English):**
```javascript
['um', 'uh', 'uhm']
```

### 4. Self-Correction Detection

**Chinese Patterns:**
```typescript
const CHINESE_CORRECTION_PATTERNS = [
  { pattern: /(.+?)(?:不对|错了|不好意思)[，,.。]\s*/, desc: 'correction' },
  { pattern: /(?:我是说|我的意思是)[，,.。]?\s*/, desc: 'clarification' },
  { pattern: /(?:让我想想|重新说|重来)[，,.。]?\s*/, desc: 'restart' },
]
```

**English Patterns:**
```typescript
const ENGLISH_CORRECTION_PATTERNS = [
  { pattern: /(.+?)(?:actually|wait|no|hang on)[,;.]?\s+/i, desc: 'correction' },
  { pattern: /(?:i mean|what i mean is)[,;.]?\s+/i, desc: 'clarification' },
]
```

**Example:**
```
Input:  "我们明天见面，不对，后天见面"
Output: "我们后天见面"
```

### 5. Expo Go Support

**Problem:** `expo-speech-recognition` requires native modules

**Solution:** Mock implementation for Expo Go testing
```typescript
const isExpoGo = Constants.appOwnership === 'expo'

const voiceInput = isExpoGo 
  ? useMockVoiceInput({...})      // Simulated phrases
  : useTypelessVoiceInput({...})  // Real speech recognition
```

**Mock Phrases:**
- Self-correction: "我们明天见面，不对，后天见面"
- List formatting: "购物清单：牛奶，面包，鸡蛋"
- Filler words: "嗯，我觉得啊，这个方案可以"

### 6. Graceful Degradation

**Server Not Configured:**
- Returns HTTP 503 with `SERVICE_NOT_CONFIGURED`
- Client silently continues with local processing
- No user-facing error

**Reanimated Not Available:**
- Try-catch around `useSharedValue`
- Fallback to regular `Pressable`
- Basic functionality preserved

## File Structure

```
apps/mobile/src/
├── hooks/
│   ├── use-voice-input.ts           # Unified hook with auto-detection
│   ├── use-typeless-voice-input.ts  # Real speech recognition
│   ├── use-mock-voice-input.ts      # Expo Go mock
│   ├── use-cloud-voice-enhance.ts   # Cloud LLM client
│   └── use-voice-input-debug.ts     # Debug utilities
├── components/chat/
│   ├── typeless-mic-button.tsx      # Animated mic button
│   └── voice-input-demo.tsx         # Demo component
└── utils/
    └── voice-processor.ts           # Local processing pipeline

apps/server/src/
├── services/
│   └── voice-enhance.service.ts     # LLM service
├── handlers/
│   └── voice-enhance.handler.ts     # REST API
└── .env.voice-enhance.example       # Configuration template
```

## Configuration

### Server Environment Variables
```bash
VOICE_ENHANCE_PROVIDER=openai
VOICE_ENHANCE_API_KEY=sk-xxx
VOICE_ENHANCE_MODEL=gpt-4o-mini
VOICE_ENHANCE_TEMPERATURE=0.3
VOICE_ENHANCE_MAX_TOKENS=500
VOICE_ENHANCE_TIMEOUT=5000
```

### Supported LLM Providers
- OpenAI (GPT-4, GPT-4o-mini)
- Anthropic (Claude)
- Alibaba (Qwen)
- Custom endpoint

## Usage Example

```typescript
import { useVoiceInput } from './hooks/use-voice-input'

function ChatScreen() {
  const [inputText, setInputText] = useState('')
  
  const {
    isRecording,
    isHolding,
    onPressIn,
    onPressOut,
    speechSupported,
  } = useVoiceInput({
    speechLang: 'zh-CN',
    onPermissionDenied: () => Alert.alert('Microphone permission required'),
    onUnavailable: () => Alert.alert('Voice input not available'),
    onTranscriptChange: setInputText,
    getCurrentText: () => inputText,  // For append mode
  })

  return (
    <ChatComposer
      inputText={inputText}
      onInputChange={setInputText}
      canUseVoice={speechSupported}
      onVoicePressIn={onPressIn}
      onVoicePressOut={onPressOut}
      isRecording={isRecording}
      isHolding={isHolding}
    />
  )
}
```

## Testing

### Expo Go (Mock Mode)
```bash
npx expo start
# Scan QR code with Expo Go app
# Voice input uses mock phrases
```

### Development Build (Real Mode)
```bash
npx expo run:ios
# or
npx expo run:android
# Voice input uses real speech recognition
```

## References

- TypeLess Official: https://www.typeless.com
- TypeLess Help: https://www.typeless.com/help/installation-and-setup
- expo-speech-recognition: https://github.com/JazzyMichael/expo-speech-recognition
