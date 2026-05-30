import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, ipcMain, net, type WebContents } from 'electron'
import { readDesktopSettings } from './desktop-settings'

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

type TtsProvider = 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'

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
const MOSS_TTS_TEST_TEXT = '你好，我是小豆。'
const VOXCPM2_SOURCE_URL = 'https://github.com/OpenBMB/VoxCPM'
const VOXCPM2_MODEL_ID = 'openbmb/VoxCPM2'
const VOXCPM2_RUNTIME_DIR = 'voxcpm2'
const VOXCPM2_TEST_TEXT = '你好，我是小豆。'
const ENABLE_LOCAL_TTS = false
const TTS_PROVIDER_IDS: TtsProvider[] = ['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2']
const DEFAULT_TTS_CHUNK_CHAR_LIMIT = 140
const SHERPA_TTS_CHUNK_CHAR_LIMIT = 90

let sherpaModule: SherpaOnnx | null = null
let recognizer: OnlineRecognizer | null = null
let tts: OfflineTts | null = null
let modelDownloadPromise: Promise<void> | null = null
let voxCpm2Worker: VoxCpm2WorkerState | null = null
let desktopSpeechGeneration = 0
let speechSynthesizing = false
let speechPlaying = false
let activeSpeechChild: ChildProcess | null = null
const speechSynthesisQueue: SpeechQueueItem[] = []
const speechPlaybackQueue: SpeechPlaybackItem[] = []
let activeAsr: {
  sender: WebContents
  stream: OnlineStream
  segments: string[]
  lastText: string
} | null = null

function loadSherpa(): SherpaOnnx {
  if (!sherpaModule) {
    sherpaModule = requireNative('sherpa-onnx-node') as SherpaOnnx
  }
  return sherpaModule
}

function voiceModelRoot() {
  return join(app.getPath('userData'), 'voice-models')
}

function modelDir(model: VoiceModelDefinition) {
  return join(voiceModelRoot(), model.dir)
}

function hasModel(model: VoiceModelDefinition) {
  const dir = modelDir(model)
  return model.requiredFiles.every((file) => existsSync(join(dir, file)))
}

function mossRoot() {
  return join(voiceModelRoot(), MOSS_TTS_RUNTIME_DIR)
}

function mossRepoDir() {
  return join(mossRoot(), MOSS_TTS_REPO_DIR)
}

function mossPythonPath() {
  return process.platform === 'win32'
    ? join(mossRoot(), '.venv', 'Scripts', 'python.exe')
    : join(mossRoot(), '.venv', 'bin', 'python')
}

function mossModelDir() {
  return join(mossRepoDir(), 'models')
}

function hasMossRuntime() {
  return existsSync(mossPythonPath()) && existsSync(join(mossRepoDir(), 'moss_tts_nano', 'cli.py'))
}

function hasMossModel() {
  const root = mossModelDir()
  return (
    existsSync(join(root, 'browser_poc_manifest.json')) ||
    existsSync(join(root, 'MOSS-TTS-Nano-100M-ONNX', 'browser_poc_manifest.json')) ||
    existsSync(join(root, 'MOSS-TTS-Nano-ONNX-CPU', 'browser_poc_manifest.json'))
  )
}

function voxCpm2Root() {
  return join(voiceModelRoot(), VOXCPM2_RUNTIME_DIR)
}

function voxCpm2PythonPath() {
  return process.platform === 'win32'
    ? join(voxCpm2Root(), '.venv', 'Scripts', 'python.exe')
    : join(voxCpm2Root(), '.venv', 'bin', 'python')
}

function voxCpm2CacheDir() {
  return join(voxCpm2Root(), 'hf-cache')
}

function voxCpm2MarkerPath() {
  return join(voxCpm2Root(), 'model-ready.json')
}

function hasVoxCpm2Runtime() {
  return existsSync(voxCpm2PythonPath())
}

