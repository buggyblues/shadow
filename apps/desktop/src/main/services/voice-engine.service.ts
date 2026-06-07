import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { VoiceEngineStatus } from '@shadowob/shared'
import { app, net, type WebContents } from 'electron'
import { desktopSettingsService } from './desktop-settings.service'

type OnlineStream = {
  acceptWaveform: (input: { sampleRate: number; samples: Float32Array }) => void
  inputFinished: () => void
}

type OnlineRecognizer = {
  createStream: () => OnlineStream
  isReady: (stream: OnlineStream) => boolean
  decode: (stream: OnlineStream) => void
  isEndpoint: (stream: OnlineStream) => boolean
  reset: (stream: OnlineStream) => void
  getResult: (stream: OnlineStream) => { text?: string }
}

type OfflineTts = {
  numSpeakers?: number
  sampleRate?: number
  generateAsync: (input: {
    text: string
    sid?: number
    speed?: number
    enableExternalBuffer: boolean
    generationConfig?: unknown
    onProgress?: (info: { samples: Float32Array; progress: number }) => number | boolean | void
  }) => Promise<{ samples: Float32Array; sampleRate: number }>
}

type SherpaOnnx = {
  OnlineRecognizer: new (config: Record<string, unknown>) => OnlineRecognizer
  OfflineTts: {
    createAsync: (config: Record<string, unknown>) => Promise<OfflineTts>
  }
  GenerationConfig: new (config: Record<string, unknown>) => unknown
  writeWave: (filename: string, input: { samples: Float32Array; sampleRate: number }) => void
}

type VoiceModelDefinition = {
  key: 'asr' | 'tts'
  dir: string
  url: string
  requiredFiles: string[]
}

export type TtsProvider = 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'

type VoiceModelProgress = {
  key: VoiceModelDefinition['key']
  phase: 'download' | 'extract' | 'ready'
  receivedBytes?: number
  totalBytes?: number
  percent?: number
}

type TtsProviderStatus = {
  installed: boolean
  runtimeInstalled?: boolean
  modelInstalled?: boolean
  name: string
  sourceUrl: string
}

type TtsProviderDefinition = {
  id: TtsProvider
  name: string
  sourceUrl: string
  installed: () => boolean
  runtimeInstalled?: () => boolean
  modelInstalled?: () => boolean
  install?: (progressSender?: WebContents) => Promise<void>
  synthesize: (text: string, options: TtsPlaybackOptions) => Promise<TtsAudioClip | null>
}

type TtsPlaybackOptions = {
  generation?: number
}

type TtsAudioClip = {
  cleanup?: () => void
  filename: string
}

type SpeechQueueItem = {
  generation: number
  resolve: (played: boolean) => void
  text: string
}

type SpeechPlaybackItem = {
  clip: TtsAudioClip
  generation: number
  resolve: (played: boolean) => void
}

type VoxCpm2WorkerJob = {
  reject: (error: Error) => void
  resolve: (ok: boolean) => void
  ok: boolean
  timer: NodeJS.Timeout
}

type VoxCpm2WorkerState = {
  child: ChildProcessWithoutNullStreams
  jobs: Map<string, VoxCpm2WorkerJob>
  ready: Promise<void>
  stderrTail: string
  stdoutBuffer: string
}

type ActiveAsrState = {
  sender: WebContents
  stream: OnlineStream
  segments: string[]
  lastText: string
}

const requireNative = createRequire(__filename)

const ASR_MODEL: VoiceModelDefinition = {
  key: 'asr',
  dir: 'sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16.tar.bz2',
  requiredFiles: [
    'encoder-epoch-99-avg-1.int8.onnx',
    'decoder-epoch-99-avg-1.onnx',
    'joiner-epoch-99-avg-1.int8.onnx',
    'tokens.txt',
  ],
}

const TTS_MODEL: VoiceModelDefinition = {
  key: 'tts',
  dir: 'sherpa-onnx-vits-zh-ll',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-vits-zh-ll.tar.bz2',
  requiredFiles: ['model.onnx', 'tokens.txt', 'lexicon.txt'],
}

const MOSS_TTS_REPO = 'https://github.com/OpenMOSS/MOSS-TTS-Nano.git'
const MOSS_TTS_REPO_DIR = 'repo'
const MOSS_TTS_RUNTIME_DIR = 'moss-tts-nano'
const MOSS_TTS_CHILD_VOICE = 'Junhao'
const MOSS_TTS_TEST_TEXT = '你好，我是你的桌面宠物。'
const VOXCPM2_SOURCE_URL = 'https://github.com/OpenBMB/VoxCPM'
const VOXCPM2_MODEL_ID = 'openbmb/VoxCPM2'
const VOXCPM2_RUNTIME_DIR = 'voxcpm2'
const VOXCPM2_TEST_TEXT = '你好，我是你的桌面宠物。'
const TTS_PROVIDER_IDS: TtsProvider[] = ['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']
const DEFAULT_TTS_CHUNK_CHAR_LIMIT = 140
const SHERPA_TTS_CHUNK_CHAR_LIMIT = 90
const LOCAL_TTS_FALLBACK_ORDER: TtsProvider[] = ['voxcpm2', 'moss-tts-nano', 'sherpa-local']

const VOXCPM2_GENERATE_SCRIPT = `
import sys
import os
import soundfile as sf
from voxcpm import VoxCPM

text = sys.argv[1]
output = sys.argv[2]

model = VoxCPM.from_pretrained(
    "${VOXCPM2_MODEL_ID}",
    load_denoiser=False,
    cache_dir=os.environ.get("HF_HOME"),
    device="cpu",
    optimize=False,
)
wav = model.generate(
    text=text,
    cfg_value=2.0,
    inference_timesteps=10,
)
sf.write(output, wav, int(model.tts_model.sample_rate))
`.trim()

