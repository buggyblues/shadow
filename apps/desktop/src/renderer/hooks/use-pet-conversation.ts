import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../../shared/community-auth'
import { type ChatMessage, createInitialMessages } from '../lib/chatbot'
import { applyPetAction, type PetState } from '../lib/game'
import {
  getShadowUrl,
  isCommunityAuthRequiredError,
  readShadowAccessToken,
} from '../lib/pet-community'
import {
  localizedChatText,
  localizedPetDisplayText,
  normalizePetDisplayText,
  normalizeTtsText,
} from '../lib/pet-display'
import type { AppTab, DesktopPetApi } from '../pet-types'

const CHAT_STORAGE_KEY = 'shadow:desktop-pet-chat:v1'
const VOICE_LEVEL_THRESHOLD = 0.018
const VOICE_RELEASE_GRACE_MS = 520
const BUBBLE_TYPE_INTERVAL_MS = 174
const BUBBLE_CLAUSE_PAUSE_MS = 420
const BUBBLE_SENTENCE_PAUSE_MS = 720
const BUBBLE_MIN_VISIBLE_MS = 27_000
const BUBBLE_HOLD_AFTER_DONE_MS = 10_800
const PET_NOTICE_DEDUPE_MS = 2000
const TTS_STREAM_MIN_SEGMENT_CHARS = 14
const TTS_STREAM_SOFT_SEGMENT_CHARS = 28
const TTS_STREAM_MAX_SEGMENT_CHARS = 64

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitAudioContext?: typeof AudioContext
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export function usePetConversation({
  api,
  petState,
  setPetState,
  panelOpen,
  tab,
  setIsAuthenticated,
}: {
  api: DesktopPetApi | null
  petState: PetState
  setPetState: Dispatch<SetStateAction<PetState>>
  panelOpen: boolean
  tab: AppTab
  setIsAuthenticated: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useTranslation()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve())
  const ttsSpeechGenerationRef = useRef(0)
  const audioNodesRef = useRef<{
    gain: GainNode
    processor: ScriptProcessorNode
    source: MediaStreamAudioSourceNode
  } | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const asrPartialUnsubscribeRef = useRef<(() => void) | null>(null)
  const localAsrActiveRef = useRef(false)
  const localAsrSessionRef = useRef(false)
  const voiceCaptureWantedRef = useRef(false)
  const voiceStartingRef = useRef(false)
  const voiceErrorRef = useRef(false)
  const voiceTranscriptRef = useRef('')
  const voiceDraftRef = useRef('')
  const voiceSignalActiveRef = useRef(false)
  const voiceLastSignalAtRef = useRef(0)
  const voiceHeardAudioRef = useRef(false)
  const bubbleTimerRef = useRef<number | null>(null)
  const bubbleTypeTimerRef = useRef<number | null>(null)
  const bubbleTargetRef = useRef('')
  const bubbleVisibleRef = useRef('')
  const voiceFinishTimerRef = useRef<number | null>(null)
  const noticeDedupeRef = useRef<{ message: string; createdAt: number } | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const bubbleContentRef = useRef<HTMLSpanElement | null>(null)

  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceSignalActive, setVoiceSignalActive] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMessages())
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [bubbleMessageId, setBubbleMessageId] = useState<string | null>(null)
  const [bubbleText, setBubbleText] = useState('')

  const bubbleMessage = messages.find((message) => message.id === bubbleMessageId) ?? null
  const voiceBubbleText = voiceRecording
    ? voiceTranscript || t('desktopPet.voice.recognizing')
    : voiceTranscript
  const bubbleSourceText = voiceBubbleText
    ? voiceBubbleText
    : bubbleMessage
      ? localizedPetDisplayText(bubbleMessage, petState, t)
      : ''

  useEffect(() => {
    const node = bubbleContentRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [bubbleText])

  useEffect(() => {
    bubbleTargetRef.current = bubbleSourceText
    if (bubbleTypeTimerRef.current) {
      window.clearTimeout(bubbleTypeTimerRef.current)
      bubbleTypeTimerRef.current = null
    }
    if (!bubbleSourceText) {
      bubbleVisibleRef.current = ''
      setBubbleText('')
      return
    }
    if (!bubbleSourceText.startsWith(bubbleVisibleRef.current)) {
      bubbleVisibleRef.current = ''
      setBubbleText('')
    }

    const tick = () => {
      const target = bubbleTargetRef.current
      const current = bubbleVisibleRef.current
      if (!target || current.length >= target.length) {
        bubbleTypeTimerRef.current = null
        return
      }
      const next = target.slice(0, current.length + 1)
      bubbleVisibleRef.current = next
      setBubbleText(next)
      bubbleTypeTimerRef.current = window.setTimeout(
        tick,
        getBubbleTypeDelay(target.charAt(current.length)),
      )
    }

    bubbleTypeTimerRef.current = window.setTimeout(
      tick,
      bubbleVisibleRef.current ? BUBBLE_TYPE_INTERVAL_MS : 0,
    )
    return () => {
      if (bubbleTypeTimerRef.current) {
        window.clearTimeout(bubbleTypeTimerRef.current)
        bubbleTypeTimerRef.current = null
      }
    }
  }, [bubbleSourceText])

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-24)))
  }, [messages])

  useEffect(() => {
    if (!panelOpen || tab !== 'chat') return
    const timer = window.setTimeout(() => chatInputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [panelOpen, tab])

  useEffect(() => {
    if (!panelOpen || tab !== 'chat') return
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, panelOpen, tab])

  useEffect(() => {
    return api?.pet?.onVoiceModelProgress?.((payload) => {
      if (payload.key !== 'asr') return
      if (payload.phase === 'download') {
        setVoiceTranscript(
          t('desktopPet.voice.downloadingModel', { percent: payload.percent ?? 0 }),
        )
        return
      }
      if (payload.phase === 'extract') {
        setVoiceTranscript(t('desktopPet.voice.extractingModel'))
        return
      }
      if (payload.phase === 'ready') {
        setVoiceTranscript(t('desktopPet.voice.recognizing'))
      }
    })
  }, [api, t])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api?.pet?.prewarmVoice?.().catch(() => false)
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [api])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      void api?.pet?.cancelSpeech?.().catch(() => null)
      voiceCaptureWantedRef.current = false
      localAsrActiveRef.current = false
      localAsrSessionRef.current = false
      asrPartialUnsubscribeRef.current?.()
      audioNodesRef.current?.source.disconnect()
      audioNodesRef.current?.processor.disconnect()
      audioNodesRef.current?.gain.disconnect()
      for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop()
      void audioContextRef.current?.close()
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
      if (bubbleTypeTimerRef.current) window.clearTimeout(bubbleTypeTimerRef.current)
      if (voiceFinishTimerRef.current) window.clearTimeout(voiceFinishTimerRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [api])

  const setVoiceSignalActiveState = (active: boolean) => {
    if (voiceSignalActiveRef.current === active) return
    voiceSignalActiveRef.current = active
    setVoiceSignalActive(active)
  }

  const scheduleBubbleHide = useCallback((text = '') => {
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
    const visibleText = normalizePetDisplayText(text)
    const delay = Math.max(
      BUBBLE_MIN_VISIBLE_MS,
      estimateBubbleRevealDuration(visibleText) + BUBBLE_HOLD_AFTER_DONE_MS,
    )
    bubbleTimerRef.current = window.setTimeout(() => {
      setBubbleMessageId(null)
      bubbleTimerRef.current = null
    }, delay)
  }, [])

  const showPetNotice = useCallback(
    (text: string) => {
      const message = normalizePetDisplayText(text)
      if (!message) return
      const now = Date.now()
      const previous = noticeDedupeRef.current
      if (
        previous?.message === message &&
        now - previous.createdAt >= 0 &&
        now - previous.createdAt < PET_NOTICE_DEDUPE_MS
      ) {
        return
      }
      noticeDedupeRef.current = { message, createdAt: now }
      const id = `pet-${now}-${Math.random().toString(36).slice(2)}`
      const notice: ChatMessage = {
        id,
        role: 'pet',
        text: message,
        createdAt: now,
      }
      setMessages((current) => [...current, notice].slice(-24))
      setBubbleMessageId(id)
      scheduleBubbleHide(message)
    },
    [scheduleBubbleHide],
  )

  async function speakPetReply(text: string, options: { manageSpeaking?: boolean } = {}) {
    const content = normalizeTtsText(text)
    if (!content) return

    const manageSpeaking = options.manageSpeaking ?? true
    if (manageSpeaking) setIsSpeaking(true)
    try {
      const didSpeak = await api?.pet?.speak?.(content).catch(() => false)
      if (didSpeak) return
      if (!window.speechSynthesis) return

      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(content)
        utterance.lang = navigator.language || 'zh-CN'
        utterance.rate = 0.94
        utterance.pitch = 1.08
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.speak(utterance)
      })
    } finally {
      if (manageSpeaking) setIsSpeaking(false)
    }
  }

  function resetPetSpeechQueue() {
    const generation = ttsSpeechGenerationRef.current + 1
    ttsSpeechGenerationRef.current = generation
    ttsQueueRef.current = Promise.resolve()
    void api?.pet?.cancelSpeech?.().catch(() => null)
    return generation
  }

  function enqueuePetSpeech(text: string, generation: number) {
    const content = normalizeTtsText(text)
    if (!content) return
    setIsSpeaking(true)
    if (generation !== ttsSpeechGenerationRef.current) return
    const previous = ttsQueueRef.current.catch(() => undefined)
    const current = speakPetReply(content, { manageSpeaking: false }).catch(() => undefined)
    ttsQueueRef.current = Promise.all([previous, current]).then(() => undefined)
  }

  async function finishPetSpeechQueue(generation: number) {
    try {
      await ttsQueueRef.current
    } finally {
      if (generation === ttsSpeechGenerationRef.current) setIsSpeaking(false)
    }
  }

  async function sendChatText(text: string, options: { speak?: boolean } = {}) {
    const trimmed = text.trim()
    if (!trimmed || chatBusy) return
    const shouldSpeak = Boolean(options.speak)
    const speechGeneration = shouldSpeak ? resetPetSpeechQueue() : ttsSpeechGenerationRef.current
    let speechBuffer = ''
    let queuedSpeech = false
    const queueReadySpeech = (force = false) => {
      if (!shouldSpeak) return
      let guard = 0
      while (guard < 8) {
        guard += 1
        const ready = takeReadyTtsSegment(speechBuffer, force)
        if (!ready) break
        speechBuffer = ready.rest
        if (ready.segment) {
          queuedSpeech = true
          enqueuePetSpeech(ready.segment, speechGeneration)
        }
        if (!force) break
      }
    }
    if (shouldSpeak) void api?.pet?.prewarmVoice?.().catch(() => false)
    const now = Date.now()
    const userMessage: ChatMessage = {
      id: `user-${now}`,
      role: 'user',
      text: trimmed,
      createdAt: now,
    }
    const replyId = `pet-${now + 1}`
    const replyMessage: ChatMessage = {
      id: replyId,
      role: 'pet',
      text: '',
      createdAt: now + 1,
      streaming: true,
    }
    const history = messages
      .slice(-10)
      .map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: localizedChatText(message, petState, t),
      }))
      .filter((message) => message.content.trim())
    const requestBody = {
      model: 'default',
      stream: true,
      temperature: 0.75,
      max_tokens: 420,
      messages: [
        { role: 'system', content: buildPetSystemPrompt(petState) },
        ...history,
        { role: 'user', content: trimmed },
      ],
    }
    setMessages((current) => [...current, userMessage, replyMessage].slice(-24))
    setChatInput('')
    setPetState((current) => applyPetAction(current, 'pet'))
    setBubbleMessageId(replyId)
    setChatBusy(true)

    let output = ''
    try {
      const token = await readShadowAccessToken(api)
      if (!token) {
        setIsAuthenticated(false)
        throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
      }
      setIsAuthenticated(true)
      const appendDelta = (delta: string) => {
        if (shouldSpeak) {
          speechBuffer = `${speechBuffer}${delta}`
          queueReadySpeech(false)
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId
              ? { ...message, text: `${message.text ?? ''}${delta}`, streaming: true }
              : message,
          ),
        )
      }
      if (api?.pet?.modelProxyStream) {
        const requestId = `pet-chat-${now}-${Math.random().toString(36).slice(2)}`
        const result = await api.pet.modelProxyStream({ requestId, body: requestBody }, appendDelta)
        output = result.text
      } else {
        const response = await fetch(getShadowUrl('/api/ai/v1/chat/completions'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        })
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(body || `REQUEST_FAILED_${response.status}`)
        }
        output = await readCompletionStream(response, appendDelta)
      }
      const finalText = output.trim() || t('desktopPet.chat.emptyReply')
      setMessages((current) =>
        current.map((message) =>
          message.id === replyId ? { ...message, text: finalText, streaming: false } : message,
        ),
      )
      setBubbleMessageId(replyId)
      scheduleBubbleHide(finalText)
      if (shouldSpeak) {
        if (!speechBuffer.trim() && !queuedSpeech) {
          speechBuffer = finalText
        }
        queueReadySpeech(true)
        void finishPetSpeechQueue(speechGeneration)
      }
    } catch (error) {
      console.warn('[desktop-pet] model proxy request failed', error)
      const authRequired = isCommunityAuthRequiredError(error)
      if (authRequired) setIsAuthenticated(false)
      const key = authRequired ? 'desktopPet.chat.authRequired' : 'desktopPet.chat.proxyError'
      const fallbackText = t(key)
      setMessages((current) =>
        current.map((message) =>
          message.id === replyId ? { ...message, text: fallbackText, streaming: false } : message,
        ),
      )
      setBubbleMessageId(replyId)
      scheduleBubbleHide(fallbackText)
      if (shouldSpeak) {
        speechBuffer = fallbackText
        queueReadySpeech(true)
        void finishPetSpeechQueue(speechGeneration)
      }
    } finally {
      setChatBusy(false)
    }
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    void sendChatText(chatInput, { speak: voiceMode })
  }

  function stopLocalAudioCapture() {
    const nodes = audioNodesRef.current
    audioNodesRef.current = null
    try {
      nodes?.source.disconnect()
      nodes?.processor.disconnect()
      nodes?.gain.disconnect()
    } catch {
      // The audio graph may already be disconnected during pointer-leave races.
    }

    const stream = mediaStreamRef.current
    mediaStreamRef.current = null
    for (const track of stream?.getTracks() ?? []) track.stop()

    const audioContext = audioContextRef.current
    audioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => null)
    }

    asrPartialUnsubscribeRef.current?.()
    asrPartialUnsubscribeRef.current = null
  }

  async function startLocalVoiceCapture() {
    if (!api?.pet?.asrStart || !api.pet.asrAccept || !api.pet.asrStop) return false
    const AudioContextConstructor = getAudioContextConstructor()
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) return false

    voiceCaptureWantedRef.current = true
    localAsrSessionRef.current = true
    voiceStartingRef.current = true
    voiceErrorRef.current = false
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    voiceLastSignalAtRef.current = Date.now()
    voiceHeardAudioRef.current = false
    setVoiceSignalActiveState(false)
    setVoiceTranscript(t('desktopPet.voice.recognizing'))

    try {
      const status = await api.pet.voiceEngineStatus?.().catch(() => null)
      if (status && !status.nativeAddonAvailable) {
        localAsrSessionRef.current = false
        return false
      }
      if (status && !status.asr.installed) {
        setVoiceTranscript(t('desktopPet.voice.downloadingModel', { percent: 0 }))
      }
      await api.pet.asrStart()
      if (!voiceCaptureWantedRef.current) {
        await api.pet.asrStop().catch(() => ({ text: '' }))
        localAsrSessionRef.current = false
        return true
      }

      asrPartialUnsubscribeRef.current =
        api.pet.onAsrPartial?.((payload) => {
          const text = payload.text.trim()
          voiceTranscriptRef.current = text
          voiceDraftRef.current = text
          setVoiceTranscript(text || t('desktopPet.voice.recognizing'))
        }) ?? null

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      })
      if (!voiceCaptureWantedRef.current) {
        for (const track of stream.getTracks()) track.stop()
        await api.pet.asrStop().catch(() => ({ text: '' }))
        localAsrSessionRef.current = false
        return true
      }

      const audioContext = new AudioContextConstructor()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      gain.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (!localAsrActiveRef.current || !api.pet?.asrAccept) return
        const channel = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (let index = 0; index < channel.length; index += 1) {
          const sample = channel[index] ?? 0
          sum += sample * sample
        }
        const rms = Math.sqrt(sum / Math.max(channel.length, 1))
        const hasSignal = rms > VOICE_LEVEL_THRESHOLD
        setVoiceSignalActiveState(hasSignal)
        if (hasSignal) {
          voiceLastSignalAtRef.current = Date.now()
          voiceHeardAudioRef.current = true
        }
        const samples = resampleAudio(channel, audioContext.sampleRate, 16000)
        void api.pet
          .asrAccept({ samples: copyFloat32Buffer(samples), sampleRate: 16000 })
          .catch(() => null)
      }
      source.connect(processor)
      processor.connect(gain)
      gain.connect(audioContext.destination)
      await audioContext.resume()

      mediaStreamRef.current = stream
      audioContextRef.current = audioContext
      audioNodesRef.current = { gain, processor, source }
      localAsrActiveRef.current = true
      setVoiceTranscript(t('desktopPet.voice.recognizing'))
      setVoiceRecording(true)
      return true
    } catch (error) {
      console.warn('[desktop-pet] local voice capture failed', error)
      stopLocalAudioCapture()
      localAsrActiveRef.current = false
      localAsrSessionRef.current = false
      voiceErrorRef.current = true
      setVoiceSignalActiveState(false)
      setVoiceRecording(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.modelError'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      return false
    } finally {
      voiceStartingRef.current = false
    }
  }

  async function finishLocalVoiceCapture() {
    if (!localAsrSessionRef.current) return
    voiceCaptureWantedRef.current = false
    localAsrActiveRef.current = false
    localAsrSessionRef.current = false
    voiceHeardAudioRef.current = false
    setVoiceSignalActiveState(false)
    setVoiceRecording(false)
    setVoiceMode(false)
    stopLocalAudioCapture()

    const result = await api?.pet?.asrStop?.().catch((error) => {
      console.warn('[desktop-pet] local voice stop failed', error)
      return { text: '' }
    })
    const transcript =
      result?.text?.trim() || voiceTranscriptRef.current.trim() || voiceDraftRef.current.trim()
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    setVoiceTranscript('')
    if (transcript) void sendChatText(transcript, { speak: true })
  }

  async function beginHoldVoiceCapture() {
    if (voiceFinishTimerRef.current) {
      window.clearTimeout(voiceFinishTimerRef.current)
      voiceFinishTimerRef.current = null
    }
    if (recognitionRef.current || voiceStartingRef.current || chatBusy) return
    setBubbleMessageId(null)
    setVoiceTranscript(t('desktopPet.voice.recognizing'))
    voiceCaptureWantedRef.current = true
    setVoiceMode(true)
    void api?.pet?.prewarmVoice?.().catch(() => false)
    const startedLocal = await startLocalVoiceCapture()
    if (startedLocal) return
    await startWebVoiceCapture()
  }

  async function startWebVoiceCapture() {
    if (!voiceCaptureWantedRef.current) {
      setVoiceMode(false)
      setVoiceRecording(false)
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setBubbleMessageId(null)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      return
    }
    const recognition = new Recognition()
    voiceStartingRef.current = true
    voiceErrorRef.current = false
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    setVoiceSignalActiveState(false)
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'
    recognition.onresult = (event) => {
      let finalText = voiceTranscriptRef.current
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += transcript
        else interim += transcript
      }
      voiceTranscriptRef.current = finalText
      voiceDraftRef.current = `${finalText}${interim}`.trim()
      setVoiceTranscript(voiceDraftRef.current)
    }
    recognition.onerror = () => {
      voiceErrorRef.current = true
      voiceTranscriptRef.current = ''
      voiceDraftRef.current = ''
      setVoiceRecording(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      recognitionRef.current = null
      voiceStartingRef.current = false
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      voiceStartingRef.current = false
      const hadError = voiceErrorRef.current
      voiceErrorRef.current = false
      const transcript = voiceTranscriptRef.current.trim() || voiceDraftRef.current.trim()
      voiceDraftRef.current = ''
      if (hadError) return
      setVoiceTranscript('')
      if (transcript) void sendChatText(transcript, { speak: true })
    }
    recognitionRef.current = recognition
    voiceCaptureWantedRef.current = true
    setVoiceTranscript(t('desktopPet.voice.recognizing'))
    setVoiceRecording(true)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of stream.getTracks()) track.stop()
      }
      if (recognitionRef.current !== recognition) return
      recognition.start()
    } catch {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
    } finally {
      voiceStartingRef.current = false
    }
  }

  function finishVoiceCaptureNow() {
    voiceCaptureWantedRef.current = false
    setVoiceSignalActiveState(false)
    if (localAsrSessionRef.current) {
      void finishLocalVoiceCapture()
      return
    }
    if (!recognitionRef.current) {
      setVoiceRecording(false)
      setVoiceMode(false)
      return
    }
    try {
      recognitionRef.current.stop()
    } catch {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceMode(false)
      voiceStartingRef.current = false
    }
  }

  function finishVoiceCapture() {
    if (voiceFinishTimerRef.current) return
    voiceFinishTimerRef.current = window.setTimeout(() => {
      voiceFinishTimerRef.current = null
      finishVoiceCaptureNow()
    }, VOICE_RELEASE_GRACE_MS)
  }

  return {
    messages,
    chatInput,
    chatBusy,
    voiceMode,
    voiceRecording,
    voiceSignalActive,
    voiceTranscript,
    isSpeaking,
    bubbleMessage,
    bubbleText,
    chatInputRef,
    messagesEndRef,
    bubbleContentRef,
    setChatInput,
    sendChat,
    showPetNotice,
    beginHoldVoiceCapture,
    finishVoiceCapture,
  }
}

