import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { mkdir, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { ShadowClient, ShadowVoiceJoinResult } from '@shadowob/sdk'

type BridgeEvent = {
  type: string
  timestamp: string
  uid?: string
  path?: string
  message?: string
  detail?: unknown
}

type VoiceBridgeOptions = {
  client: ShadowClient
  channelId: string
  muted?: boolean
  browser?: string
  installBrowser?: boolean
  agoraSdk?: string
  headful?: boolean
  keepBrowser?: boolean
  durationSeconds?: number
  audioOutDir?: string
  videoOutDir?: string
  screenOutDir?: string
  screenIntervalMs: number
  inputFile?: string
  stdinPcm?: boolean
  stdinSampleRate: number
  stdinChannels: number
  json?: boolean
}

type AudioSink = {
  stream: WriteStream
  path: string
  sampleRate: number
  channels: number
  bytes: number
}

type VideoSink = {
  stream: WriteStream
  path: string
  bytes: number
}

type PcmChunk = {
  index: number
  data: Buffer
}

type PendingPcmRequest = {
  cursor: number
  res: ServerResponse
  timer: ReturnType<typeof setTimeout>
}

type BrowserProcess = ChildProcess & {
  port: number
  userDataDir: string
}

const require = createRequire(import.meta.url)
const DEFAULT_SCREEN_INTERVAL_MS = 1000
const MAX_POST_BYTES = 20 * 1024 * 1024
const PLAYWRIGHT_VERSION = '1.59.1'

export const defaultScreenIntervalMs = DEFAULT_SCREEN_INTERVAL_MS

export async function runVoiceMediaBridge(options: VoiceBridgeOptions): Promise<void> {
  const chromeExecutable = await findBrowserExecutable(options.browser, {
    installBrowser: options.installBrowser,
    json: options.json,
  })
  const agoraScriptPath = resolveAgoraBrowserScript(options.agoraSdk)
  const joinResult = await options.client.joinVoiceChannel(options.channelId, {
    muted: options.muted,
    clientId: 'shadowob-cli-media-bridge',
  })
  const state = createRuntimeState(options, joinResult, agoraScriptPath)
  let chrome: BrowserProcess | null = null

  try {
    const server = createServer((req, res) => {
      void handleBridgeRequest(state, req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to start media bridge')
    state.baseUrl = `http://127.0.0.1:${address.port}/${state.token}`
    emitBridgeEvent(state, {
      type: 'bridge:started',
      timestamp: new Date().toISOString(),
      detail: {
        channelId: options.channelId,
        audioOutDir: options.audioOutDir ?? null,
        videoOutDir: options.videoOutDir ?? null,
        screenOutDir: options.screenOutDir ?? null,
        input: options.stdinPcm ? 'stdin-pcm' : options.inputFile ? 'file' : null,
      },
    })

    chrome = await launchChrome(chromeExecutable, `${state.baseUrl}/`, options)
    attachConsoleInspector(chrome.port, state)

    if (options.stdinPcm) {
      startReadingStdinPcm(state)
    }

    await waitForBridgeStop(options.durationSeconds, chrome)
    await shutdownBridge(state, server, chrome, options)
  } catch (error) {
    await shutdownBridge(state, null, chrome, options).catch(() => undefined)
    throw error
  }
}

function createRuntimeState(
  options: VoiceBridgeOptions,
  joinResult: ShadowVoiceJoinResult,
  agoraScriptPath: string,
) {
  return {
    options,
    joinResult,
    agoraScriptPath,
    token: randomUUID(),
    baseUrl: '',
    screenSeq: new Map<string, number>(),
    audioSinks: new Map<string, AudioSink>(),
    videoSinks: new Map<string, VideoSink>(),
    pcmChunks: [] as PcmChunk[],
    pcmNextIndex: 0,
    pendingPcmRequests: new Set<PendingPcmRequest>(),
    stdinEnded: false,
    shuttingDown: false,
  }
}

async function handleBridgeRequest(
  state: ReturnType<typeof createRuntimeState>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const url = new URL(req.url ?? '/', state.baseUrl || 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== state.token) {
      sendText(res, 404, 'Not found')
      return
    }
    const route = parts[1] ?? ''

    if (req.method === 'GET' && route === '') {
      sendHtml(res, bridgeHtml(state.token))
      return
    }
    if (req.method === 'GET' && route === 'bridge.js') {
      sendJavaScript(res, bridgeClientScript())
      return
    }
    if (req.method === 'GET' && route === 'agora.js') {
      sendBuffer(res, await readFile(state.agoraScriptPath), 'application/javascript')
      return
    }
    if (req.method === 'GET' && route === 'config') {
      sendJson(res, {
        credentials: state.joinResult.credentials,
        options: {
          muted: Boolean(state.options.muted),
          recordAudio: Boolean(state.options.audioOutDir),
          recordVideo: Boolean(state.options.videoOutDir),
          recordScreen: Boolean(state.options.screenOutDir),
          screenIntervalMs: state.options.screenIntervalMs,
          input: state.options.stdinPcm
            ? {
                mode: 'stdin-pcm',
                sampleRate: state.options.stdinSampleRate,
                channels: state.options.stdinChannels,
              }
            : state.options.inputFile
              ? { mode: 'file' }
              : null,
        },
      })
      return
    }
    if (req.method === 'GET' && route === 'input-file') {
      if (!state.options.inputFile) {
        sendText(res, 404, 'No input file configured')
        return
      }
      sendBuffer(
        res,
        await readFile(state.options.inputFile),
        mediaTypeForPath(state.options.inputFile),
      )
      return
    }
    if (req.method === 'GET' && route === 'input-pcm') {
      handleInputPcmRequest(state, Number(url.searchParams.get('cursor') ?? '0'), res)
      return
    }
    if (req.method === 'POST' && route === 'event') {
      const body = await readRequestBody(req, MAX_POST_BYTES)
      emitBridgeEvent(state, JSON.parse(body.toString('utf8')) as BridgeEvent)
      sendJson(res, { ok: true })
      return
    }
    if (req.method === 'POST' && route === 'audio') {
      const uid = sanitizeSegment(url.searchParams.get('uid') ?? 'unknown')
      const sampleRate = Number(url.searchParams.get('sampleRate') ?? '48000')
      const channels = Number(url.searchParams.get('channels') ?? '1')
      const body = await readRequestBody(req, MAX_POST_BYTES)
      await writeAudioChunk(state, uid, body, sampleRate, channels)
      sendJson(res, { ok: true })
      return
    }
    if (req.method === 'POST' && route === 'screen') {
      const uid = sanitizeSegment(url.searchParams.get('uid') ?? 'unknown')
      const body = await readRequestBody(req, MAX_POST_BYTES)
      await writeScreenFrame(state, uid, body)
      sendJson(res, { ok: true })
      return
    }
    if (req.method === 'POST' && route === 'video') {
      const uid = sanitizeSegment(url.searchParams.get('uid') ?? 'unknown')
      const body = await readRequestBody(req, MAX_POST_BYTES)
      await writeVideoChunk(state, uid, body)
      sendJson(res, { ok: true })
      return
    }

    sendText(res, 404, 'Not found')
  } catch (error) {
    sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
}

function bridgeHtml(token: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Shadow Voice Bridge</title>
    <style>
      body { margin: 0; background: #050607; color: #f3f4f6; font: 14px system-ui, sans-serif; }
      main { padding: 18px; }
      video { width: 320px; max-width: 100%; background: #000; }
    </style>
  </head>
  <body>
    <main>
      <strong>Shadow Voice Bridge</strong>
      <div id="status">starting</div>
      <div id="screens"></div>
    </main>
    <script>window.__SHADOW_BRIDGE_TOKEN__ = ${JSON.stringify(token)};</script>
    <script src="./agora.js"></script>
    <script type="module" src="./bridge.js"></script>
  </body>
</html>`
}

function bridgeClientScript() {
  return `
const token = window.__SHADOW_BRIDGE_TOKEN__;
const base = '/' + token;
const statusEl = document.getElementById('status');
const screenRoot = document.getElementById('screens');
const config = await fetch(base + '/config').then((res) => res.json());
const AgoraRTC = window.AgoraRTC;
AgoraRTC.disableLogUpload?.();
AgoraRTC.setLogLevel?.(3);

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
const audioRecorders = new Map();
const screenRecorders = new Map();
const videoRecorders = new Map();
let inputAudioTrack = null;

function setStatus(value) {
  statusEl.textContent = value;
}

async function emit(type, detail = {}) {
  const payload = { type, timestamp: new Date().toISOString(), ...detail };
  console.log('[shadow-voice-bridge]', payload);
  try {
    await fetch(base + '/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('failed to emit bridge event', error);
  }
}

function int16FromFloat32(input) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function startAudioRecorder(uid, track) {
  if (!config.options.recordAudio || audioRecorders.has(String(uid))) return;
  const mediaTrack = track.getMediaStreamTrack?.();
  if (!mediaTrack) {
    void emit('audio:unsupported', { uid: String(uid), message: 'remote audio track has no MediaStreamTrack' });
    return;
  }
  const context = new AudioContext({ sampleRate: 48000 });
  const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    const channel = event.inputBuffer.getChannelData(0);
    const pcm = int16FromFloat32(channel);
    void fetch(base + '/audio?uid=' + encodeURIComponent(String(uid)) + '&sampleRate=' + context.sampleRate + '&channels=1', {
      method: 'POST',
      body: pcm.buffer,
    }).catch(() => undefined);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  audioRecorders.set(String(uid), { context, source, processor, mute });
  void emit('audio:recording-started', { uid: String(uid) });
}

function stopAudioRecorder(uid) {
  const recorder = audioRecorders.get(String(uid));
  if (!recorder) return;
  recorder.processor.disconnect();
  recorder.source.disconnect();
  recorder.mute.disconnect();
  void recorder.context.close();
  audioRecorders.delete(String(uid));
  void emit('audio:recording-stopped', { uid: String(uid) });
}

async function startScreenRecorder(uid, track) {
  if ((!config.options.recordScreen && !config.options.recordVideo) || screenRecorders.has(String(uid))) return;
  const mediaTrack = track.getMediaStreamTrack?.();
  if (!mediaTrack) {
    void emit('screen:unsupported', { uid: String(uid), message: 'remote video track has no MediaStreamTrack' });
    return;
  }
  if (config.options.recordVideo && !videoRecorders.has(String(uid))) {
    if (typeof MediaRecorder === 'undefined') {
      void emit('video:unsupported', { uid: String(uid), message: 'MediaRecorder is not available' });
    } else {
    const stream = new MediaStream([mediaTrack.clone()]);
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        void fetch(base + '/video?uid=' + encodeURIComponent(String(uid)), {
          method: 'POST',
          body: event.data,
        }).catch(() => undefined);
      };
      recorder.onerror = (event) => {
        void emit('video:error', { uid: String(uid), message: String(event.error?.message || event.type) });
      };
      recorder.start(1000);
      videoRecorders.set(String(uid), { recorder, stream });
      void emit('video:recording-started', { uid: String(uid), detail: { mimeType: recorder.mimeType } });
    } catch (error) {
      stream.getTracks().forEach((item) => item.stop());
      void emit('video:unsupported', { uid: String(uid), message: error?.message || String(error) });
    }
    }
  }
  if (!config.options.recordScreen) return;
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([mediaTrack]);
  screenRoot.append(video);
  await video.play().catch(() => undefined);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const timer = setInterval(() => {
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      void fetch(base + '/screen?uid=' + encodeURIComponent(String(uid)), {
        method: 'POST',
        body: blob,
      }).catch(() => undefined);
    }, 'image/png');
  }, Math.max(250, config.options.screenIntervalMs || 1000));
  screenRecorders.set(String(uid), { video, timer });
  void emit('screen:recording-started', { uid: String(uid) });
}

function stopScreenRecorder(uid) {
  const recorder = screenRecorders.get(String(uid));
  if (recorder) {
    clearInterval(recorder.timer);
    recorder.video.remove();
    screenRecorders.delete(String(uid));
    void emit('screen:recording-stopped', { uid: String(uid) });
  }
  const videoRecorder = videoRecorders.get(String(uid));
  if (videoRecorder) {
    try {
      if (videoRecorder.recorder.state !== 'inactive') videoRecorder.recorder.stop();
    } catch {
      // Best effort shutdown; chunks already emitted are still kept.
    }
    videoRecorder.stream.getTracks().forEach((item) => item.stop());
    videoRecorders.delete(String(uid));
    void emit('video:recording-stopped', { uid: String(uid) });
  }
}

async function publishInputFile() {
  const response = await fetch(base + '/input-file');
  const data = await response.arrayBuffer();
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(data.slice(0));
  await publishAudioBuffer(context, buffer);
  void emit('input:file-published');
}

async function publishAudioBuffer(context, buffer) {
  const destination = context.createMediaStreamDestination();
  inputAudioTrack = AgoraRTC.createCustomAudioTrack({
    mediaStreamTrack: destination.stream.getAudioTracks()[0],
    encoderConfig: 'music_standard',
  });
  await client.publish([inputAudioTrack]);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  source.start();
}

async function publishStdinPcm() {
  const input = config.options.input;
  const context = new AudioContext({ sampleRate: input.sampleRate });
  const destination = context.createMediaStreamDestination();
  inputAudioTrack = AgoraRTC.createCustomAudioTrack({
    mediaStreamTrack: destination.stream.getAudioTracks()[0],
    encoderConfig: 'music_standard',
  });
  await client.publish([inputAudioTrack]);
  let cursor = 0;
  let playAt = context.currentTime + 0.2;
  void emit('input:stdin-pcm-published', { detail: { sampleRate: input.sampleRate, channels: input.channels } });
  while (true) {
    const response = await fetch(base + '/input-pcm?cursor=' + cursor);
    if (response.status === 204) {
      if (response.headers.get('x-input-ended') === 'true') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
      continue;
    }
    if (!response.ok) throw new Error('input-pcm failed: ' + response.status);
    cursor = Number(response.headers.get('x-next-cursor') || cursor + 1);
    const sampleRate = Number(response.headers.get('x-sample-rate') || input.sampleRate);
    const channels = Number(response.headers.get('x-channels') || input.channels);
    const pcm = new Int16Array(await response.arrayBuffer());
    const frames = Math.floor(pcm.length / channels);
    const buffer = context.createBuffer(1, frames, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let frame = 0; frame < frames; frame += 1) {
      channel[frame] = pcm[frame * channels] / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    playAt = Math.max(playAt, context.currentTime + 0.05);
    source.start(playAt);
    playAt += buffer.duration;
  }
  void emit('input:stdin-ended');
}

client.on('user-published', async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  if (mediaType === 'audio' && user.audioTrack) {
    startAudioRecorder(user.uid, user.audioTrack);
    void emit('remote-audio:subscribed', { uid: String(user.uid) });
  }
  if (mediaType === 'video' && user.videoTrack) {
    await startScreenRecorder(user.uid, user.videoTrack);
    void emit('remote-screen:subscribed', { uid: String(user.uid) });
  }
});

client.on('user-unpublished', (user, mediaType) => {
  if (mediaType === 'audio') stopAudioRecorder(user.uid);
  if (mediaType === 'video') stopScreenRecorder(user.uid);
  void emit('remote-unpublished', { uid: String(user.uid), detail: { mediaType } });
});

window.addEventListener('error', (event) => {
  void emit('browser:error', { message: event.message, detail: { filename: event.filename, lineno: event.lineno } });
});
window.addEventListener('unhandledrejection', (event) => {
  void emit('browser:unhandled-rejection', { message: String(event.reason?.message || event.reason) });
});

window.__shadowVoiceBridgeStop = async () => {
  for (const uid of [...screenRecorders.keys(), ...videoRecorders.keys()]) {
    stopScreenRecorder(uid);
  }
  if (inputAudioTrack) {
    inputAudioTrack.stop?.();
    inputAudioTrack.close?.();
    inputAudioTrack = null;
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  await client.leave().catch(() => undefined);
  void emit('bridge:page-stopped');
};

try {
  const credentials = config.credentials;
  setStatus('joining');
  await client.join(credentials.appId, credentials.agoraChannelName, credentials.token, credentials.uid);
  setStatus('joined');
  void emit('bridge:joined', { detail: { uid: credentials.uid, screenUid: credentials.screenUid } });
  if (config.options.input?.mode === 'file') await publishInputFile();
  if (config.options.input?.mode === 'stdin-pcm') void publishStdinPcm().catch((error) => emit('input:error', { message: error.message }));
} catch (error) {
  setStatus('error');
  void emit('bridge:error', { message: error?.message || String(error) });
}
`
}

function resolveAgoraBrowserScript(explicit?: string) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Agora Web SDK script not found: ${explicit}`)
    return explicit
  }
  if (process.env.SHADOWOB_AGORA_WEB_SDK) {
    if (!existsSync(process.env.SHADOWOB_AGORA_WEB_SDK)) {
      throw new Error(`Agora Web SDK script not found: ${process.env.SHADOWOB_AGORA_WEB_SDK}`)
    }
    return process.env.SHADOWOB_AGORA_WEB_SDK
  }

  const direct = tryRequireResolve('agora-rtc-sdk-ng/AgoraRTC_N-production.js')
  if (direct) return direct

  const sdkEntry = tryRequireResolve('@shadowob/sdk')
  if (sdkEntry) {
    let current = dirname(sdkEntry)
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = join(
        current,
        'node_modules',
        'agora-rtc-sdk-ng',
        'AgoraRTC_N-production.js',
      )
      if (existsSync(candidate)) return candidate
      current = dirname(current)
    }
  }

  throw new Error(
    'Agora Web SDK is not available. Install agora-rtc-sdk-ng next to the CLI, or pass --agora-sdk / set SHADOWOB_AGORA_WEB_SDK to AgoraRTC_N-production.js.',
  )
}

function tryRequireResolve(specifier: string) {
  try {
    return require.resolve(specifier)
  } catch {
    return null
  }
}

export async function installVoiceTestBrowser(options: { json?: boolean } = {}) {
  const existing = await resolveVoiceTestBrowserPath()
  if (existing) return existing

  const root = managedBrowserRoot()
  await mkdir(root, { recursive: true })
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = ['--yes', `playwright@${PLAYWRIGHT_VERSION}`, 'install', 'chromium']
  const output: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: root,
      },
      stdio: options.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    if (options.json) {
      child.stdout?.on('data', (chunk) => output.push(Buffer.from(chunk)))
      child.stderr?.on('data', (chunk) => output.push(Buffer.from(chunk)))
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else {
        const detail = Buffer.concat(output).toString('utf8').trim()
        reject(
          new Error(
            `Failed to install test Chromium with npx playwright install chromium${detail ? `: ${detail}` : ''}`,
          ),
        )
      }
    })
  })
  const installed = await resolveVoiceTestBrowserPath()
  if (!installed)
    throw new Error(`Chromium was installed under ${root}, but no executable was found`)
  return installed
}