function hasVoxCpm2Model() {
  const hubDir = join(voxCpm2CacheDir(), 'hub')
  const modelCacheDir = join(hubDir, 'models--openbmb--VoxCPM2')
  return existsSync(hubDir) && (existsSync(voxCpm2MarkerPath()) || existsSync(modelCacheDir))
}

function processEnvForMoss(): NodeJS.ProcessEnv {
  const repoDir = mossRepoDir()
  return {
    ...process.env,
    PYTHONPATH: [repoDir, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  }
}

function processEnvForVoxCpm2(): NodeJS.ProcessEnv {
  const cacheDir = voxCpm2CacheDir()
  return {
    ...process.env,
    HF_HOME: cacheDir,
    HUGGINGFACE_HUB_CACHE: join(cacheDir, 'hub'),
    TRANSFORMERS_CACHE: join(cacheDir, 'transformers'),
    PYTHONUNBUFFERED: '1',
  }
}

function runProcess(
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

function emitModelProgress(sender: WebContents | undefined, payload: VoiceModelProgress): void {
  if (!sender || sender.isDestroyed()) return
  sender.send('desktop:pet:voiceModelProgress', payload)
}

async function downloadModel(
  model: VoiceModelDefinition,
  progressSender?: WebContents,
): Promise<void> {
  if (hasModel(model)) return
  mkdirSync(voiceModelRoot(), { recursive: true })
  const archivePath = join(voiceModelRoot(), `${model.dir}.tar.bz2`)
  const response = await net.fetch(model.url)
  if (!response.ok || !response.body) {
    throw new Error(`VOICE_MODEL_DOWNLOAD_FAILED_${model.key}_${response.status}`)
  }
  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  let receivedBytes = 0
  let lastProgressAt = 0
  emitModelProgress(progressSender, {
    key: model.key,
    phase: 'download',
    receivedBytes,
    totalBytes: totalBytes || undefined,
    percent: totalBytes ? 0 : undefined,
  })
  const progressStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength
      const now = Date.now()
      if (now - lastProgressAt > 250) {
        lastProgressAt = now
        emitModelProgress(progressSender, {
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
  emitModelProgress(progressSender, {
    key: model.key,
    phase: 'extract',
    receivedBytes,
    totalBytes: totalBytes || undefined,
    percent: 99,
  })
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xjf', archivePath, '-C', voiceModelRoot()], {
      stdio: 'ignore',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`VOICE_MODEL_EXTRACT_FAILED_${model.key}_${code}`))
    })
  })
  rmSync(archivePath, { force: true })
  if (!hasModel(model)) throw new Error(`VOICE_MODEL_INCOMPLETE_${model.key}`)
  emitModelProgress(progressSender, {
    key: model.key,
    phase: 'ready',
    receivedBytes,
    totalBytes: totalBytes || undefined,
    percent: 100,
  })
}

async function ensureAsrModel(progressSender?: WebContents) {
  if (modelDownloadPromise) await modelDownloadPromise
  if (hasModel(ASR_MODEL)) return
  modelDownloadPromise = downloadModel(ASR_MODEL, progressSender).finally(() => {
    modelDownloadPromise = null
  })
  await modelDownloadPromise
}

async function ensureTtsModel() {
  if (hasModel(TTS_MODEL)) return
  await downloadModel(TTS_MODEL)
}

async function runMossCli(args: string[], timeoutMs = 900_000) {
  await runProcess(
    mossPythonPath(),
    ['-c', 'from moss_tts_nano.cli import main; raise SystemExit(main())', ...args],
    {
      cwd: mossRepoDir(),
      env: processEnvForMoss(),
      timeoutMs,
    },
  )
}