function loadChatMessages() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return createInitialMessages()
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : createInitialMessages()
  } catch {
    return createInitialMessages()
  }
}

function buildPetSystemPrompt(petState: PetState) {
  return [
    'You are Shadow Desktop Pet, a quiet desktop companion for the Shadow OwnBuddy community.',
    'Speak in the user language. Keep replies short, warm, and useful, usually under 80 Chinese characters unless asked for details.',
    'You should act like a small Buddy pet. Do not claim you are a generic assistant.',
    'Use the following live pet profile and state as durable context.',
    JSON.stringify({
      name: 'Shadow Desktop Pet',
      personality: petState.stats.personality,
      attribute: petState.stats.attribute,
      status: {
        mood: petState.stats.mood,
        health: petState.stats.health,
        loyalty: petState.stats.loyalty,
      },
      lastAction: petState.lastAction,
      lastActionAt: petState.lastActionAt,
    }),
  ].join('\n')
}

function extractCompletionText(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const record = choice as Record<string, unknown>
      const message = record.message as Record<string, unknown> | undefined
      const delta = record.delta as Record<string, unknown> | undefined
      return String(message?.content ?? delta?.content ?? record.text ?? '')
    })
    .join('')
}

async function readCompletionStream(response: Response, onDelta: (delta: string) => void) {
  if (!response.body) {
    const data = (await response.json().catch(() => null)) as unknown
    const text = extractCompletionText(data)
    if (text) onDelta(text)
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''

  const captureEvent = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') return
    try {
      const parsed = JSON.parse(data) as unknown
      const delta = extractCompletionText(parsed)
      if (!delta) return
      output += delta
      onDelta(delta)
    } catch {
      // Ignore malformed SSE frames; the proxy keeps streaming valid frames.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const event of events) captureEvent(event)
  }
  if (buffer) captureEvent(buffer)
  return output
}

function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

function resampleAudio(input: Float32Array, inputRate: number, outputRate = 16000) {
  if (inputRate === outputRate) return new Float32Array(input)
  const ratio = inputRate / outputRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio
    const before = Math.floor(sourceIndex)
    const after = Math.min(before + 1, input.length - 1)
    const weight = sourceIndex - before
    output[index] = (input[before] ?? 0) * (1 - weight) + (input[after] ?? 0) * weight
  }
  return output
}