export async function resolveVoiceTestBrowserPath() {
  const root = managedBrowserRoot()
  if (!existsSync(root)) return null
  return findExecutableUnder(root, managedBrowserExecutableNames())
}

function managedBrowserRoot() {
  return process.env.SHADOWOB_BROWSER_CACHE_DIR
    ? join(process.env.SHADOWOB_BROWSER_CACHE_DIR, 'playwright')
    : join(homedir(), '.cache', 'shadowob', 'browsers', 'playwright')
}

function managedBrowserExecutableNames() {
  if (process.platform === 'darwin') {
    return ['Chromium.app/Contents/MacOS/Chromium', 'Chrome.app/Contents/MacOS/Chrome']
  }
  if (process.platform === 'win32') return ['chrome.exe']
  return ['chrome', 'chromium']
}

async function findExecutableUnder(root: string, names: string[]): Promise<string | null> {
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()!
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        for (const name of names) {
          const candidate = join(full, name)
          if (existsSync(candidate)) return candidate
        }
        queue.push(full)
      } else if (entry.isFile() && names.includes(entry.name)) {
        return full
      }
    }
  }
  return null
}

async function findBrowserExecutable(
  explicit?: string,
  options: { installBrowser?: boolean; json?: boolean } = {},
) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Browser executable not found: ${explicit}`)
    return explicit
  }
  if (process.env.SHADOWOB_BROWSER && existsSync(process.env.SHADOWOB_BROWSER)) {
    return process.env.SHADOWOB_BROWSER
  }
  const managed = await resolveVoiceTestBrowserPath()
  if (managed) return managed
  if (options.installBrowser) {
    return installVoiceTestBrowser({ json: options.json })
  }

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
          ]
        : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    try {
      return execFileSync('which', [candidate], { encoding: 'utf8' }).trim()
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(
    'No Chrome/Chromium executable found. Run shadowob voice browser install, pass --install-browser, or set SHADOWOB_BROWSER=/path/to/chrome.',
  )
}

async function launchChrome(
  executable: string,
  url: string,
  options: VoiceBridgeOptions,
): Promise<BrowserProcess> {
  const port = await findFreePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'shadowob-voice-bridge-'))
  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--disable-component-update',
    '--disable-breakpad',
    '--disable-gpu',
    '--password-store=basic',
    '--use-mock-keychain',
  ]
  if (!options.headful) args.push('--headless=new')
  args.push(url)

  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as BrowserProcess
  child.port = port
  child.userDataDir = userDataDir
  let stderrBuffer = ''
  child.stderr?.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8')
    const lines = stderrBuffer.split(/\r?\n/)
    stderrBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (/ERROR|ERR_|Exception/i.test(line) && !isIgnorableChromeStderr(line)) {
        process.stderr.write(`${line}\n`)
      }
    }
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`Chrome exited with code ${code}\n`)
    }
  })
  await waitForChrome(port)
  return child
}

async function attachConsoleInspector(port: number, state: ReturnType<typeof createRuntimeState>) {
  try {
    const pages = (await fetchJson(`http://127.0.0.1:${port}/json/list`)) as Array<{
      type: string
      url: string
      webSocketDebuggerUrl?: string
    }>
    const page = pages.find((item) => item.type === 'page' && item.url.startsWith(state.baseUrl))
    if (!page?.webSocketDebuggerUrl) return
    const socket = new WebSocket(page.webSocketDebuggerUrl)
    const requestUrls = new Map<string, string>()
    let id = 0
    socket.addEventListener('open', () => {
      for (const method of ['Runtime.enable', 'Log.enable', 'Network.enable']) {
        socket.send(JSON.stringify({ id: ++id, method }))
      }
    })
    socket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as {
        method?: string
        params?: Record<string, unknown>
      }
      if (payload.method === 'Runtime.exceptionThrown') {
        emitBridgeEvent(state, {
          type: 'browser:exception',
          timestamp: new Date().toISOString(),
          detail: payload.params,
        })
      }
      if (payload.method === 'Log.entryAdded') {
        const entry = payload.params?.entry as
          | { level?: string; text?: string; url?: string }
          | undefined
        if (entry?.level === 'error' && !isIgnorableBrowserDiagnosticUrl(entry.url)) {
          emitBridgeEvent(state, {
            type: 'browser:console-error',
            timestamp: new Date().toISOString(),
            message: entry.text,
            detail: { url: entry.url },
          })
        }
      }
      if (payload.method === 'Network.requestWillBeSent') {
        const params = payload.params as
          | { requestId?: string; request?: { url?: string } }
          | undefined
        if (params?.requestId && params.request?.url) {
          requestUrls.set(params.requestId, params.request.url)
        }
      }
      if (payload.method === 'Network.loadingFailed') {
        const params = payload.params as
          | { requestId?: string; errorText?: string; canceled?: boolean }
          | undefined
        const url = params?.requestId ? requestUrls.get(params.requestId) : undefined
        if (params?.errorText && !params.canceled && !isIgnorableBrowserDiagnosticUrl(url)) {
          emitBridgeEvent(state, {
            type: 'browser:network-failed',
            timestamp: new Date().toISOString(),
            message: params.errorText,
            detail: url ? { url } : undefined,
          })
        }
      }
    })
  } catch {
    // Console inspection is diagnostic-only; the bridge still reports page events over HTTP.
  }
}

