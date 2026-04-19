// ═══════════════════════════════════════════════════════════════
// SlideForge v6 — Express Backend Server
// Provides: ACP unified endpoint, material management, PPTX artifacts,
//           file cards, multi-deck CRUD, skills system, research routing
// Runs on port 3100 (Vite dev proxy → /api → localhost:3100)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import express from 'express'
import multer from 'multer'

const app = express()
const PORT = process.env.PORT || 3100
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:8080'
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
const ARTIFACT_DIR = resolve(process.env.ARTIFACT_DIR || './artifacts')
const CARD_FILES_DIR = resolve(process.env.CARD_FILES_DIR || './card-files')
const SKILLS_DIR = resolve(process.env.SKILLS_DIR || './skills')

// Ensure directories exist
for (const dir of [UPLOAD_DIR, ARTIFACT_DIR, CARD_FILES_DIR, SKILLS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

app.use(express.json({ limit: '50mb' }))

// ── In-memory stores ──
const materials = new Map() // id → { id, name, type, path, ... }
const cards = new Map() // id → { id, kind, ... }
const decks = new Map() // id → { id, title, ... }
const skills = new Map() // id → SkillDef

// ── Multer for file uploads ──
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } })

// Card file upload storage
const cardFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CARD_FILES_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})
const cardFileUpload = multer({ storage: cardFileStorage, limits: { fileSize: 100 * 1024 * 1024 } })

// ── Load builtin skills on startup ──
function loadBuiltinSkills() {
  const builtins = [
    {
      id: 'research-deep-analysis',
      name: 'Deep Analysis',
      emoji: '🔬',
      category: 'research',
      description:
        'Perform multi-level deep analysis on a topic, uncovering core logic and implicit relationships',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'research-deep-analysis'),
      version: '1.0.0',
    },
    {
      id: 'research-data-evidence',
      name: 'Data Evidence',
      emoji: '📊',
      category: 'research',
      description:
        'Collect and analyze relevant data, statistics, and metrics to support arguments',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'research-data-evidence'),
      version: '1.0.0',
    },
    {
      id: 'research-case-study',
      name: 'Case Study',
      emoji: '📋',
      category: 'research',
      description: 'Find and analyze relevant cases, extracting reusable insights and lessons',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'research-case-study'),
      version: '1.0.0',
    },
    {
      id: 'research-counter-argument',
      name: 'Counter Argument',
      emoji: '⚖️',
      category: 'research',
      description:
        'Examine viewpoints from the opposing angle, discovering potential risks and counterarguments',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'research-counter-argument'),
      version: '1.0.0',
    },
    {
      id: 'drawing-diagram',
      name: 'Diagram Drawing',
      emoji: '📐',
      category: 'drawing',
      description:
        'Generate flowcharts, architecture diagrams, mind maps, and other structured visuals',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'drawing-diagram'),
      version: '1.0.0',
    },
    {
      id: 'drawing-chart',
      name: 'Data Charts',
      emoji: '📈',
      category: 'drawing',
      description:
        'Generate bar charts, pie charts, line graphs, and other statistical charts from data',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'drawing-chart'),
      version: '1.0.0',
    },
    {
      id: 'art-illustration',
      name: 'Illustration Generation',
      emoji: '🎨',
      category: 'art',
      description:
        'Generate PPT illustrations, cover images, and supplementary graphics from text descriptions',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'art-illustration'),
      version: '1.0.0',
    },
    {
      id: 'art-icon',
      name: 'Icon Design',
      emoji: '✨',
      category: 'art',
      description: 'Generate icons, symbols, and decorative elements needed for PPT slides',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'art-icon'),
      version: '1.0.0',
    },
    {
      id: 'analysis-image',
      name: 'Image Analysis',
      emoji: '🖼️',
      category: 'analysis',
      description:
        'Analyze image content, extract text, recognize objects, describe scenes, and generate image cards',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'analysis-image'),
      version: '1.0.0',
    },
    {
      id: 'analysis-text',
      name: 'Text Analysis',
      emoji: '📝',
      category: 'analysis',
      description:
        'Perform structured analysis on long text, extracting key points, arguments, and quotes',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'analysis-text'),
      version: '1.0.0',
    },
    {
      id: 'data-web-search',
      name: 'Web Search',
      emoji: '🌐',
      category: 'data',
      description:
        'Search the internet for the latest information, data, and articles to enrich PPT content',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'data-web-search'),
      version: '1.0.0',
    },
    {
      id: 'utility-summary',
      name: 'Smart Summary',
      emoji: '📋',
      category: 'utility',
      description:
        'Intelligently summarize long documents or multiple materials into concise output',
      builtin: true,
      status: 'installed',
      skillPath: join(SKILLS_DIR, 'utility-summary'),
      version: '1.0.0',
    },
  ]

  for (const skill of builtins) {
    skills.set(skill.id, skill)
    // Ensure skill directory exists (everything is a file)
    if (!existsSync(skill.skillPath)) {
      mkdirSync(skill.skillPath, { recursive: true })
    }
  }
  console.log(`📦 Loaded ${builtins.length} builtin skills`)
}