const VOXCPM2_WORKER_SCRIPT = `
import json
import os
import sys
import soundfile as sf

json_stdout = sys.stdout
sys.stdout = sys.stderr

from voxcpm import VoxCPM

def emit(payload):
    json_stdout.write(json.dumps(payload, separators=(",", ":")) + "\\n")
    json_stdout.flush()

model = VoxCPM.from_pretrained(
    "${VOXCPM2_MODEL_ID}",
    load_denoiser=False,
    cache_dir=os.environ.get("HF_HOME"),
    device="cpu",
    optimize=False,
)
emit({"event": "ready"})

for raw_line in sys.stdin:
    raw_line = raw_line.strip()
    if not raw_line:
        continue
    try:
        request = json.loads(raw_line)
        request_id = request.get("requestId")
        text = request.get("text")
        output = request.get("output")
        if not request_id or not text:
            emit({"event": "error", "requestId": request_id, "error": "INVALID_REQUEST"})
            continue
        if not output:
            emit({"event": "error", "requestId": request_id, "error": "MISSING_OUTPUT"})
            continue
        wav = model.generate(
            text=text,
            cfg_value=2.0,
            inference_timesteps=10,
        )
        sf.write(output, wav, int(model.tts_model.sample_rate))
        emit({"event": "done", "requestId": request_id})
    except Exception as error:
        emit({
            "event": "error",
            "requestId": request.get("requestId") if "request" in locals() else None,
            "error": str(error),
        })
`.trim()

class VoiceModelPathService {
  modelRoot(): string {
    return join(app.getPath('userData'), 'voice-models')
  }

  modelDir(model: VoiceModelDefinition): string {
    return join(this.modelRoot(), model.dir)
  }

  hasModel(model: VoiceModelDefinition): boolean {
    const dir = this.modelDir(model)
    return model.requiredFiles.every((file) => existsSync(join(dir, file)))
  }

  mossRoot(): string {
    return join(this.modelRoot(), MOSS_TTS_RUNTIME_DIR)
  }

  mossRepoDir(): string {
    return join(this.mossRoot(), MOSS_TTS_REPO_DIR)
  }

  mossPythonPath(): string {
    return process.platform === 'win32'
      ? join(this.mossRoot(), '.venv', 'Scripts', 'python.exe')
      : join(this.mossRoot(), '.venv', 'bin', 'python')
  }

  mossModelDir(): string {
    return join(this.mossRepoDir(), 'models')
  }

  hasMossRuntime(): boolean {
    return (
      existsSync(this.mossPythonPath()) &&
      existsSync(join(this.mossRepoDir(), 'moss_tts_nano', 'cli.py'))
    )
  }

  hasMossModel(): boolean {
    const root = this.mossModelDir()
    return (
      existsSync(join(root, 'browser_poc_manifest.json')) ||
      existsSync(join(root, 'MOSS-TTS-Nano-100M-ONNX', 'browser_poc_manifest.json')) ||
      existsSync(join(root, 'MOSS-TTS-Nano-ONNX-CPU', 'browser_poc_manifest.json'))
    )
  }

  voxCpm2Root(): string {
    return join(this.modelRoot(), VOXCPM2_RUNTIME_DIR)
  }

  voxCpm2PythonPath(): string {
    return process.platform === 'win32'
      ? join(this.voxCpm2Root(), '.venv', 'Scripts', 'python.exe')
      : join(this.voxCpm2Root(), '.venv', 'bin', 'python')
  }

  voxCpm2CacheDir(): string {
    return join(this.voxCpm2Root(), 'hf-cache')
  }

  voxCpm2MarkerPath(): string {
    return join(this.voxCpm2Root(), 'model-ready.json')
  }

  hasVoxCpm2Runtime(): boolean {
    return existsSync(this.voxCpm2PythonPath())
  }

  hasVoxCpm2Model(): boolean {
    const hubDir = join(this.voxCpm2CacheDir(), 'hub')
    const modelCacheDir = join(hubDir, 'models--openbmb--VoxCPM2')
    return existsSync(hubDir) && (existsSync(this.voxCpm2MarkerPath()) || existsSync(modelCacheDir))
  }

  tempAudioPath(prefix: string, extension = 'wav'): string {
    return join(
      app.getPath('temp'),
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    )
  }
}

class VoiceProcessService {
  run(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      const timer = options.timeoutMs
        ? setTimeout(() => {
            child.kill('SIGTERM')
            reject(new Error(`VOICE_COMMAND_TIMEOUT_${command}`))
          }, options.timeoutMs)
        : null
      const appendOutput = (chunk: Buffer) => {
        output = `${output}${chunk.toString('utf8')}`.slice(-4000)
      }
      child.stdout?.on('data', appendOutput)
      child.stderr?.on('data', appendOutput)
      child.on('error', (error) => {
        if (timer) clearTimeout(timer)
        reject(error)
      })
      child.on('exit', (code) => {
        if (timer) clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(output.trim() || `VOICE_COMMAND_FAILED_${command}_${code}`))
      })
    })
  }

  runMacSay(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('/usr/bin/say', args, { stdio: 'ignore' })
      child.on('error', () => resolve(false))
      child.on('exit', (code) => resolve(code === 0))
    })
  }
}

class VoiceModelService {
  private readonly downloads = new Map<string, Promise<void>>()
  private sherpaModule: SherpaOnnx | null = null

  constructor(private readonly paths: VoiceModelPathService) {}

  loadSherpa(): SherpaOnnx {
    if (!this.sherpaModule) {
      this.sherpaModule = requireNative('sherpa-onnx-node') as SherpaOnnx
    }
    return this.sherpaModule
  }

  isNativeAddonAvailable(): boolean {
    try {
      return Boolean(this.loadSherpa())
    } catch {
      return false
    }
  }

  ensureAsrModel(progressSender?: WebContents): Promise<void> {
    return this.ensureModel(ASR_MODEL, progressSender)
  }

  ensureTtsModel(progressSender?: WebContents): Promise<void> {
    return this.ensureModel(TTS_MODEL, progressSender)
  }

  private async ensureModel(
    model: VoiceModelDefinition,
    progressSender?: WebContents,
  ): Promise<void> {
    const pending = this.downloads.get(model.key)
    if (pending) await pending
    if (this.paths.hasModel(model)) return
    const next = this.downloadModel(model, progressSender).finally(() => {
      this.downloads.delete(model.key)
    })
    this.downloads.set(model.key, next)
    await next
  }