function isIgnorableBrowserDiagnosticUrl(url?: string) {
  if (!url) return false
  return (
    url.endsWith('/favicon.ico') ||
    url.includes('statscollector') ||
    url.includes('update.googleapis.com') ||
    url.includes('clients4.google.com')
  )
}

function isIgnorableChromeStderr(line: string) {
  return (
    line.includes('ssl_client_socket_impl.cc') ||
    line.includes('google_apis/gcm') ||
    line.includes('video_capture_service_impl.cc') ||
    line.includes('A BUNDLE group contains a codec collision') ||
    line.includes('Inconsistent congestion control feedback types') ||
    line.includes('task_policy_set TASK_CATEGORY_POLICY') ||
    line.includes('task_policy_set TASK_SUPPRESSION_POLICY')
  )
}

async function waitForChrome(port: number) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }
  throw new Error('Timed out waiting for Chrome remote debugging')
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function findFreePort() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!address || typeof address === 'string') throw new Error('Failed to allocate port')
  return address.port
}

function startReadingStdinPcm(state: ReturnType<typeof createRuntimeState>) {
  process.stdin.on('data', (chunk: Buffer) => {
    const entry = { index: state.pcmNextIndex++, data: Buffer.from(chunk) }
    state.pcmChunks.push(entry)
    if (state.pcmChunks.length > 512) state.pcmChunks.shift()
    flushPendingPcmRequests(state)
  })
  process.stdin.on('end', () => {
    state.stdinEnded = true
    flushPendingPcmRequests(state)
  })
  process.stdin.resume()
}