loadBuiltinSkills()

// ══════════════════════════════════════════════
// Material Endpoints
// ══════════════════════════════════════════════

/** POST /api/materials/upload — Upload files */
app.post('/api/materials/upload', upload.array('files', 50), (req, res) => {
  const projectId = req.body.projectId
  const files = req.files
  if (!files || !Array.isArray(files)) {
    return res.json({ ok: false, error: 'No files' })
  }

  const results = files.map((f) => {
    const id = randomUUID()
    const mat = {
      id,
      name: f.originalname,
      type: detectType(f.originalname, f.mimetype),
      mimeType: f.mimetype,
      size: f.size,
      path: f.path,
      status: 'uploaded',
      cardIds: [],
      uploadedAt: Date.now(),
    }
    materials.set(id, { ...mat, projectId })
    return mat
  })

  res.json({ ok: true, data: results })
})

/** POST /api/materials/text — Add text/idea material */
app.post('/api/materials/text', async (req, res) => {
  const { projectId, content, name, type } = req.body
  const id = randomUUID()
  const filename = `${id}.txt`
  const filePath = join(UPLOAD_DIR, filename)
  await writeFile(filePath, content, 'utf-8')

  const mat = {
    id,
    name: name || content.slice(0, 40),
    type: type || 'text',
    mimeType: 'text/plain',
    size: Buffer.byteLength(content, 'utf-8'),
    path: filePath,
    content,
    status: 'uploaded',
    cardIds: [],
    uploadedAt: Date.now(),
  }
  materials.set(id, { ...mat, projectId })
  res.json({ ok: true, data: mat })
})

/** GET /api/materials/:id/download — Download material file */
app.get('/api/materials/:id/download', (req, res) => {
  const mat = materials.get(req.params.id)
  if (!mat || !mat.path || !existsSync(mat.path)) {
    return res.status(404).json({ ok: false, error: 'Material not found' })
  }
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(mat.name)}"`)
  res.setHeader('Content-Type', mat.mimeType || 'application/octet-stream')
  createReadStream(mat.path).pipe(res)
})

// ══════════════════════════════════════════════
// Card Endpoints
// ══════════════════════════════════════════════

/** POST /api/cards — Create a card (JSON) */
app.post('/api/cards', (req, res) => {
  const { projectId, ...cardData } = req.body
  const id = cardData.id || randomUUID()
  const card = {
    id,
    kind: cardData.kind || 'text',
    title: cardData.title || '',
    content: cardData.content || '',
    sourceId: cardData.sourceId || null,
    linkedCardIds: cardData.linkedCardIds || [],
    meta: cardData.meta || {},
    tags: cardData.tags || [],
    priority: cardData.priority || 'medium',
    autoGenerated: false,
    rating: cardData.rating ?? 0,
    deckIds: cardData.deckIds || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...cardData,
  }
  cards.set(id, { ...card, projectId })
  res.json({ ok: true, data: card })
})