  private async downloadModel(
    model: VoiceModelDefinition,
    progressSender?: WebContents,
  ): Promise<void> {
    if (this.paths.hasModel(model)) return
    mkdirSync(this.paths.modelRoot(), { recursive: true })
    const archivePath = join(this.paths.modelRoot(), `${model.dir}.tar.bz2`)
    const response = await net.fetch(model.url)
    if (!response.ok || !response.body) {
      throw new Error(`VOICE_MODEL_DOWNLOAD_FAILED_${model.key}_${response.status}`)
    }
    const totalBytes = Number(response.headers.get('content-length') ?? 0)
    let receivedBytes = 0
    let lastProgressAt = 0
    this.emitProgress(progressSender, {
      key: model.key,
      phase: 'download',
      receivedBytes,
      totalBytes: totalBytes || undefined,
      percent: totalBytes ? 0 : undefined,
    })
    const progressStream = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        receivedBytes += chunk.byteLength
        const now = Date.now()
        if (now - lastProgressAt > 250) {
          lastProgressAt = now
          this.emitProgress(progressSender, {
            key: model.key,
            phase: 'download',
            receivedBytes,
            totalBytes: totalBytes || undefined,
            percent: totalBytes
              ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100))
              : undefined,
          })
        }
        callback(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      progressStream,
      createWriteStream(archivePath),
    )
    this.emitProgress(progressSender, {
      key: model.key,
      phase: 'extract',
      receivedBytes,
      totalBytes: totalBytes || undefined,
      percent: 99,
    })
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-xjf', archivePath, '-C', this.paths.modelRoot()], {
        stdio: 'ignore',
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`VOICE_MODEL_EXTRACT_FAILED_${model.key}_${code}`))
      })
    })
    rmSync(archivePath, { force: true })
    if (!this.paths.hasModel(model)) throw new Error(`VOICE_MODEL_INCOMPLETE_${model.key}`)
    this.emitProgress(progressSender, {
      key: model.key,
      phase: 'ready',
      receivedBytes,
      totalBytes: totalBytes || undefined,
      percent: 100,
    })
  }

  private emitProgress(sender: WebContents | undefined, payload: VoiceModelProgress): void {
    if (!sender || sender.isDestroyed()) return
    sender.send('desktop:pet:voiceModelProgress', payload)
  }
}

class VoxCpm2WorkerService {
  private worker: VoxCpm2WorkerState | null = null

  constructor(
    private readonly paths: VoiceModelPathService,
    private readonly processes: VoiceProcessService,
  ) {}

  hasRuntime(): boolean {
    return this.paths.hasVoxCpm2Runtime()
  }

  hasModel(): boolean {
    return this.paths.hasVoxCpm2Model()
  }