function handleInputPcmRequest(
  state: ReturnType<typeof createRuntimeState>,
  cursor: number,
  res: ServerResponse,
) {
  const next = state.pcmChunks.find((chunk) => chunk.index >= cursor)
  if (next) {
    sendPcmChunk(state, res, next)
    return
  }
  if (state.stdinEnded) {
    res.writeHead(204, { 'x-input-ended': 'true' })
    res.end()
    return
  }
  const pending: PendingPcmRequest = {
    cursor,
    res,
    timer: setTimeout(() => {
      state.pendingPcmRequests.delete(pending)
      if (!res.writableEnded) {
        res.writeHead(204)
        res.end()
      }
    }, 15_000),
  }
  state.pendingPcmRequests.add(pending)
}

function flushPendingPcmRequests(state: ReturnType<typeof createRuntimeState>) {
  for (const pending of [...state.pendingPcmRequests]) {
    const next = state.pcmChunks.find((chunk) => chunk.index >= pending.cursor)
    if (!next && !state.stdinEnded) continue
    clearTimeout(pending.timer)
    state.pendingPcmRequests.delete(pending)
    if (pending.res.writableEnded) continue
    if (next) sendPcmChunk(state, pending.res, next)
    else {
      pending.res.writeHead(204, { 'x-input-ended': 'true' })
      pending.res.end()
    }
  }
}

