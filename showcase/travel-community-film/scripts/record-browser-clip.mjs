import { mkdir, writeFile } from 'node:fs/promises'

export async function recordBrowserClip({ action, cdp, outputDir, height = 720, width = 1280 }) {
  await mkdir(outputDir, { recursive: true })
  const seed = await cdp.readEvents({
    methods: ['Page.screencastFrame'],
    limit: 1,
    timeoutMs: 1,
  })
  let cursor = seed.cursor
  let actionFinished = false
  let actionError
  const frames = []

  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1,
  })

  const actionPromise = Promise.resolve()
    .then(action)
    .catch((error) => {
      actionError = error
    })
    .finally(() => {
      actionFinished = true
    })

  let screencastStopped = false
  let emptyReadsAfterStop = 0
  while (!screencastStopped || emptyReadsAfterStop < 1) {
    const batch = await cdp.readEvents({
      afterSequence: cursor,
      methods: ['Page.screencastFrame'],
      limit: 250,
      timeoutMs: 400,
    })
    cursor = batch.cursor
    for (const event of batch.events) {
      const params = event.params ?? {}
      const file = `${String(frames.length).padStart(6, '0')}.jpg`
      await writeFile(`${outputDir}/${file}`, Buffer.from(String(params.data ?? ''), 'base64'))
      frames.push({
        file,
        timestamp: params.metadata?.timestamp ?? null,
      })
      await cdp.send('Page.screencastFrameAck', {
        sessionId: params.sessionId,
      })
    }

    if (actionFinished && !screencastStopped) {
      await cdp.send('Page.stopScreencast')
      screencastStopped = true
    }
    if (screencastStopped) {
      emptyReadsAfterStop = batch.events.length === 0 ? emptyReadsAfterStop + 1 : 0
    }
  }

  await actionPromise
  await writeFile(`${outputDir}/frames.json`, `${JSON.stringify(frames, null, 2)}\n`)

  if (actionError) throw actionError
  return {
    frames: frames.length,
    firstTimestamp: frames[0]?.timestamp ?? null,
    lastTimestamp: frames.at(-1)?.timestamp ?? null,
  }
}