  async install(progressSender?: WebContents): Promise<void> {
    mkdirSync(this.paths.voxCpm2Root(), { recursive: true })
    mkdirSync(this.paths.voxCpm2CacheDir(), { recursive: true })
    this.emitProgress(progressSender, { key: 'tts', phase: 'download', percent: 10 })
    if (!existsSync(this.paths.voxCpm2PythonPath())) {
      await this.processes.run(
        process.env.SHADOW_VOXCPM2_PYTHON || 'python3',
        ['-m', 'venv', join(this.paths.voxCpm2Root(), '.venv')],
        { timeoutMs: 300_000 },
      )
    }
    this.emitProgress(progressSender, { key: 'tts', phase: 'download', percent: 25 })
    await this.processes.run(
      this.paths.voxCpm2PythonPath(),
      ['-m', 'pip', 'install', '--upgrade', 'pip'],
      { timeoutMs: 300_000 },
    )
    this.emitProgress(progressSender, { key: 'tts', phase: 'download', percent: 45 })
    await this.processes.run(
      this.paths.voxCpm2PythonPath(),
      ['-m', 'pip', 'install', 'voxcpm', 'soundfile'],
      {
        env: this.processEnv(),
        timeoutMs: 1_800_000,
      },
    )
    this.emitProgress(progressSender, { key: 'tts', phase: 'download', percent: 80 })
    const warmupFile = join(app.getPath('temp'), `shadow-pet-voxcpm2-install-${Date.now()}.wav`)
    await this.runGenerate(VOXCPM2_TEST_TEXT, warmupFile)
    rmSync(warmupFile, { force: true })
    writeFileSync(
      this.paths.voxCpm2MarkerPath(),
      JSON.stringify(
        {
          modelId: VOXCPM2_MODEL_ID,
          sourceUrl: VOXCPM2_SOURCE_URL,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
    if (!this.paths.hasVoxCpm2Model()) throw new Error('VOXCPM2_MODEL_INCOMPLETE')
    this.emitProgress(progressSender, { key: 'tts', phase: 'ready', percent: 100 })
  }

  ensureWorker(): Promise<VoxCpm2WorkerState> {
    if (this.worker && !this.worker.child.killed) {
      return this.worker.ready.then(() => this.worker as VoxCpm2WorkerState)
    }

    const child = spawn(this.paths.voxCpm2PythonPath(), ['-c', VOXCPM2_WORKER_SCRIPT], {
      cwd: this.paths.voxCpm2Root(),
      env: this.processEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let resolveReady: () => void = () => undefined
    let rejectReady: (error: Error) => void = () => undefined
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    const state: VoxCpm2WorkerState = {
      child,
      jobs: new Map(),
      ready,
      stderrTail: '',
      stdoutBuffer: '',
    }
    this.worker = state

    const handleLine = (line: string) => {
      if (!line.trim()) return
      try {
        const payload = JSON.parse(line) as Record<string, unknown>
        if (payload.event === 'ready') {
          resolveReady()
          return
        }
        this.handleWorkerEvent(state, payload)
      } catch (error) {
        state.stderrTail =
          `${state.stderrTail}\n${error instanceof Error ? error.message : String(error)}`.slice(
            -4000,
          )
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      state.stdoutBuffer = `${state.stdoutBuffer}${chunk.toString('utf8')}`
      let newlineIndex = state.stdoutBuffer.indexOf('\n')
      while (newlineIndex >= 0) {
        handleLine(state.stdoutBuffer.slice(0, newlineIndex))
        state.stdoutBuffer = state.stdoutBuffer.slice(newlineIndex + 1)
        newlineIndex = state.stdoutBuffer.indexOf('\n')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      state.stderrTail = `${state.stderrTail}${chunk.toString('utf8')}`.slice(-4000)
    })
    child.on('error', (error) => {
      rejectReady(error)
      this.rejectWorkerJobs(state, error)
      if (this.worker === state) this.worker = null
    })
    child.on('exit', (code) => {
      const error = new Error(state.stderrTail.trim() || `VOXCPM2_WORKER_EXITED_${code}`)
      rejectReady(error)
      this.rejectWorkerJobs(state, error)
      if (this.worker === state) this.worker = null
    })

    return ready.then(() => state)
  }

  async runWorkerGenerate(text: string, output: string, timeoutMs = 3_600_000): Promise<boolean> {
    const state = await this.ensureWorker()
    return new Promise((resolve, reject) => {
      const requestId = `voxcpm2-file-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const timer = setTimeout(() => {
        this.finishWorkerJob(state, requestId, new Error('VOICE_COMMAND_TIMEOUT_voxcpm2_file'))
      }, timeoutMs)
      state.jobs.set(requestId, {
        reject,
        resolve,
        ok: true,
        timer,
      })
      try {
        const ok = state.child.stdin.write(`${JSON.stringify({ output, requestId, text })}\n`)
        if (!ok) {
          state.child.stdin.once('drain', () => undefined)
        }
      } catch (error) {
        this.finishWorkerJob(
          state,
          requestId,
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    })
  }

  runGenerate(text: string, output: string, timeoutMs = 3_600_000): Promise<void> {
    return this.processes.run(
      this.paths.voxCpm2PythonPath(),
      ['-c', VOXCPM2_GENERATE_SCRIPT, text, output],
      {
        cwd: this.paths.voxCpm2Root(),
        env: this.processEnv(),
        timeoutMs,
      },
    )
  }

  stop(reason = 'VOXCPM2_WORKER_STOPPED'): void {
    const state = this.worker
    if (!state) return
    this.worker = null
    this.rejectWorkerJobs(state, new Error(reason))
    if (!state.child.killed) state.child.kill('SIGTERM')
  }

  private processEnv(): NodeJS.ProcessEnv {
    const cacheDir = this.paths.voxCpm2CacheDir()
    return {
      ...process.env,
      HF_HOME: cacheDir,
      HUGGINGFACE_HUB_CACHE: join(cacheDir, 'hub'),
      TRANSFORMERS_CACHE: join(cacheDir, 'transformers'),
      PYTHONUNBUFFERED: '1',
    }
  }

  private emitProgress(sender: WebContents | undefined, payload: VoiceModelProgress): void {
    if (!sender || sender.isDestroyed()) return
    sender.send('desktop:pet:voiceModelProgress', payload)
  }

  private rejectWorkerJobs(state: VoxCpm2WorkerState, error: Error): void {
    for (const [requestId, job] of state.jobs) {
      clearTimeout(job.timer)
      job.reject(error)
      state.jobs.delete(requestId)
    }
  }

  private finishWorkerJob(state: VoxCpm2WorkerState, requestId: string, error?: Error): void {
    const job = state.jobs.get(requestId)
    if (!job) return
    clearTimeout(job.timer)
    state.jobs.delete(requestId)
    if (error) job.reject(error)
    else job.resolve(job.ok)
  }

  private handleWorkerEvent(state: VoxCpm2WorkerState, payload: Record<string, unknown>): void {
    const event = typeof payload.event === 'string' ? payload.event : ''
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    if (event === 'done') {
      this.finishWorkerJob(state, requestId)
      return
    }
    if (event === 'error') {
      this.finishWorkerJob(
        state,
        requestId,
        new Error(typeof payload.error === 'string' ? payload.error : 'VOXCPM2_WORKER_ERROR'),
      )
    }
  }
}

export class VoiceEngineService {
  private readonly paths: VoiceModelPathService
  private readonly processes: VoiceProcessService
  private readonly models: VoiceModelService
  private readonly voxCpm2: VoxCpm2WorkerService
  private activeAsr: ActiveAsrState | null = null
  private activeSpeechChild: ChildProcess | null = null
  private desktopSpeechGeneration = 0
  private recognizer: OnlineRecognizer | null = null
  private speechPlaybackQueue: SpeechPlaybackItem[] = []
  private speechPlaying = false
  private speechSynthesisQueue: SpeechQueueItem[] = []
  private speechSynthesizing = false
  private tts: OfflineTts | null = null

  constructor() {
    this.paths = new VoiceModelPathService()
    this.processes = new VoiceProcessService()
    this.models = new VoiceModelService(this.paths)
    this.voxCpm2 = new VoxCpm2WorkerService(this.paths, this.processes)
  }

  getStatus(): VoiceEngineStatus {
    const nativeAddonAvailable = this.models.isNativeAddonAvailable()
    const providers = this.createTtsProviderDefinitions(nativeAddonAvailable)
    const settings = desktopSettingsService.readSettingsSync()
    return {
      engine: 'sherpa-onnx-node',
      asrProvider: settings.asrProvider,
      ttsProvider: settings.ttsProvider,
      nativeAddonAvailable,
      modelRoot: this.paths.modelRoot(),
      asr: {
        installed: this.paths.hasModel(ASR_MODEL),
        name: ASR_MODEL.dir,
        sourceUrl: ASR_MODEL.url,
      },
      tts: {
        installed: providers['sherpa-local'].modelInstalled?.() ?? false,
        name: TTS_MODEL.dir,
        sourceUrl: TTS_MODEL.url,
      },
      ttsProviders: Object.fromEntries(
        TTS_PROVIDER_IDS.map((providerId) => [
          providerId,
          this.getTtsProviderStatus(providers[providerId]),
        ]),
      ) as Record<TtsProvider, TtsProviderStatus>,
    }
  }

  async prewarm(): Promise<boolean> {
    const nativeAddonAvailable = this.models.isNativeAddonAvailable()
    const providers = this.createTtsProviderDefinitions(nativeAddonAvailable)
    const configuredProvider = desktopSettingsService.readSettingsSync().ttsProvider
    try {
      if (configuredProvider === 'voxcpm2' && providers.voxcpm2.installed()) {
        await this.voxCpm2.ensureWorker()
        return true
      }
      if (configuredProvider === 'sherpa-local' && providers['sherpa-local'].installed()) {
        await this.getTts()
        return true
      }
      const fallback = LOCAL_TTS_FALLBACK_ORDER.find((providerId) =>
        providers[providerId].installed(),
      )
      if (fallback === 'voxcpm2') {
        await this.voxCpm2.ensureWorker()
        return true
      }
      if (fallback === 'sherpa-local') {
        await this.getTts()
        return true
      }
    } catch {
      return false
    }
    return configuredProvider === 'system'
  }

  async installVoiceModel(
    sender: WebContents,
    input: { provider?: TtsProvider },
  ): Promise<ReturnType<VoiceEngineService['getStatus']>> {
    const nativeAddonAvailable = this.models.isNativeAddonAvailable()
    const provider = input.provider
      ? this.createTtsProviderDefinitions(nativeAddonAvailable)[input.provider]
      : null
    await provider?.install?.(sender)
    return this.getStatus()
  }

  async asrStart(sender: WebContents): Promise<{ ok: true }> {
    const recognizer = await this.getRecognizer(sender)
    this.activeAsr = {
      sender,
      stream: recognizer.createStream(),
      segments: [],
      lastText: '',
    }
    return { ok: true }
  }

  asrAccept(input: { samples: ArrayBuffer; sampleRate: number }): { ok: true } {
    this.decodeAsrChunk(new Float32Array(input.samples), input.sampleRate)
    return { ok: true }
  }

  asrStop(): { text: string } {
    if (!this.activeAsr || !this.recognizer) return { text: '' }
    this.activeAsr.stream.inputFinished()
    while (this.recognizer.isReady(this.activeAsr.stream)) {
      this.recognizer.decode(this.activeAsr.stream)
    }
    const text = this.recognizer.getResult(this.activeAsr.stream).text?.trim()
    if (text) this.activeAsr.segments.push(text)
    const finalText = this.joinAsrSegments(this.activeAsr.segments)
    this.activeAsr = null
    return { text: finalText }
  }

  async speak(text: string, playback?: TtsPlaybackOptions): Promise<boolean> {
    const generation = playback?.generation ?? this.desktopSpeechGeneration
    const content = this.normalizeSpeechText(text)
    const chunks = this.splitTtsText(
      content,
      this.ttsChunkLimit(desktopSettingsService.readSettingsSync().ttsProvider),
    )
    if (!chunks.length) return false
    const results = await Promise.all(
      chunks.map((chunk) => this.enqueueDesktopSpeechSegment(chunk, generation)),
    )
    return results.some(Boolean)
  }

  cancelSpeech(): void {
    const hasActiveSpeech =
      this.speechSynthesizing ||
      this.speechPlaying ||
      this.speechSynthesisQueue.length > 0 ||
      this.speechPlaybackQueue.length > 0 ||
      Boolean(this.activeSpeechChild)
    this.desktopSpeechGeneration += 1
    if (hasActiveSpeech) this.voxCpm2.stop('VOICE_PLAYBACK_CANCELLED')
    while (this.speechSynthesisQueue.length) {
      this.speechSynthesisQueue.shift()?.resolve(false)
    }
    while (this.speechPlaybackQueue.length) {
      const item = this.speechPlaybackQueue.shift()
      if (!item) continue
      this.cleanupAudioClip(item.clip)
      item.resolve(false)
    }
    const child = this.activeSpeechChild
    this.activeSpeechChild = null
    if (child && !child.killed) child.kill('SIGTERM')
  }

  private async getRecognizer(progressSender?: WebContents): Promise<OnlineRecognizer> {
    await this.models.ensureAsrModel(progressSender)
    if (this.recognizer) return this.recognizer
    const sherpa = this.models.loadSherpa()
    const dir = this.paths.modelDir(ASR_MODEL)
    this.recognizer = new sherpa.OnlineRecognizer({
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: join(dir, 'encoder-epoch-99-avg-1.int8.onnx'),
          decoder: join(dir, 'decoder-epoch-99-avg-1.onnx'),
          joiner: join(dir, 'joiner-epoch-99-avg-1.int8.onnx'),
        },
        tokens: join(dir, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
      },
      decodingMethod: 'greedy_search',
      maxActivePaths: 4,
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
    })
    return this.recognizer
  }

  private async getTts(): Promise<OfflineTts> {
    await this.models.ensureTtsModel()
    if (this.tts) return this.tts
    const sherpa = this.models.loadSherpa()
    const dir = this.paths.modelDir(TTS_MODEL)
    this.tts = await sherpa.OfflineTts.createAsync({
      model: {
        vits: {
          model: join(dir, 'model.onnx'),
          tokens: join(dir, 'tokens.txt'),
          lexicon: join(dir, 'lexicon.txt'),
        },
        debug: false,
        numThreads: 1,
        provider: 'cpu',
      },
      maxNumSentences: 1,
      ruleFsts: ['date.fst', 'phone.fst', 'number.fst']
        .map((file) => join(dir, file))
        .filter(existsSync)
        .join(','),
    })
    return this.tts
  }

  private emitAsrPartial(): void {
    if (!this.activeAsr || this.activeAsr.sender.isDestroyed()) return
    const text = this.joinAsrSegments([...this.activeAsr.segments, this.activeAsr.lastText])
    this.activeAsr.sender.send('desktop:pet:asrPartial', { text })
  }

  private joinAsrSegments(segments: string[]): string {
    let out = ''
    for (const raw of segments) {
      const segment = raw.trim()
      if (!segment) continue
      const needsSpace = /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(segment)
      out = `${out}${needsSpace ? ' ' : ''}${segment}`
    }
    return out.trim()
  }

  private decodeAsrChunk(samples: Float32Array, sampleRate: number): void {
    if (!this.activeAsr || !this.recognizer) return
    this.activeAsr.stream.acceptWaveform({ samples, sampleRate })
    while (this.recognizer.isReady(this.activeAsr.stream)) {
      this.recognizer.decode(this.activeAsr.stream)
    }
    const isEndpoint = this.recognizer.isEndpoint(this.activeAsr.stream)
    let text = this.recognizer.getResult(this.activeAsr.stream).text?.trim() ?? ''
    if (isEndpoint) {
      const tailPadding = new Float32Array(6400)
      this.activeAsr.stream.acceptWaveform({ samples: tailPadding, sampleRate: 16000 })
      while (this.recognizer.isReady(this.activeAsr.stream)) {
        this.recognizer.decode(this.activeAsr.stream)
      }
      text = this.recognizer.getResult(this.activeAsr.stream).text?.trim() ?? text
    }
    if (text && text !== this.activeAsr.lastText) {
      this.activeAsr.lastText = text
      this.emitAsrPartial()
    }
    if (isEndpoint) {
      if (text) this.activeAsr.segments.push(text)
      this.activeAsr.lastText = ''
      this.recognizer.reset(this.activeAsr.stream)
      this.emitAsrPartial()
    }
  }

  private createTtsProviderDefinitions(
    nativeAddonAvailable: boolean,
  ): Record<TtsProvider, TtsProviderDefinition> {
    const sherpaTtsInstalled = this.paths.hasModel(TTS_MODEL)
    const mossRuntimeInstalled = this.paths.hasMossRuntime()
    const mossModelInstalled = this.paths.hasMossModel()
    const voxCpm2RuntimeInstalled = this.voxCpm2.hasRuntime()
    const voxCpm2ModelInstalled = this.voxCpm2.hasModel()

    return {
      system: {
        id: 'system',
        installed: () => true,
        runtimeInstalled: () => true,
        modelInstalled: () => true,
        name: 'System Voice',
        sourceUrl: 'macos:say',
        synthesize: (text, options) => this.synthesizeSystemTts(text, options),
      },
      'moss-tts-nano': {
        id: 'moss-tts-nano',
        installed: () => mossRuntimeInstalled && mossModelInstalled,
        runtimeInstalled: () => mossRuntimeInstalled,
        modelInstalled: () => mossModelInstalled,
        name: 'MOSS-TTS-Nano ONNX',
        sourceUrl: MOSS_TTS_REPO,
        install: (progressSender) => this.installMossTts(progressSender),
        synthesize: (text, options) => this.synthesizeWithMossTts(text, options),
      },
      'sherpa-local': {
        id: 'sherpa-local',
        installed: () => nativeAddonAvailable && sherpaTtsInstalled,
        runtimeInstalled: () => nativeAddonAvailable,
        modelInstalled: () => sherpaTtsInstalled,
        name: TTS_MODEL.dir,
        sourceUrl: TTS_MODEL.url,
        install: (progressSender) => this.models.ensureTtsModel(progressSender),
        synthesize: (text, options) => this.synthesizeWithLocalTts(text, options),
      },
      voxcpm2: {
        id: 'voxcpm2',
        installed: () => voxCpm2RuntimeInstalled && voxCpm2ModelInstalled,
        runtimeInstalled: () => voxCpm2RuntimeInstalled,
        modelInstalled: () => voxCpm2ModelInstalled,
        name: 'VoxCPM2',
        sourceUrl: VOXCPM2_SOURCE_URL,
        install: (progressSender) => this.voxCpm2.install(progressSender),
        synthesize: (text, options) => this.synthesizeWithVoxCpm2Tts(text, options),
      },
    }
  }

  private getTtsProviderStatus(provider: TtsProviderDefinition): TtsProviderStatus {
    return {
      installed: provider.installed(),
      runtimeInstalled: provider.runtimeInstalled?.(),
      modelInstalled: provider.modelInstalled?.(),
      name: provider.name,
      sourceUrl: provider.sourceUrl,
    }
  }

  private async installMossTts(progressSender?: WebContents): Promise<void> {
    mkdirSync(this.paths.mossRoot(), { recursive: true })
    const repoDir = this.paths.mossRepoDir()
    if (!existsSync(join(repoDir, 'moss_tts_nano', 'cli.py'))) {
      await this.processes.run('git', ['clone', '--depth', '1', MOSS_TTS_REPO, repoDir], {
        timeoutMs: 300_000,
      })
    }
    if (!existsSync(this.paths.mossPythonPath())) {
      await this.processes.run(
        process.env.SHADOW_MOSS_PYTHON || 'python3',
        ['-m', 'venv', join(this.paths.mossRoot(), '.venv')],
        { timeoutMs: 300_000 },
      )
    }
    await this.processes.run(
      this.paths.mossPythonPath(),
      ['-m', 'pip', 'install', '--upgrade', 'pip'],
      { timeoutMs: 300_000 },
    )
    await this.processes.run(
      this.paths.mossPythonPath(),
      ['-m', 'pip', 'install', '-e', repoDir, 'huggingface_hub>=0.23.0'],
      { timeoutMs: 1_800_000 },
    )
    this.emitModelProgress(progressSender, { key: 'tts', phase: 'download', percent: 90 })
    const warmupFile = join(app.getPath('temp'), `shadow-pet-moss-install-${Date.now()}.wav`)
    await this.runMossCli([
      'generate',
      '--backend',
      'onnx',
      '--text',
      MOSS_TTS_TEST_TEXT,
      '--voice',
      MOSS_TTS_CHILD_VOICE,
      '--output',
      warmupFile,
      '--max-new-frames',
      '16',
      '--cpu-threads',
      '2',
      '--sample-mode',
      'greedy',
    ])
    rmSync(warmupFile, { force: true })
    if (!this.paths.hasMossModel()) throw new Error('MOSS_TTS_MODEL_INCOMPLETE')
    this.emitModelProgress(progressSender, { key: 'tts', phase: 'ready', percent: 100 })
  }

  private runMossCli(args: string[], timeoutMs = 900_000): Promise<void> {
    return this.processes.run(
      this.paths.mossPythonPath(),
      ['-c', 'from moss_tts_nano.cli import main; raise SystemExit(main())', ...args],
      {
        cwd: this.paths.mossRepoDir(),
        env: this.processEnvForMoss(),
        timeoutMs,
      },
    )
  }

  private processEnvForMoss(): NodeJS.ProcessEnv {
    const repoDir = this.paths.mossRepoDir()
    return {
      ...process.env,
      PYTHONPATH: [repoDir, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
    }
  }

  private emitModelProgress(sender: WebContents | undefined, payload: VoiceModelProgress): void {
    if (!sender || sender.isDestroyed()) return
    sender.send('desktop:pet:voiceModelProgress', payload)
  }

  private async synthesizeWithLocalTts(
    text: string,
    options: TtsPlaybackOptions,
  ): Promise<TtsAudioClip | null> {
    const content = this.normalizeSherpaTtsText(text)
    if (!content) return null
    if (process.platform !== 'darwin') return null
    if (!this.isSpeechGenerationCurrent(options.generation)) return null
    try {
      const sherpa = this.models.loadSherpa()
      const engine = await this.getTts()
      const sid = this.pickSherpaPetVoiceSid(engine.numSpeakers)
      const generationConfig = new sherpa.GenerationConfig({
        sid,
        speed: 1.04,
        silenceScale: 0.16,
      })
      const audio = await engine.generateAsync({
        text: content,
        sid,
        speed: 1.04,
        enableExternalBuffer: false,
        generationConfig,
      })
      if (!this.isSpeechGenerationCurrent(options.generation)) return null
      const filename = this.paths.tempAudioPath('shadow-pet-sherpa-tts')
      sherpa.writeWave(filename, audio)
      return this.audioFileClip(filename)
    } catch {
      return null
    }
  }

  private async synthesizeWithMossTts(
    text: string,
    options: TtsPlaybackOptions,
  ): Promise<TtsAudioClip | null> {
    const content = this.normalizeSpeechText(text)
    if (!content || !this.paths.hasMossRuntime() || !this.paths.hasMossModel()) return null
    if (!this.isSpeechGenerationCurrent(options.generation)) return null
    try {
      const filename = this.paths.tempAudioPath('shadow-pet-moss-tts')
      await this.runMossCli([
        'generate',
        '--backend',
        'onnx',
        '--text',
        content,
        '--voice',
        MOSS_TTS_CHILD_VOICE,
        '--output',
        filename,
        '--cpu-threads',
        '2',
        '--sample-mode',
        'fixed',
      ])
      if (!this.isSpeechGenerationCurrent(options.generation)) {
        rmSync(filename, { force: true })
        return null
      }
      return this.audioFileClip(filename)
    } catch {
      return null
    }
  }

  private async synthesizeWithVoxCpm2Tts(
    text: string,
    options: TtsPlaybackOptions,
  ): Promise<TtsAudioClip | null> {
    const content = this.normalizeSpeechText(text)
    if (!content || !this.voxCpm2.hasRuntime() || !this.voxCpm2.hasModel()) return null
    if (process.platform !== 'darwin') return null
    if (!this.isSpeechGenerationCurrent(options.generation)) return null
    try {
      const filename = this.paths.tempAudioPath('shadow-pet-voxcpm2-tts')
      await this.voxCpm2
        .runWorkerGenerate(this.toVoxCpm2PetVoicePrompt(content), filename)
        .catch(() => this.voxCpm2.runGenerate(this.toVoxCpm2PetVoicePrompt(content), filename))
      if (!this.isSpeechGenerationCurrent(options.generation)) {
        rmSync(filename, { force: true })
        return null
      }
      return this.audioFileClip(filename)
    } catch {
      return null
    }
  }

  private async synthesizeSystemTts(
    text: string,
    options: TtsPlaybackOptions,
  ): Promise<TtsAudioClip | null> {
    const content = this.normalizeSpeechText(text)
    if (!content) return null
    if (process.platform !== 'darwin') return null
    if (!this.isSpeechGenerationCurrent(options.generation)) return null
    const preferredVoice = /[\u3400-\u9fff]/u.test(content) ? 'Tingting' : 'Junior'
    const filename = this.paths.tempAudioPath('shadow-pet-system-tts', 'aiff')
    const ok =
      (await this.processes.runMacSay(['-v', preferredVoice, '-o', filename, content])) ||
      (await this.processes.runMacSay(['-o', filename, content]))
    if (!ok || !this.isSpeechGenerationCurrent(options.generation)) {
      rmSync(filename, { force: true })
      return null
    }
    return this.audioFileClip(filename)
  }

  private ttsChunkLimit(provider: TtsProvider): number {
    return provider === 'sherpa-local' ? SHERPA_TTS_CHUNK_CHAR_LIMIT : DEFAULT_TTS_CHUNK_CHAR_LIMIT
  }

  private enqueueDesktopSpeechSegment(text: string, generation: number): Promise<boolean> {
    if (!this.isSpeechGenerationCurrent(generation)) return Promise.resolve(false)
    return new Promise((resolve) => {
      this.speechSynthesisQueue.push({ generation, resolve, text })
      this.pumpDesktopSpeechSynthesis()
    })
  }

  private pumpDesktopSpeechSynthesis(): void {
    if (this.speechSynthesizing) return
    this.speechSynthesizing = true
    void (async () => {
      try {
        while (this.speechSynthesisQueue.length) {
          const item = this.speechSynthesisQueue.shift()
          if (!item) continue
          if (!this.isSpeechGenerationCurrent(item.generation)) {
            item.resolve(false)
            continue
          }
          const clip = await this.synthesizeDesktopSpeechClip(item.text, item.generation)
          if (!clip || !this.isSpeechGenerationCurrent(item.generation)) {
            this.cleanupAudioClip(clip)
            item.resolve(false)
            continue
          }
          this.speechPlaybackQueue.push({
            clip,
            generation: item.generation,
            resolve: item.resolve,
          })
          this.pumpDesktopSpeechPlayback()
        }
      } finally {
        this.speechSynthesizing = false
      }
    })()
  }

  private pumpDesktopSpeechPlayback(): void {
    if (this.speechPlaying) return
    this.speechPlaying = true
    void (async () => {
      try {
        while (this.speechPlaybackQueue.length) {
          const item = this.speechPlaybackQueue.shift()
          if (!item) continue
          if (!this.isSpeechGenerationCurrent(item.generation)) {
            this.cleanupAudioClip(item.clip)
            item.resolve(false)
            continue
          }
          try {
            await this.playAudioFile(item.clip.filename, item.generation)
            item.resolve(this.isSpeechGenerationCurrent(item.generation))
          } catch {
            item.resolve(false)
          } finally {
            this.cleanupAudioClip(item.clip)
          }
        }
      } finally {
        this.speechPlaying = false
      }
    })()
  }

  private async synthesizeDesktopSpeechClip(
    text: string,
    generation: number,
  ): Promise<TtsAudioClip | null> {
    const nativeAddonAvailable = this.models.isNativeAddonAvailable()
    const providers = this.createTtsProviderDefinitions(nativeAddonAvailable)
    const configuredProvider = desktopSettingsService.readSettingsSync().ttsProvider
    const options = { generation }
    for (const providerId of this.ttsSynthesisOrder(configuredProvider, providers)) {
      if (!this.isSpeechGenerationCurrent(generation)) return null
      const provider = providers[providerId]
      if (providerId !== 'system' && !provider.installed()) continue
      const clip = await provider.synthesize(text, options)
      if (clip) return clip
    }
    return null
  }

  private ttsSynthesisOrder(
    configuredProvider: TtsProvider,
    providers: Record<TtsProvider, TtsProviderDefinition>,
  ): TtsProvider[] {
    const order: TtsProvider[] = [configuredProvider]
    if (configuredProvider !== 'system') order.push(...LOCAL_TTS_FALLBACK_ORDER)
    else {
      order.push(
        ...LOCAL_TTS_FALLBACK_ORDER.filter((providerId) => providers[providerId].installed()),
      )
    }
    order.push('system')
    return Array.from(new Set(order))
  }

  private normalizeSpeechText(text: string): string {
    let content = text
    let previous = ''
    while (content !== previous) {
      previous = content
      content = content
        .replace(/\([^()]*\)/g, '')
        .replace(/（[^（）]*）/g, '')
        .replace(/\[[^\[\]]*\]/g, '')
        .replace(/【[^【】]*】/g, '')
    }
    return content
      .replace(/\*\*/g, '')
      .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  private normalizeSherpaTtsText(text: string): string {
    const content = this.normalizeSpeechText(text)
      .replace(/[“”„‟]/g, '')
      .replace(/[‘’‚‛]/g, '')
      .replace(/[A-Za-z]+(?:[._/+:-]?[A-Za-z0-9]+)*/g, '')
      .replace(/[^\u3400-\u9fff0-9，。！？、；：,.!? \n-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return /[\u3400-\u9fff]/u.test(content) ? content : ''
  }

  private splitTtsText(text: string, limit = DEFAULT_TTS_CHUNK_CHAR_LIMIT): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    const chunks: string[] = []
    let current = ''
    const segments = normalized.match(/[^。！？.!?；;]+[。！？.!?；;]?|[。！？.!?；;]/g) ?? [
      normalized,
    ]
    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed) continue
      if (current && current.length + trimmed.length <= limit) {
        current += trimmed
        continue
      }
      if (current) chunks.push(current)
      if (trimmed.length <= limit) {
        current = trimmed
        continue
      }
      for (let index = 0; index < trimmed.length; index += limit) {
        chunks.push(trimmed.slice(index, index + limit))
      }
      current = ''
    }
    if (current) chunks.push(current)
    return chunks
  }

  private pickSherpaPetVoiceSid(numSpeakers: number | undefined): number {
    if (!Number.isFinite(numSpeakers) || Number(numSpeakers) <= 1) return 0
    return Math.min(2, Math.max(0, Number(numSpeakers) - 1))
  }

  private toVoxCpm2PetVoicePrompt(text: string): string {
    if (/[\u3400-\u9fff]/u.test(text)) {
      return `(清亮、温柔、孩子气的可爱童声，语气轻快自然)${text}`
    }
    return `(A gentle, bright, childlike pet voice, soft and natural)${text}`
  }

  private isSpeechGenerationCurrent(generation: number | undefined): boolean {
    return generation === undefined || generation === this.desktopSpeechGeneration
  }

  private cleanupAudioClip(clip: TtsAudioClip | null | undefined): void {
    try {
      clip?.cleanup?.()
    } catch {
      // Temp audio cleanup is best-effort.
    }
  }

  private trackActiveSpeechChild(child: ChildProcess): void {
    this.activeSpeechChild = child
    const clear = () => {
      if (this.activeSpeechChild === child) this.activeSpeechChild = null
    }
    child.once('exit', clear)
    child.once('error', clear)
  }

  private playAudioFile(filename: string, generation?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSpeechGenerationCurrent(generation)) {
        resolve()
        return
      }
      const child = spawn('afplay', [filename], { stdio: 'ignore' })
      this.trackActiveSpeechChild(child)
      child.on('error', (error) => {
        if (!this.isSpeechGenerationCurrent(generation)) {
          resolve()
          return
        }
        reject(error)
      })
      child.on('exit', (code) => {
        if (!this.isSpeechGenerationCurrent(generation) || code === 0) {
          resolve()
          return
        }
        reject(new Error(`VOICE_PLAYBACK_FAILED_${code}`))
      })
    })
  }

  private audioFileClip(filename: string): TtsAudioClip {
    return {
      cleanup: () => rmSync(filename, { force: true }),
      filename,
    }
  }
}