function sendPcmChunk(
  state: ReturnType<typeof createRuntimeState>,
  res: ServerResponse,
  chunk: PcmChunk,
) {
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'x-next-cursor': String(chunk.index + 1),
    'x-sample-rate': String(state.options.stdinSampleRate),
    'x-channels': String(state.options.stdinChannels),
  })
  res.end(chunk.data)
}

async function writeAudioChunk(
  state: ReturnType<typeof createRuntimeState>,
  uid: string,
  chunk: Buffer,
  sampleRate: number,
  channels: number,
) {
  if (!state.options.audioOutDir || chunk.length === 0) return
  await mkdir(state.options.audioOutDir, { recursive: true })
  let sink = state.audioSinks.get(uid)
  if (!sink) {
    const path = join(state.options.audioOutDir, `${uid}-${Date.now()}.wav`)
    const stream = createWriteStream(path)
    stream.write(wavHeader(sampleRate, channels, 0))
    sink = { stream, path, sampleRate, channels, bytes: 0 }
    state.audioSinks.set(uid, sink)
    emitBridgeEvent(state, {
      type: 'audio:file-started',
      timestamp: new Date().toISOString(),
      uid,
      path,
    })
  }
  sink.stream.write(chunk)
  sink.bytes += chunk.length
}

async function writeScreenFrame(
  state: ReturnType<typeof createRuntimeState>,
  uid: string,
  chunk: Buffer,
) {
  if (!state.options.screenOutDir || chunk.length === 0) return
  await mkdir(state.options.screenOutDir, { recursive: true })
  const seq = (state.screenSeq.get(uid) ?? 0) + 1
  state.screenSeq.set(uid, seq)
  const path = join(state.options.screenOutDir, `${uid}-${String(seq).padStart(6, '0')}.png`)
  await writeFile(path, chunk)
  emitBridgeEvent(state, {
    type: 'screen:frame',
    timestamp: new Date().toISOString(),
    uid,
    path,
  })
}