async function installMossTts(progressSender?: WebContents) {
  mkdirSync(mossRoot(), { recursive: true })
  const repoDir = mossRepoDir()
  if (!existsSync(join(repoDir, 'moss_tts_nano', 'cli.py'))) {
    await runProcess('git', ['clone', '--depth', '1', MOSS_TTS_REPO, repoDir], {
      timeoutMs: 300_000,
    })
  }
  if (!existsSync(mossPythonPath())) {
    await runProcess(
      process.env.SHADOW_MOSS_PYTHON || 'python3',
      ['-m', 'venv', join(mossRoot(), '.venv')],
      {
        timeoutMs: 300_000,
      },
    )
  }
  await runProcess(mossPythonPath(), ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    timeoutMs: 300_000,
  })
  await runProcess(
    mossPythonPath(),
    ['-m', 'pip', 'install', '-e', repoDir, 'huggingface_hub>=0.23.0'],
    {
      timeoutMs: 1_800_000,
    },
  )
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'download',
    percent: 90,
  })
  const warmupFile = join(app.getPath('temp'), `shadow-pet-moss-install-${Date.now()}.wav`)
  await runMossCli([
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
  if (!hasMossModel()) throw new Error('MOSS_TTS_MODEL_INCOMPLETE')
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'ready',
    percent: 100,
  })
}

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

async function runVoxCpm2Generate(text: string, output: string, timeoutMs = 3_600_000) {
  await runProcess(voxCpm2PythonPath(), ['-c', VOXCPM2_GENERATE_SCRIPT, text, output], {
    cwd: voxCpm2Root(),
    env: processEnvForVoxCpm2(),
    timeoutMs,
  })
}

function rejectVoxCpm2WorkerJobs(state: VoxCpm2WorkerState, error: Error) {
  for (const [requestId, job] of state.jobs) {
    clearTimeout(job.timer)
    job.reject(error)
    state.jobs.delete(requestId)
  }
}

function stopVoxCpm2Worker(reason = 'VOXCPM2_WORKER_STOPPED') {
  const state = voxCpm2Worker
  if (!state) return
  voxCpm2Worker = null
  rejectVoxCpm2WorkerJobs(state, new Error(reason))
  if (!state.child.killed) state.child.kill('SIGTERM')
}

function finishVoxCpm2WorkerJob(state: VoxCpm2WorkerState, requestId: string, error?: Error) {
  const job = state.jobs.get(requestId)
  if (!job) return
  clearTimeout(job.timer)
  state.jobs.delete(requestId)
  if (error) job.reject(error)
  else job.resolve(job.ok)
}

function handleVoxCpm2WorkerEvent(state: VoxCpm2WorkerState, payload: Record<string, unknown>) {
  const event = typeof payload.event === 'string' ? payload.event : ''
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  if (event === 'done') {
    finishVoxCpm2WorkerJob(state, requestId)
    return
  }
  if (event === 'error') {
    finishVoxCpm2WorkerJob(
      state,
      requestId,
      new Error(typeof payload.error === 'string' ? payload.error : 'VOXCPM2_WORKER_ERROR'),
    )
  }
}

