import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'

let sendSound: AudioPlayer | null = null
let receiveSound: AudioPlayer | null = null

const SEND_FREQUENCY = 800 // Hz
const RECEIVE_FREQUENCY = 600 // Hz

async function ensureSounds() {
  if (!sendSound) {
    // Create a short "pop" sound for sending
    sendSound = createAudioPlayer(generateToneDataUri(SEND_FREQUENCY, 0.08))
    sendSound.volume = 0.3
  }
  if (!receiveSound) {
    receiveSound = createAudioPlayer(generateToneDataUri(RECEIVE_FREQUENCY, 0.12))
    receiveSound.volume = 0.2
  }
}

function generateToneDataUri(frequency: number, duration: number): string {
  const sampleRate = 22050
  const numSamples = Math.floor(sampleRate * duration)
  const samples = new Uint8Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // Sine wave with quick fade-in/out envelope
    const envelope = Math.min(1, t * 50) * Math.max(0, 1 - t / duration)
    const value = Math.sin(2 * Math.PI * frequency * t) * envelope
    samples[i] = Math.floor((value + 1) * 127.5)
  }

  // Build minimal WAV
  const wavSize = 44 + numSamples
  const wav = new Uint8Array(wavSize)
  const view = new DataView(wav.buffer)

  // RIFF header
  wav.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
  view.setUint32(4, wavSize - 8, true)
  wav.set([0x57, 0x41, 0x56, 0x45], 8) // "WAVE"

  // fmt chunk
  wav.set([0x66, 0x6d, 0x74, 0x20], 12) // "fmt "
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true) // sample rate
  view.setUint32(28, sampleRate, true) // byte rate
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample

  // data chunk
  wav.set([0x64, 0x61, 0x74, 0x61], 36) // "data"
  view.setUint32(40, numSamples, true)
  wav.set(samples, 44)

  // Convert to base64 data URI
  let binary = ''
  for (let i = 0; i < wav.length; i++) {
    binary += String.fromCharCode(wav[i]!)
  }
  return `data:audio/wav;base64,${btoa(binary)}`
}

export async function playSendSound() {
  try {
    await setAudioModeAsync({ playsInSilentMode: false })
    await ensureSounds()
    if (sendSound) {
      await sendSound.seekTo(0)
      sendSound.play()
    }
  } catch {
    // Sound playback is non-critical
  }
}

export async function playReceiveSound() {
  try {
    await setAudioModeAsync({ playsInSilentMode: false })
    await ensureSounds()
    if (receiveSound) {
      await receiveSound.seekTo(0)
      receiveSound.play()
    }
  } catch {
    // Sound playback is non-critical
  }
}