async function writeVideoChunk(
  state: ReturnType<typeof createRuntimeState>,
  uid: string,
  chunk: Buffer,
) {
  if (!state.options.videoOutDir || chunk.length === 0) return
  await mkdir(state.options.videoOutDir, { recursive: true })
  let sink = state.videoSinks.get(uid)
  if (!sink) {
    const path = join(state.options.videoOutDir, `${uid}-${Date.now()}.webm`)
    const stream = createWriteStream(path)
    sink = { stream, path, bytes: 0 }
    state.videoSinks.set(uid, sink)
    emitBridgeEvent(state, {
      type: 'video:file-started',
      timestamp: new Date().toISOString(),
      uid,
      path,
    })
  }
  sink.stream.write(chunk)
  sink.bytes += chunk.length
}

async function closeAudioSinks(state: ReturnType<typeof createRuntimeState>) {
  await Promise.all(
    [...state.audioSinks.values()].map(
      (sink) =>
        new Promise<void>((resolve) => {
          sink.stream.end(async () => {
            const file = await open(sink.path, 'r+')
            try {
              await file.write(wavHeader(sink.sampleRate, sink.channels, sink.bytes), 0, 44, 0)
            } finally {
              await file.close()
            }
            emitBridgeEvent(state, {
              type: 'audio:file-finished',
              timestamp: new Date().toISOString(),
              path: sink.path,
              detail: { bytes: sink.bytes },
            })
            resolve()
          })
        }),
    ),
  )
  state.audioSinks.clear()
}