/** POST /api/cards/file — Create a file-based card (image/audio/video) */
app.post('/api/cards/file', cardFileUpload.single('file'), async (req, res) => {
  let cardData
  let projectId

  if (req.file) {
    // FormData upload with file
    try {
      cardData = JSON.parse(req.body.cardData || '{}')
    } catch {
      cardData = {}
    }
    projectId = req.body.projectId
  } else {
    // JSON body — create placeholder file
    cardData = { ...req.body }
    projectId = req.body.projectId
    delete cardData.projectId
  }

  const id = cardData.id || randomUUID()
  const kind = cardData.kind || 'image'

  // Determine file path and mime
  let filePath = undefined
  let fileMime = undefined

  if (req.file) {
    filePath = req.file.path
    fileMime = req.file.mimetype
  } else {
    // Create an empty placeholder file
    const extMap = {
      image: '.png',
      audio: '.mp3',
      video: '.mp4',
    }
    const ext = extMap[kind] || '.bin'
    const placeholderName = `${id}${ext}`
    filePath = join(CARD_FILES_DIR, placeholderName)
    fileMime =
      kind === 'image'
        ? 'image/png'
        : kind === 'audio'
          ? 'audio/mpeg'
          : kind === 'video'
            ? 'video/mp4'
            : 'application/octet-stream'
    // Write an empty placeholder
    await writeFile(filePath, Buffer.alloc(0))
  }

  const card = {
    id,
    kind,
    title: cardData.title || `${kind} card`,
    content: cardData.content || '',
    sourceId: cardData.sourceId || null,
    linkedCardIds: cardData.linkedCardIds || [],
    meta: cardData.meta || {},
    tags: cardData.tags || [],
    priority: cardData.priority || 'medium',
    autoGenerated: cardData.autoGenerated || false,
    rating: cardData.rating ?? 0,
    deckIds: cardData.deckIds || [],
    filePath,
    fileMime,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  cards.set(id, { ...card, projectId })
  res.json({ ok: true, data: card })
})

/** GET /api/cards/:id/file — Serve a card's file */
app.get('/api/cards/:id/file', (req, res) => {
  const card = cards.get(req.params.id)
  if (!card || !card.filePath || !existsSync(card.filePath)) {
    return res.status(404).json({ ok: false, error: 'Card file not found' })
  }
  res.setHeader('Content-Type', card.fileMime || 'application/octet-stream')
  // Allow inline display for images/audio/video
  res.setHeader('Content-Disposition', 'inline')
  createReadStream(card.filePath).pipe(res)
})

/** PATCH /api/cards/:id — Update card */
app.patch('/api/cards/:id', (req, res) => {
  const card = cards.get(req.params.id)
  if (!card) return res.status(404).json({ ok: false, error: 'Card not found' })
  Object.assign(card, req.body, { updatedAt: Date.now() })
  cards.set(req.params.id, card)
  res.json({ ok: true, data: card })
})

/** DELETE /api/cards/:id — Delete card */
app.delete('/api/cards/:id', (req, res) => {
  cards.delete(req.params.id)
  res.json({ ok: true })
})

/** POST /api/cards/link — Link two cards bidirectionally */
app.post('/api/cards/link', (req, res) => {
  const { cardId, targetId } = req.body
  const card = cards.get(cardId)
  const target = cards.get(targetId)
  if (card && !card.linkedCardIds.includes(targetId)) {
    card.linkedCardIds.push(targetId)
  }
  if (target && !target.linkedCardIds.includes(cardId)) {
    target.linkedCardIds.push(cardId)
  }
  res.json({ ok: true })
})

// ══════════════════════════════════════════════
// Deck CRUD Endpoints
// ══════════════════════════════════════════════

/** POST /api/decks — Create a new Deck */
app.post('/api/decks', (req, res) => {
  const { projectId, ...deckData } = req.body
  const id = deckData.id || randomUUID()
  const deck = {
    id,
    title: deckData.title || 'New Presentation',
    description: deckData.description || '',
    outline: [],
    theme: deckData.theme || null,
    pptxArtifacts: [],
    hasGenerated: false,
    autoCreatedReason: deckData.autoCreatedReason || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  decks.set(id, { ...deck, projectId })
  res.json({ ok: true, data: deck })
})

/** PATCH /api/decks/:id — Update a Deck */
app.patch('/api/decks/:id', (req, res) => {
  const deck = decks.get(req.params.id)
  if (!deck) return res.status(404).json({ ok: false, error: 'Deck not found' })
  Object.assign(deck, req.body, { updatedAt: Date.now() })
  decks.set(req.params.id, deck)
  res.json({ ok: true, data: deck })
})

/** DELETE /api/decks/:id — Delete a Deck */
app.delete('/api/decks/:id', (req, res) => {
  decks.delete(req.params.id)
  res.json({ ok: true })
})

/** GET /api/decks — List Decks for a project */
app.get('/api/decks', (req, res) => {
  const projectId = req.query.projectId
  const result = []
  for (const [, deck] of decks) {
    if (!projectId || deck.projectId === projectId) {
      result.push(deck)
    }
  }
  res.json({ ok: true, data: result })
})

// ══════════════════════════════════════════════
// Skills Endpoints
// ══════════════════════════════════════════════

/** GET /api/skills — List all skills */
app.get('/api/skills', (_req, res) => {
  const allSkills = Array.from(skills.values())
  res.json({ ok: true, data: allSkills })
})

/** GET /api/skills/:id — Get a single skill */
app.get('/api/skills/:id', (req, res) => {
  const skill = skills.get(req.params.id)
  if (!skill) return res.status(404).json({ ok: false, error: 'Skill not found' })
  res.json({ ok: true, data: skill })
})

/** POST /api/skills/:id/install — Install a skill */
app.post('/api/skills/:id/install', async (req, res) => {
  const skill = skills.get(req.params.id)
  if (!skill) return res.status(404).json({ ok: false, error: 'Skill not found' })

  // Mark as installing
  skill.status = 'installing'
  skills.set(req.params.id, skill)

  // Simulate installation (in real impl, would download/configure)
  setTimeout(() => {
    skill.status = 'installed'
    skills.set(req.params.id, skill)
  }, 1000)

  res.json({ ok: true, data: { ...skill, status: 'installing' } })
})

// ══════════════════════════════════════════════
// PPTX Artifact Endpoints (Deck-scoped)
// ══════════════════════════════════════════════

/** GET /api/artifacts/:deckId — List generated PPTX files for a Deck */
app.get('/api/artifacts/:deckId', (req, res) => {
  const deckDir = join(ARTIFACT_DIR, req.params.deckId)
  if (!existsSync(deckDir)) {
    return res.json({ ok: true, data: [] })
  }
  const files = readdirSync(deckDir)
    .filter((f) => f.endsWith('.pptx'))
    .map((f) => {
      const fpath = join(deckDir, f)
      const stats = statSync(fpath)
      return {
        filename: f,
        downloadUrl: `/api/download/${req.params.deckId}/${f}`,
        size: stats.size,
        createdAt: stats.mtimeMs,
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)

  res.json({ ok: true, data: files })
})

/** GET /api/download/:deckId/:filename? — Download PPTX */
app.get('/api/download/:deckId/:filename?', (req, res) => {
  const deckDir = join(ARTIFACT_DIR, req.params.deckId)
  let filePath

  if (req.params.filename) {
    filePath = join(deckDir, req.params.filename)
  } else {
    // Serve the latest pptx
    if (!existsSync(deckDir)) {
      return res.status(404).json({ ok: false, error: 'No artifacts' })
    }
    const files = readdirSync(deckDir)
      .filter((f) => f.endsWith('.pptx'))
      .map((f) => ({ name: f, time: statSync(join(deckDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    if (files.length === 0) {
      return res.status(404).json({ ok: false, error: 'No PPTX found' })
    }
    filePath = join(deckDir, files[0].name)
  }

  if (!existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'File not found' })
  }
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  )
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(req.params.filename || 'presentation.pptx')}"`,
  )
  createReadStream(filePath).pipe(res)
})

// ══════════════════════════════════════════════
// ACP (Agent Communication Protocol) Endpoint
// Unified SSE streaming endpoint for all Agent actions
// ══════════════════════════════════════════════

/**
 * POST /api/acp — Unified Agent Communication Protocol endpoint
 *
 * Body: { action, projectId, payload, sessionKey? }
 * Actions: curate, analyze, generate, update, analyze_material, research, smart_assign
 *
 * Proxies to OpenClaw agent via SSE and streams events back
 */
app.post('/api/acp', async (req, res) => {
  const { action, projectId, payload, sessionKey } = req.body

  if (!action || !projectId) {
    return res.status(400).json({ ok: false, error: 'Missing action or projectId' })
  }

  // Map ACP action to OpenClaw skill endpoint
  const skillMap = {
    curate: '/api/skills/curate/stream',
    analyze: '/api/skills/analyze/stream',
    generate: '/api/skills/generate/stream',
    update: '/api/skills/update/stream',
    analyze_material: '/api/skills/analyze-material/stream',
    research: '/api/skills/research/stream',
    smart_assign: '/api/skills/smart-assign/stream',
  }

  const skillPath = skillMap[action]
  if (!skillPath) {
    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  }

  // Enrich payload with material file contents where possible
  const enrichedPayload = { ...payload }
  if (payload.materials && Array.isArray(payload.materials)) {
    enrichedPayload.materials = await Promise.all(
      payload.materials.map(async (mat) => {
        const stored = materials.get(mat.id)
        if (!stored?.path) return { ...mat, path: stored?.path }

        // For text-based materials, include content
        if (stored.type === 'text' || stored.type === 'markdown' || stored.type === 'idea') {
          try {
            const content = await readFile(stored.path, 'utf-8')
            return { ...mat, content, path: stored.path }
          } catch {
            return { ...mat, path: stored.path }
          }
        }

        // For image materials, include file path and base64 data for AI analysis
        if (stored.type === 'image') {
          try {
            const imageBuffer = await readFile(stored.path)
            const base64 = imageBuffer.toString('base64')
            return {
              ...mat,
              path: stored.path,
              mimeType: stored.mimeType,
              imageBase64: base64,
              imageDataUrl: `data:${stored.mimeType};base64,${base64}`,
            }
          } catch {
            return { ...mat, path: stored.path }
          }
        }

        return { ...mat, path: stored.path }
      }),
    )
  }

  // Enrich with card file info
  if (payload.cards && Array.isArray(payload.cards)) {
    enrichedPayload.cards = payload.cards.map((card) => {
      const stored = cards.get(card.id)
      if (stored?.filePath) {
        return { ...card, filePath: stored.filePath, fileMime: stored.fileMime }
      }
      return card
    })
  }

  // Include skill definitions for research actions
  if (action === 'research' && payload.angles) {
    enrichedPayload.availableSkills = Array.from(skills.values())
      .filter((s) => s.status === 'installed')
      .map((s) => ({ id: s.id, name: s.name, category: s.category, description: s.description }))
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const targetUrl = `${OPENCLAW_URL}${skillPath}`

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionKey ? { 'X-Session-Key': sessionKey } : {}),
      },
      body: JSON.stringify({
        projectId,
        action,
        ...enrichedPayload,
      }),
    })

    if (!response.ok) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: `OpenClaw error: ${response.status} ${response.statusText}` })}\n\n`,
      )
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    if (!response.body) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: 'No response body from OpenClaw' })}\n\n`,
      )
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // Stream SSE from OpenClaw → client
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          res.write(chunk)

          // Post-process: when a card event has file_card kind, store it
          // This allows the Agent to create file cards via SSE
          try {
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ') && line.length > 6) {
                const payload = line.slice(6)
                if (payload === '[DONE]') continue
                const evt = JSON.parse(payload)
                if (evt.type === 'card') {
                  const cardObj = JSON.parse(evt.data)
                  if (
                    ['image', 'audio', 'video'].includes(cardObj.kind) &&
                    !cards.has(cardObj.id)
                  ) {
                    // Auto-create file placeholder for file-type cards from Agent
                    const extMap = { image: '.png', audio: '.mp3', video: '.mp4' }
                    const ext = extMap[cardObj.kind] || '.bin'
                    const fp = join(CARD_FILES_DIR, `${cardObj.id}${ext}`)
                    if (!existsSync(fp)) {
                      await writeFile(fp, Buffer.alloc(0))
                    }
                    cardObj.filePath = fp
                    cardObj.fileMime =
                      cardObj.kind === 'image'
                        ? 'image/png'
                        : cardObj.kind === 'audio'
                          ? 'audio/mpeg'
                          : 'video/mp4'
                    cards.set(cardObj.id, { ...cardObj, projectId })
                  } else if (!cards.has(cardObj.id)) {
                    cards.set(cardObj.id, { ...cardObj, projectId })
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors during post-processing
          }
        }
      } catch (err) {
        console.error('[ACP] Stream error:', err.message)
      } finally {
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n')
          res.end()
        }
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      reader.cancel().catch(() => {})
    })

    await pump()
  } catch (err) {
    console.error('[ACP] Connection error:', err.message)
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: `Connection failed: ${err.message}` })}\n\n`,
      )
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
})

// ══════════════════════════════════════════════
// Project State Persistence — Save/Load as JSON
// ⚠️  MUST be registered BEFORE the SPA fallback
// ══════════════════════════════════════════════

const DATA_DIR = resolve(process.env.DATA_DIR || './data')
const PROJECTS_DIR = join(DATA_DIR, 'projects')
for (const dir of [DATA_DIR, PROJECTS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
const PROJECT_STATE_FILE = join(PROJECTS_DIR, 'state.json')
const SETTINGS_FILE = join(PROJECTS_DIR, 'settings.json')
let projectSaveTimer = null

async function saveProjectState(state) {
  try {
    await writeFile(PROJECT_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Persist] Failed to save project state:', err.message)
  }
}

async function loadProjectState() {
  try {
    if (existsSync(PROJECT_STATE_FILE)) {
      return JSON.parse(await readFile(PROJECT_STATE_FILE, 'utf-8'))
    }
  } catch (err) {
    console.error('[Persist] Failed to load project state:', err.message)
  }
  return null
}

app.get('/api/project', async (_req, res) => {
  const state = await loadProjectState()
  if (state) {
    res.json({ ok: true, data: state })
  } else {
    res.json({ ok: false, data: null })
  }
})

app.put('/api/project', async (req, res) => {
  const state = req.body
  if (!state || !state.project) {
    return res.status(400).json({ ok: false, error: 'Invalid state' })
  }
  if (projectSaveTimer) clearTimeout(projectSaveTimer)
  projectSaveTimer = setTimeout(() => saveProjectState(state), 500)
  await saveProjectState(state)
  res.json({ ok: true })
})

app.delete('/api/project', async (_req, res) => {
  try {
    if (existsSync(PROJECT_STATE_FILE)) {
      const { unlink } = await import('node:fs/promises')
      await unlink(PROJECT_STATE_FILE)
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Settings persistence
app.get('/api/settings', async (_req, res) => {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'))
      res.json({ ok: true, data })
    } else {
      res.json({ ok: true, data: { userSettings: {}, pptSettings: {} } })
    }
  } catch {
    res.json({ ok: true, data: { userSettings: {}, pptSettings: {} } })
  }
})

app.put('/api/settings', async (req, res) => {
  try {
    await writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2), 'utf-8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ══════════════════════════════════════════════
// Static file serving (production)
// ══════════════════════════════════════════════

const DIST_DIR = resolve('./dist')
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get('*', (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'))
  })
}

// ══════════════════════════════════════════════
// Start
// ══════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`✅ SlideForge v6 server listening on http://localhost:${PORT}`)
  console.log(`   OpenClaw target: ${OPENCLAW_URL}`)
  console.log(`   Uploads: ${UPLOAD_DIR}`)
  console.log(`   Artifacts: ${ARTIFACT_DIR}`)
  console.log(`   Card files: ${CARD_FILES_DIR}`)
  console.log(`   Skills: ${SKILLS_DIR}`)
  console.log(`   Builtin skills: ${skills.size}`)
  console.log(`   State file: ${PROJECT_STATE_FILE}`)
})

// ── Helpers ──

function detectType(filename, mimeType) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mimeMap = {
    'application/pdf': 'pdf',
    'text/plain': 'text',
    'text/markdown': 'markdown',
    'text/csv': 'csv',
    'application/json': 'json',
  }
  if (mimeMap[mimeType]) return mimeMap[mimeType]
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'
  const extMap = {
    pdf: 'pdf',
    txt: 'text',
    md: 'markdown',
    csv: 'csv',
    json: 'json',
    pptx: 'pptx',
    ppt: 'pptx',
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    bmp: 'image',
    mp3: 'audio',
    wav: 'audio',
    ogg: 'audio',
    flac: 'audio',
    aac: 'audio',
    m4a: 'audio',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    webm: 'video',
    py: 'code',
    js: 'code',
    ts: 'code',
    jsx: 'code',
    tsx: 'code',
    html: 'code',
    css: 'code',
    sql: 'code',
    yaml: 'code',
    yml: 'code',
  }
  return extMap[ext] || 'unknown'
}