function ensureVoxCpm2Worker(): Promise<VoxCpm2WorkerState> {
  if (voxCpm2Worker && !voxCpm2Worker.child.killed) {
    return voxCpm2Worker.ready.then(() => voxCpm2Worker as VoxCpm2WorkerState)
  }

  const child = spawn(voxCpm2PythonPath(), ['-c', VOXCPM2_WORKER_SCRIPT], {
    cwd: voxCpm2Root(),
    env: processEnvForVoxCpm2(),
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
  voxCpm2Worker = state

  const handleLine = (line: string) => {
    if (!line.trim()) return
    try {
      const payload = JSON.parse(line) as Record<string, unknown>
      if (payload.event === 'ready') {
        resolveReady()
        return
      }
      handleVoxCpm2WorkerEvent(state, payload)
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
    rejectVoxCpm2WorkerJobs(state, error)
    if (voxCpm2Worker === state) voxCpm2Worker = null
  })
  child.on('exit', (code) => {
    const error = new Error(state.stderrTail.trim() || `VOXCPM2_WORKER_EXITED_${code}`)
    rejectReady(error)
    rejectVoxCpm2WorkerJobs(state, error)
    if (voxCpm2Worker === state) voxCpm2Worker = null
  })

  return ready.then(() => state)
}

async function runVoxCpm2WorkerGenerate(
  text: string,
  output: string,
  timeoutMs = 3_600_000,
): Promise<boolean> {
  const state = await ensureVoxCpm2Worker()
  return new Promise((resolve, reject) => {
    const requestId = `voxcpm2-file-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timer = setTimeout(() => {
      finishVoxCpm2WorkerJob(state, requestId, new Error('VOICE_COMMAND_TIMEOUT_voxcpm2_file'))
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
      finishVoxCpm2WorkerJob(
        state,
        requestId,
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  })
}

async function installVoxCpm2Tts(progressSender?: WebContents) {
  mkdirSync(voxCpm2Root(), { recursive: true })
  mkdirSync(voxCpm2CacheDir(), { recursive: true })
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'download',
    percent: 10,
  })
  if (!existsSync(voxCpm2PythonPath())) {
    await runProcess(
      process.env.SHADOW_VOXCPM2_PYTHON || 'python3',
      ['-m', 'venv', join(voxCpm2Root(), '.venv')],
      {
        timeoutMs: 300_000,
      },
    )
  }
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'download',
    percent: 25,
  })
  await runProcess(voxCpm2PythonPath(), ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    timeoutMs: 300_000,
  })
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'download',
    percent: 45,
  })
  await runProcess(voxCpm2PythonPath(), ['-m', 'pip', 'install', 'voxcpm', 'soundfile'], {
    env: processEnvForVoxCpm2(),
    timeoutMs: 1_800_000,
  })
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'download',
    percent: 80,
  })
  const warmupFile = join(app.getPath('temp'), `shadow-pet-voxcpm2-install-${Date.now()}.wav`)
  await runVoxCpm2Generate(VOXCPM2_TEST_TEXT, warmupFile)
  rmSync(warmupFile, { force: true })
  writeFileSync(
    voxCpm2MarkerPath(),
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
  if (!hasVoxCpm2Model()) throw new Error('VOXCPM2_MODEL_INCOMPLETE')
  emitModelProgress(progressSender, {
    key: 'tts',
    phase: 'ready',
    percent: 100,
  })
}

async function getRecognizer(progressSender?: WebContents) {
  await ensureAsrModel(progressSender)
  if (recognizer) return recognizer
  const sherpa = loadSherpa()
  const dir = modelDir(ASR_MODEL)
  recognizer = new sherpa.OnlineRecognizer({
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
  return recognizer
}

async function getTts() {
  await ensureTtsModel()
  if (tts) return tts
  const sherpa = loadSherpa()
  const dir = modelDir(TTS_MODEL)
  tts = await sherpa.OfflineTts.createAsync({
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
  return tts
}

function emitAsrPartial() {
  if (!activeAsr || activeAsr.sender.isDestroyed()) return
  const text = [...activeAsr.segments, activeAsr.lastText].join('').trim()
  activeAsr.sender.send('desktop:pet:asrPartial', { text })
}

function decodeAsrChunk(samples: Float32Array, sampleRate: number) {
  if (!activeAsr || !recognizer) return
  activeAsr.stream.acceptWaveform({ samples, sampleRate })
  while (recognizer.isReady(activeAsr.stream)) {
    recognizer.decode(activeAsr.stream)
  }
  const isEndpoint = recognizer.isEndpoint(activeAsr.stream)
  let text = recognizer.getResult(activeAsr.stream).text?.trim() ?? ''
  if (isEndpoint) {
    const tailPadding = new Float32Array(6400)
    activeAsr.stream.acceptWaveform({ samples: tailPadding, sampleRate: 16000 })
    while (recognizer.isReady(activeAsr.stream)) {
      recognizer.decode(activeAsr.stream)
    }
    text = recognizer.getResult(activeAsr.stream).text?.trim() ?? text
  }
  if (text && text !== activeAsr.lastText) {
    activeAsr.lastText = text
    emitAsrPartial()
  }
  if (isEndpoint) {
    if (text) activeAsr.segments.push(text)
    activeAsr.lastText = ''
    recognizer.reset(activeAsr.stream)
    emitAsrPartial()
  }
}

function pickSherpaPetVoiceSid(numSpeakers: number | undefined): number {
  if (!Number.isFinite(numSpeakers) || Number(numSpeakers) <= 1) return 0
  return Math.min(2, Math.max(0, Number(numSpeakers) - 1))
}

async function synthesizeWithLocalTts(
  text: string,
  options: TtsPlaybackOptions,
): Promise<TtsAudioClip | null> {
  const content = normalizeSherpaTtsText(text)
  if (!content) return null
  if (process.platform !== 'darwin') return null
  if (!isSpeechGenerationCurrent(options.generation)) return null
  try {
    const sherpa = loadSherpa()
    const engine = await getTts()
    const sid = pickSherpaPetVoiceSid(engine.numSpeakers)
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
    if (!isSpeechGenerationCurrent(options.generation)) return null
    const filename = makeTempAudioPath('shadow-pet-sherpa-tts')
    sherpa.writeWave(filename, audio)
    return audioFileClip(filename)
  } catch {
    return null
  }
}

async function synthesizeWithMossTts(
  text: string,
  options: TtsPlaybackOptions,
): Promise<TtsAudioClip | null> {
  const content = normalizeSpeechText(text)
  if (!content || !hasMossRuntime() || !hasMossModel()) return null
  if (!isSpeechGenerationCurrent(options.generation)) return null
  try {
    const filename = makeTempAudioPath('shadow-pet-moss-tts')
    await runMossCli([
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
    if (!isSpeechGenerationCurrent(options.generation)) {
      rmSync(filename, { force: true })
      return null
    }
    return audioFileClip(filename)
  } catch {
    return null
  }
}

async function synthesizeWithVoxCpm2Tts(
  text: string,
  options: TtsPlaybackOptions,
): Promise<TtsAudioClip | null> {
  const content = normalizeSpeechText(text)
  if (!content || !hasVoxCpm2Runtime() || !hasVoxCpm2Model()) return null
  if (process.platform !== 'darwin') return null
  if (!isSpeechGenerationCurrent(options.generation)) return null
  try {
    const filename = makeTempAudioPath('shadow-pet-voxcpm2-tts')
    await runVoxCpm2WorkerGenerate(toVoxCpm2PetVoicePrompt(content), filename).catch(() =>
      runVoxCpm2Generate(toVoxCpm2PetVoicePrompt(content), filename),
    )
    if (!isSpeechGenerationCurrent(options.generation)) {
      rmSync(filename, { force: true })
      return null
    }
    return audioFileClip(filename)
  } catch {
    return null
  }
}

function normalizeSpeechText(text: string): string {
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

function normalizeSherpaTtsText(text: string): string {
  const content = normalizeSpeechText(text)
    .replace(/[“”„‟]/g, '')
    .replace(/[‘’‚‛]/g, '')
    .replace(/[A-Za-z]+(?:[._/+:-]?[A-Za-z0-9]+)*/g, '')
    .replace(/[^\u3400-\u9fff0-9，。！？、；：,.!? \n-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return /[\u3400-\u9fff]/u.test(content) ? content : ''
}

function splitTtsText(text: string, limit = DEFAULT_TTS_CHUNK_CHAR_LIMIT): string[] {
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

function runMacSay(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/say', args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

function makeTempAudioPath(prefix: string, extension = 'wav') {
  return join(
    app.getPath('temp'),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
  )
}

function isSpeechGenerationCurrent(generation: number | undefined) {
  return generation === undefined || generation === desktopSpeechGeneration
}

function cleanupAudioClip(clip: TtsAudioClip | null | undefined) {
  try {
    clip?.cleanup?.()
  } catch {
    // Temp audio cleanup is best-effort.
  }
}

function trackActiveSpeechChild(child: ChildProcess) {
  activeSpeechChild = child
  const clear = () => {
    if (activeSpeechChild === child) activeSpeechChild = null
  }
  child.once('exit', clear)
  child.once('error', clear)
}

function playAudioFile(filename: string, generation?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isSpeechGenerationCurrent(generation)) {
      resolve()
      return
    }
    const child = spawn('afplay', [filename], { stdio: 'ignore' })
    trackActiveSpeechChild(child)
    child.on('error', (error) => {
      if (!isSpeechGenerationCurrent(generation)) {
        resolve()
        return
      }
      reject(error)
    })
    child.on('exit', (code) => {
      if (!isSpeechGenerationCurrent(generation) || code === 0) {
        resolve()
        return
      }
      reject(new Error(`VOICE_PLAYBACK_FAILED_${code}`))
    })
  })
}

function audioFileClip(filename: string): TtsAudioClip {
  return {
    cleanup: () => rmSync(filename, { force: true }),
    filename,
  }
}

async function synthesizeSystemTts(
  text: string,
  options: TtsPlaybackOptions,
): Promise<TtsAudioClip | null> {
  const content = normalizeSpeechText(text)
  if (!content) return null
  if (process.platform !== 'darwin') return null
  if (!isSpeechGenerationCurrent(options.generation)) return null
  const preferredVoice = /[\u3400-\u9fff]/u.test(content) ? 'Tingting' : 'Junior'
  const filename = makeTempAudioPath('shadow-pet-system-tts', 'aiff')
  const ok =
    (await runMacSay(['-v', preferredVoice, '-o', filename, content])) ||
    (await runMacSay(['-o', filename, content]))
  if (!ok || !isSpeechGenerationCurrent(options.generation)) {
    rmSync(filename, { force: true })
    return null
  }
  return audioFileClip(filename)
}

function toVoxCpm2PetVoicePrompt(text: string): string {
  if (/[\u3400-\u9fff]/u.test(text)) {
    return `(清亮、温柔、孩子气的可爱童声，语气轻快自然)${text}`
  }
  return `(A gentle, bright, childlike pet voice, soft and natural)${text}`
}

function createTtsProviderDefinitions(
  nativeAddonAvailable: boolean,
): Record<TtsProvider, TtsProviderDefinition> {
  const sherpaTtsInstalled = hasModel(TTS_MODEL)
  const mossRuntimeInstalled = hasMossRuntime()
  const mossModelInstalled = hasMossModel()
  const voxCpm2RuntimeInstalled = hasVoxCpm2Runtime()
  const voxCpm2ModelInstalled = hasVoxCpm2Model()

  return {
    system: {
      id: 'system',
      installed: () => true,
      runtimeInstalled: () => true,
      modelInstalled: () => true,
      name: 'System Voice',
      sourceUrl: 'macos:say',
      synthesize: synthesizeSystemTts,
    },
    'moss-tts-nano': {
      id: 'moss-tts-nano',
      installed: () => mossRuntimeInstalled && mossModelInstalled,
      runtimeInstalled: () => mossRuntimeInstalled,
      modelInstalled: () => mossModelInstalled,
      name: 'MOSS-TTS-Nano ONNX',
      sourceUrl: MOSS_TTS_REPO,
      install: installMossTts,
      synthesize: synthesizeWithMossTts,
    },
    'sherpa-local': {
      id: 'sherpa-local',
      installed: () => nativeAddonAvailable && sherpaTtsInstalled,
      runtimeInstalled: () => nativeAddonAvailable,
      modelInstalled: () => sherpaTtsInstalled,
      name: TTS_MODEL.dir,
      sourceUrl: TTS_MODEL.url,
      install: async () => {
        await ensureTtsModel()
      },
      synthesize: synthesizeWithLocalTts,
    },
    voxcpm2: {
      id: 'voxcpm2',
      installed: () => voxCpm2RuntimeInstalled && voxCpm2ModelInstalled,
      runtimeInstalled: () => voxCpm2RuntimeInstalled,
      modelInstalled: () => voxCpm2ModelInstalled,
      name: 'VoxCPM2',
      sourceUrl: VOXCPM2_SOURCE_URL,
      install: installVoxCpm2Tts,
      synthesize: synthesizeWithVoxCpm2Tts,
    },
  }
}

function getTtsProviderStatus(provider: TtsProviderDefinition): TtsProviderStatus {
  return {
    installed: provider.installed(),
    runtimeInstalled: provider.runtimeInstalled?.(),
    modelInstalled: provider.modelInstalled?.(),
    name: provider.name,
    sourceUrl: provider.sourceUrl,
  }
}

export async function speakWithDesktopVoice(
  text: string,
  playback?: TtsPlaybackOptions,
): Promise<boolean> {
  const generation = playback?.generation ?? desktopSpeechGeneration
  const content = normalizeSpeechText(text)
  const chunks = splitTtsText(content, 72)
  if (!chunks.length) return false
  const results = await Promise.all(
    chunks.map((chunk) => enqueueDesktopSpeechSegment(chunk, generation)),
  )
  return results.some(Boolean)
}

function enqueueDesktopSpeechSegment(text: string, generation: number): Promise<boolean> {
  if (!isSpeechGenerationCurrent(generation)) return Promise.resolve(false)
  return new Promise((resolve) => {
    speechSynthesisQueue.push({ generation, resolve, text })
    pumpDesktopSpeechSynthesis()
  })
}

function pumpDesktopSpeechSynthesis() {
  if (speechSynthesizing) return
  speechSynthesizing = true
  void (async () => {
    try {
      while (speechSynthesisQueue.length) {
        const item = speechSynthesisQueue.shift()
        if (!item) continue
        if (!isSpeechGenerationCurrent(item.generation)) {
          item.resolve(false)
          continue
        }
        const clip = await synthesizeDesktopSpeechClip(item.text, item.generation)
        if (!clip || !isSpeechGenerationCurrent(item.generation)) {
          cleanupAudioClip(clip)
          item.resolve(false)
          continue
        }
        speechPlaybackQueue.push({
          clip,
          generation: item.generation,
          resolve: item.resolve,
        })
        pumpDesktopSpeechPlayback()
      }
    } finally {
      speechSynthesizing = false
    }
  })()
}

function pumpDesktopSpeechPlayback() {
  if (speechPlaying) return
  speechPlaying = true
  void (async () => {
    try {
      while (speechPlaybackQueue.length) {
        const item = speechPlaybackQueue.shift()
        if (!item) continue
        if (!isSpeechGenerationCurrent(item.generation)) {
          cleanupAudioClip(item.clip)
          item.resolve(false)
          continue
        }
        try {
          await playAudioFile(item.clip.filename, item.generation)
          item.resolve(isSpeechGenerationCurrent(item.generation))
        } catch {
          item.resolve(false)
        } finally {
          cleanupAudioClip(item.clip)
        }
      }
    } finally {
      speechPlaying = false
    }
  })()
}

async function synthesizeDesktopSpeechClip(
  text: string,
  generation: number,
): Promise<TtsAudioClip | null> {
  const nativeAddonAvailable = isSherpaNativeAddonAvailable()
  const providers = createTtsProviderDefinitions(nativeAddonAvailable)
  const configuredProvider = readDesktopSettings().ttsProvider
  const provider = providers[configuredProvider] ?? providers.system
  const options = { generation }
  const clip = await provider.synthesize(text, options)
  if (clip) return clip
  if (configuredProvider !== 'system') {
    const systemClip = await providers.system.synthesize(text, options)
    if (systemClip) return systemClip
  }
  if (ENABLE_LOCAL_TTS && configuredProvider !== 'sherpa-local') {
    return providers['sherpa-local'].synthesize(text, options)
  }
  return null
}

export function cancelDesktopSpeech(): void {
  const hasActiveSpeech =
    speechSynthesizing ||
    speechPlaying ||
    speechSynthesisQueue.length > 0 ||
    speechPlaybackQueue.length > 0 ||
    Boolean(activeSpeechChild)
  desktopSpeechGeneration += 1
  if (hasActiveSpeech) stopVoxCpm2Worker('VOICE_PLAYBACK_CANCELLED')
  while (speechSynthesisQueue.length) {
    speechSynthesisQueue.shift()?.resolve(false)
  }
  while (speechPlaybackQueue.length) {
    const item = speechPlaybackQueue.shift()
    if (!item) continue
    cleanupAudioClip(item.clip)
    item.resolve(false)
  }
  const child = activeSpeechChild
  activeSpeechChild = null
  if (child && !child.killed) child.kill('SIGTERM')
}

export async function prewarmDesktopVoice(): Promise<boolean> {
  const nativeAddonAvailable = isSherpaNativeAddonAvailable()
  const providers = createTtsProviderDefinitions(nativeAddonAvailable)
  const configuredProvider = readDesktopSettings().ttsProvider
  try {
    if (configuredProvider === 'voxcpm2' && providers.voxcpm2.installed()) {
      await ensureVoxCpm2Worker()
      return true
    }
    if (configuredProvider === 'sherpa-local' && providers['sherpa-local'].installed()) {
      await getTts()
      return true
    }
  } catch {
    return false
  }
  return configuredProvider === 'system'
}

function isSherpaNativeAddonAvailable(): boolean {
  try {
    return Boolean(loadSherpa())
  } catch {
    return false
  }
}

function voiceEngineStatus() {
  const nativeAddonAvailable = isSherpaNativeAddonAvailable()
  const providers = createTtsProviderDefinitions(nativeAddonAvailable)
  const settings = readDesktopSettings()
  return {
    engine: 'sherpa-onnx-node',
    asrProvider: settings.asrProvider,
    ttsProvider: settings.ttsProvider,
    nativeAddonAvailable,
    modelRoot: voiceModelRoot(),
    asr: {
      installed: hasModel(ASR_MODEL),
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
        getTtsProviderStatus(providers[providerId]),
      ]),
    ) as Record<TtsProvider, TtsProviderStatus>,
  }
}

export function setupPetVoiceHandlers(): void {
  ipcMain.handle('desktop:pet:voiceEngineStatus', () => voiceEngineStatus())
  ipcMain.handle('desktop:pet:prewarmVoice', () => prewarmDesktopVoice())

  ipcMain.handle(
    'desktop:pet:installVoiceModel',
    async (event, input: { provider?: TtsProvider }) => {
      const nativeAddonAvailable = isSherpaNativeAddonAvailable()
      const provider = input.provider
        ? createTtsProviderDefinitions(nativeAddonAvailable)[input.provider]
        : null
      await provider?.install?.(event.sender)
      return voiceEngineStatus()
    },
  )

  ipcMain.handle('desktop:pet:asrStart', async (event) => {
    const currentRecognizer = await getRecognizer(event.sender)
    activeAsr = {
      sender: event.sender,
      stream: currentRecognizer.createStream(),
      segments: [],
      lastText: '',
    }
    return { ok: true }
  })

  ipcMain.handle(
    'desktop:pet:asrAccept',
    (_event, input: { samples: ArrayBuffer; sampleRate: number }) => {
      decodeAsrChunk(new Float32Array(input.samples), input.sampleRate)
      return { ok: true }
    },
  )

  ipcMain.handle('desktop:pet:asrStop', () => {
    if (!activeAsr || !recognizer) return { text: '' }
    activeAsr.stream.inputFinished()
    while (recognizer.isReady(activeAsr.stream)) {
      recognizer.decode(activeAsr.stream)
    }
    const text = recognizer.getResult(activeAsr.stream).text?.trim()
    if (text) activeAsr.segments.push(text)
    const finalText = activeAsr.segments.join('').trim()
    activeAsr = null
    return { text: finalText }
  })
}