async function closeVideoSinks(state: ReturnType<typeof createRuntimeState>) {
  await Promise.all(
    [...state.videoSinks.values()].map(
      (sink) =>
        new Promise<void>((resolve) => {
          sink.stream.end(() => {
            emitBridgeEvent(state, {
              type: 'video:file-finished',
              timestamp: new Date().toISOString(),
              path: sink.path,
              detail: { bytes: sink.bytes },
            })
            resolve()
          })
        }),
    ),
  )
  state.videoSinks.clear()
}

function wavHeader(sampleRate: number, channels: number, dataBytes: number) {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * 2
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

async function shutdownBridge(
  state: ReturnType<typeof createRuntimeState>,
  server: ReturnType<typeof createServer> | null,
  chrome: BrowserProcess | null,
  options: VoiceBridgeOptions,
) {
  if (state.shuttingDown) return
  state.shuttingDown = true
  if (chrome) await stopBridgePage(chrome.port, state).catch(() => undefined)
  await options.client.leaveVoiceChannel(options.channelId).catch(() => undefined)
  await closeAudioSinks(state).catch(() => undefined)
  await closeVideoSinks(state).catch(() => undefined)
  for (const pending of state.pendingPcmRequests) {
    clearTimeout(pending.timer)
    if (!pending.res.writableEnded) {
      pending.res.writeHead(204, { 'x-input-ended': 'true' })
      pending.res.end()
    }
  }
  state.pendingPcmRequests.clear()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  if (chrome && !options.keepBrowser) {
    chrome.kill('SIGTERM')
    if (chrome.userDataDir)
      await rm(chrome.userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function stopBridgePage(port: number, state: ReturnType<typeof createRuntimeState>) {
  const pages = (await fetchJson(`http://127.0.0.1:${port}/json/list`)) as Array<{
    type: string
    url: string
    webSocketDebuggerUrl?: string
  }>
  const page = pages.find((item) => item.type === 'page' && item.url.startsWith(state.baseUrl))
  if (!page?.webSocketDebuggerUrl) return
  const debuggerUrl = page.webSocketDebuggerUrl

  await new Promise<void>((resolve) => {
    const socket = new WebSocket(debuggerUrl)
    const timer = setTimeout(() => {
      socket.close()
      resolve()
    }, 3_000)
    const finish = () => {
      clearTimeout(timer)
      socket.close()
      resolve()
    }
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: 'window.__shadowVoiceBridgeStop?.()',
            awaitPromise: true,
            returnByValue: true,
          },
        }),
      )
    })
    socket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as { id?: number }
      if (payload.id === 1) finish()
    })
    socket.addEventListener('error', finish)
    socket.addEventListener('close', finish)
  })
}

