# TypeLess Voice Input Research

## Overview

TypeLess is an AI-powered voice keyboard application that enables users to input text through voice with intelligent post-processing.

## Core Interaction Model

### Desktop (macOS/Windows)
- **Trigger**: Hold down the **Fn (Function) key** (default shortcut)
- **Action**: Hold to start recording, release to stop
- **Customization**: Configurable keyboard shortcuts in settings

### Mobile (iOS/Android)
- Available as a system keyboard
- **6x faster** than typing

## Key Features

### 1. AI Auto-Editing

#### List Auto-Formatting
**Input:**
> "My shopping list, bananas, oat milk, dark chocolate."

**Output:**
```
My shopping list:
- Bananas
- Oat milk
- Dark chocolate
```

#### Email Auto-Formatting
**Input:**
> "Hi Anna, just wanted to let you know that my new phone number is 4081234567. Thanks, Jack."

**Output:**
```
Hi Anna,
Just wanted to let you know that my new phone number is (408)123-4567.
Thanks,
Jack
```

#### Self-Correction Detection
**Input:**
> "How about we meet tomorrow at, um, 7 am? Oh, actually, let's do 3 pm."

**Output:**
> "How about we meet tomorrow at 3 PM?"

**Key Insight:**
- Recognizes filler words ("um")
- Identifies correction signals ("Oh, actually")
- Retains final intent, removes hesitation

#### Whisper Detection
- Supports low-volume speech input
- Example: "How come orange juice prices have dropped?" (whispered)

### 2. Filler Word Removal

**English:** "um", "uh", "you know"

**Chinese:** 嗯, 啊, 呃 (inferred from examples)

### 3. System Integration

**Desktop Features:**
- System-level tool
- Works in any application:
  - Google Docs
  - Notion
  - Gmail
  - Slack
  - Chrome
  - Any text editor

**Technical Requirements:**
- Accessibility permissions for text insertion
- Microphone permissions for recording
- Function key trigger mechanism

## Product Positioning

### Slogan
> "The keyboard was a mistake"
> "Welcome to the end of typing"

### Core Value Proposition
- Speaking is **4-6x faster** than typing
- Removes friction for free-flowing thoughts
- More creative, clearer, more human

## Pricing Model

### Free Tier
- 4,000 words per week limit
- Basic voice input
- AI auto-editing
- Personal dictionary
- 100+ language support

### Pro Tier ($12/month, annual)
- Unlimited words
- Priority feature requests
- Early access to new features
- Team member management

## Supported Platforms

- **Desktop:** macOS (Apple Silicon / Intel), Windows
- **Mobile:** iOS, Android
- **Web:** Coming soon

## Privacy & Security

- **Zero cloud data retention**
- **Never trained on your data**
- **On-device history storage**
- **Dictation history control**

## Research Sources

- Official Website: https://www.typeless.com
- Installation Guide: https://www.typeless.com/help/installation-and-setup
- FAQ: https://www.typeless.com/help/faqs
- Pricing: https://www.typeless.com/pricing
- Manifesto: https://www.typeless.com/manifesto

## Implementation Notes

Based on our research, TypeLess's core differentiator is **self-correction detection**, which requires:
1. Recognition of correction signals ("actually", "不对", "I mean")
2. Retention of post-signal content as final intent
3. Removal of pre-signal hesitation content

This likely uses cloud-based LLM processing given the complexity of semantic understanding required.
