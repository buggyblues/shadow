import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerVoiceHandlers(container: DesktopContainer): void {
  const { voiceEngineService } = container.cradle

  const petVoice = {
    speak: (text) => voiceEngineService.speak(text),
    cancelSpeech: () => voiceEngineService.cancelSpeech(),
    voiceEngineStatus: () => voiceEngineService.getStatus(),
    prewarmVoice: () => voiceEngineService.prewarm(),
    installVoiceModel: (input, event) => voiceEngineService.installVoiceModel(event.sender, input),
    asrStart: (_input, event) => voiceEngineService.asrStart(event.sender),
    asrAccept: (input) => voiceEngineService.asrAccept(input),
    asrStop: () => voiceEngineService.asrStop(),
  } satisfies DesktopIPCServiceImplementation<'petVoice'>

  registerDesktopIPCService('petVoice', petVoice)
}