function copyFloat32Buffer(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.byteLength)
  new Float32Array(buffer).set(samples)
  return buffer
}

function takeReadyTtsSegment(buffer: string, force = false) {
  const content = buffer.trimStart()
  if (!content) return null

  let boundary = -1
  for (let index = 0; index < content.length; index += 1) {
    if (!/[。！？!?；;\n]/.test(content.charAt(index))) continue
    if (index + 1 >= TTS_STREAM_MIN_SEGMENT_CHARS) {
      boundary = index + 1
      break
    }
  }

  if (boundary < 0 && content.length >= TTS_STREAM_SOFT_SEGMENT_CHARS) {
    const searchWindow = content.slice(
      TTS_STREAM_MIN_SEGMENT_CHARS,
      Math.min(content.length, TTS_STREAM_MAX_SEGMENT_CHARS),
    )
    const softBoundary = Math.max(
      searchWindow.lastIndexOf('，'),
      searchWindow.lastIndexOf(','),
      searchWindow.lastIndexOf('、'),
      searchWindow.lastIndexOf(' '),
    )
    if (softBoundary >= 0) boundary = TTS_STREAM_MIN_SEGMENT_CHARS + softBoundary + 1
  }

  if (boundary < 0 && content.length >= TTS_STREAM_MAX_SEGMENT_CHARS) {
    boundary = TTS_STREAM_MAX_SEGMENT_CHARS
  }

  if (boundary < 0 && force) boundary = content.length
  if (boundary <= 0) return null

  const segment = normalizeTtsText(content.slice(0, boundary))
  const rest = content.slice(boundary)
  return segment ? { rest, segment } : { rest, segment: '' }
}

function getBubbleTypeDelay(char: string) {
  if (/[。！？.!?]/.test(char)) return BUBBLE_SENTENCE_PAUSE_MS
  if (/[，、；：,.，;:]/.test(char)) return BUBBLE_CLAUSE_PAUSE_MS
  return BUBBLE_TYPE_INTERVAL_MS
}

function estimateBubbleRevealDuration(text: string) {
  return [...text].reduce((total, char) => total + getBubbleTypeDelay(char), 0)
}