async function waitForBridgeStop(durationSeconds: number | undefined, chrome: BrowserProcess) {
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = () => {
      if (timer) clearTimeout(timer)
      process.off('SIGINT', done)
      process.off('SIGTERM', done)
      chrome.off('exit', done)
      resolve()
    }
    if (durationSeconds && durationSeconds > 0) {
      timer = setTimeout(done, durationSeconds * 1000)
    }
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
    chrome.once('exit', done)
  })
}

function emitBridgeEvent(state: ReturnType<typeof createRuntimeState>, event: BridgeEvent) {
  if (state.options.json) {
    console.log(JSON.stringify(event))
    return
  }
  const suffix = event.path ? ` ${event.path}` : event.message ? ` ${event.message}` : ''
  console.log(`[${event.timestamp}] ${event.type}${event.uid ? ` uid=${event.uid}` : ''}${suffix}`)
}

function readRequestBody(req: IncomingMessage, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('Request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  sendBuffer(res, Buffer.from(JSON.stringify(data)), 'application/json', status)
}

function sendHtml(res: ServerResponse, html: string) {
  sendBuffer(res, Buffer.from(html), 'text/html; charset=utf-8')
}

function sendJavaScript(res: ServerResponse, js: string) {
  sendBuffer(res, Buffer.from(js), 'application/javascript; charset=utf-8')
}

function sendText(res: ServerResponse, status: number, text: string) {
  sendBuffer(res, Buffer.from(text), 'text/plain; charset=utf-8', status)
}

function sendBuffer(res: ServerResponse, body: Buffer, contentType: string, status = 200) {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) || 'unknown'
}

function mediaTypeForPath(path: string) {
  const name = basename(path).toLowerCase()
  if (name.endsWith('.wav')) return 'audio/wav'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  return 'application/octet-stream'
}

export async function validateVoiceBridgeOptions(options: {
  audioOutDir?: string
  videoOutDir?: string
  screenOutDir?: string
  inputFile?: string
  stdinSampleRate: number
  stdinChannels: number
}) {
  if (options.inputFile) {
    const info = await stat(options.inputFile)
    if (!info.isFile()) throw new Error(`Input audio path is not a file: ${options.inputFile}`)
  }
  if (options.audioOutDir) await mkdir(options.audioOutDir, { recursive: true })
  if (options.videoOutDir) await mkdir(options.videoOutDir, { recursive: true })
  if (options.screenOutDir) await mkdir(options.screenOutDir, { recursive: true })
  if (!Number.isFinite(options.stdinSampleRate) || options.stdinSampleRate < 8000) {
    throw new Error('--sample-rate must be at least 8000')
  }
  if (![1, 2].includes(options.stdinChannels)) {
    throw new Error('--channels must be 1 or 2')
  }
}
