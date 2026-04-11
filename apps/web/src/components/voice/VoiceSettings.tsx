import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shadowob/ui'
import { Mic, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface VoiceSettingsProps {
  open: boolean
  onClose: () => void
  getMicrophones: () => Promise<MediaDeviceInfo[]>
  setMicrophoneDevice: (deviceId: string) => Promise<void>
}

export function VoiceSettings({
  open,
  onClose,
  getMicrophones,
  setMicrophoneDevice,
}: VoiceSettingsProps) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState('')
  const [volume, setVolume] = useState(0)
  const [testing, setTesting] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  // Fetch devices when modal opens
  useEffect(() => {
    if (!open) {
      // Cleanup when closing
      setTesting(false)
      return
    }
    void (async () => {
      try {
        const devices = await getMicrophones()
        setMics(devices)
        setSelectedMic(devices[0]?.deviceId ?? '')
      } catch {
        // Permission may be denied — show empty list
        setMics([])
      }
    })()

    return () => {
      setTesting(false)
    }
  }, [open, getMicrophones])

  // Volume meter animation
  useEffect(() => {
    if (!testing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      analyserRef.current = null
      setVolume(0)
      return
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedMic ? { exact: selectedMic } : undefined },
        })
        streamRef.current = stream
        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        analyserRef.current = analyser

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setVolume(Math.min(100, Math.round((avg / 128) * 100)))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        setTesting(false)
      }
    })()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      analyserRef.current = null
    }
  }, [testing, selectedMic])

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId)
    try {
      await setMicrophoneDevice(deviceId)
    } catch {
      // Error will be shown in voice channel error banner
    }
  }

  return (
    <Dialog isOpen={open} onClose={onClose}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            语音设置
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Microphone selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Mic className="h-4 w-4" />
              麦克风
            </label>
            {mics.length > 0 ? (
              <select
                value={selectedMic}
                onChange={(e) => handleMicChange(e.target.value)}
                className="w-full rounded-xl bg-bg-tertiary/50 border border-border-subtle px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {mics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `麦克风 ${mic.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-text-muted">未检测到麦克风设备，请检查浏览器权限</p>
            )}
          </div>

          {/* Volume test */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              音量测试
            </label>
            <button
              type="button"
              onClick={() => setTesting((v) => !v)}
              className={`w-full rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                testing
                  ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30'
                  : 'bg-bg-tertiary/50 text-text-primary border border-border-subtle hover:bg-bg-tertiary'
              }`}
            >
              {testing ? '停止测试' : '开始测试'}
            </button>
            {testing && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#00E676] transition-all duration-100"
                    style={{ width: `${volume}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted text-center">音量: {volume}%</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
