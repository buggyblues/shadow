import * as cheerio from 'cheerio'
import { type TrainerAccess, upsertChallenge } from './data.js'
import type { Challenge, ChallengeDifficulty } from './types.js'

type SourceProvider = 'leetcode' | 'codeforces'

interface LeetCodeListProblem {
  acRate?: number
  difficulty?: string
  questionFrontendId?: string
  title?: string
  titleSlug?: string
  topicTags?: Array<{ name?: string; slug?: string }>
  isPaidOnly?: boolean
}

interface LeetCodeProblemsResponse {
  totalQuestions?: number
  count?: number
  problemsetQuestionList?: LeetCodeListProblem[]
}

interface LeetCodeProblemDetail {
  link?: string
  questionId?: string
  questionFrontendId?: string
  questionTitle?: string
  titleSlug?: string
  difficulty?: string
  isPaidOnly?: boolean
  question?: string
  exampleTestcases?: string
  topicTags?: Array<{ name?: string; slug?: string }>
  hints?: string[]
}

interface CodeforcesProblem {
  contestId?: number
  index: string
  name: string
  type?: string
  rating?: number
  points?: number
  tags?: string[]
}

interface CodeforcesProblemStatistics {
  contestId?: number
  index: string
  solvedCount?: number
}

interface CodeforcesProblemsetResponse {
  status: string
  comment?: string
  result?: {
    problems?: CodeforcesProblem[]
    problemStatistics?: CodeforcesProblemStatistics[]
  }
}

const leetcodeApiBase = (
  process.env.LEETCODE_API_BASE_URL ?? 'https://alfa-leetcode-api.onrender.com'
).replace(/\/+$/, '')
const codeforcesApiBase = (
  process.env.CODEFORCES_API_BASE_URL ?? 'https://codeforces.com/api'
).replace(/\/+$/, '')
const codeforcesMirrorBase = (
  process.env.CODEFORCES_MIRROR_BASE_URL ?? 'https://mirror.codeforces.com'
).replace(/\/+$/, '')

let codeforcesProblemsetCache: Promise<Required<CodeforcesProblemsetResponse>['result']> | null =
  null

function titleFromSlug(value: string) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function identifierFromSlug(value: string) {
  const parts = value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const candidate = parts
    .map((part, index) =>
      index === 0
        ? part.slice(0, 1).toLowerCase() + part.slice(1)
        : part.slice(0, 1).toUpperCase() + part.slice(1),
    )
    .join('')
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(candidate) ? candidate : 'solve'
}

function difficultyFromText(value: string | undefined): ChallengeDifficulty {
  const normalized = value?.toLowerCase()
  if (normalized === 'hard') return 'hard'
  if (normalized === 'medium') return 'medium'
  return 'easy'
}

function difficultyFromCodeforces(problem: CodeforcesProblem): ChallengeDifficulty {
  const rating = problem.rating ?? problem.points
  if (!rating) return 'medium'
  if (rating <= 1200) return 'easy'
  if (rating <= 1900) return 'medium'
  return 'hard'
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function htmlFragmentToPlainText(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, '^$1')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/p>|<br\s*\/?>|<\/div>|<\/ul>|<\/ol>|<\/pre>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+\n/g, '\n'),
  )
    .replace(/^\s+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlToPlainText(value: string) {
  return htmlFragmentToPlainText(
    value
      .replace(/<p>\s*<strong[^>]*class="example"[^>]*>Example\s+\d+:<\/strong>\s*<\/p>/gi, '')
      .replace(/<pre[\s\S]*?<\/pre>/gi, ''),
  )
}

function parseLeetCodeExamples(questionHtml: string): Challenge['examples'] {
  const examples: Challenge['examples'] = []
  const preBlocks = questionHtml.match(/<pre[\s\S]*?<\/pre>/gi) ?? []
  for (const [index, block] of preBlocks.entries()) {
    const text = htmlFragmentToPlainText(block)
    const input = text.match(/Input:\s*([\s\S]*?)(?:\nOutput:|$)/i)?.[1]?.trim()
    const output = text.match(/Output:\s*([\s\S]*?)(?:\nExplanation:|$)/i)?.[1]?.trim()
    const explanation = text.match(/Explanation:\s*([\s\S]*)/i)?.[1]?.trim()
    if (!input || !output) continue
    examples.push({
      input,
      output,
      ...(explanation ? { explanation } : { explanation: `LeetCode example ${index + 1}` }),
    })
  }
  return examples.slice(0, 10)
}

function problemFunctionStarter(sourceId: string) {
  return `function ${identifierFromSlug(sourceId)}(...args) {\n  // Write your solution here.\n}`
}

async function fetchOptionalText(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'shadow-trainer',
      },
    })
    return response.ok ? response.text() : ''
  } catch {
    return ''
  }
}

async function fetchOptionalHtml(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'shadow-trainer',
      },
    })
    return response.ok ? response.text() : ''
  } catch {
    return ''
  }
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json, application/json',
      'User-Agent': 'shadow-trainer',
    },
  })
  if (!response.ok) throw new Error(`source_fetch_failed:${response.status}`)
  return (await response.json()) as T
}

async function fetchCodeforcesProblemset() {
  codeforcesProblemsetCache ??= fetchJson<CodeforcesProblemsetResponse>(
    `${codeforcesApiBase}/problemset.problems`,
  ).then((payload) => {
    if (payload.status !== 'OK' || !payload.result?.problems) {
      throw new Error(payload.comment || 'codeforces_fetch_failed')
    }
    return payload.result
  })
  return codeforcesProblemsetCache
}

function normalizeCodeforcesText(value: string) {
  return value
    .replace(/\${3,}/g, '')
    .replace(/\\leq/g, '<=')
    .replace(/\\geq/g, '>=')
    .replace(/\\le(?![a-zA-Z])/g, '<=')
    .replace(/\\ge(?![a-zA-Z])/g, '>=')
    .replace(/\\lt/g, '<')
    .replace(/\\gt/g, '>')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeCodeforcesSample(value: string) {
  return normalizeCodeforcesText(htmlFragmentToPlainText(value))
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function parseCodeforcesStatement(html: string, statementUrl: string) {
  const $ = cheerio.load(html)
  const statement = $('.problem-statement').first()
  if (!statement.length) return null

  statement.find('script, style').remove()
  const plainSectionText = (selector: string) => {
    const section = statement.children(selector).first().clone()
    if (!section.length) return ''
    section.find('.section-title, .title').remove()
    return normalizeCodeforcesText(htmlFragmentToPlainText(section.html() ?? ''))
  }

  const bodyHtml = statement
    .children()
    .filter((_, element) => {
      const classes = new Set(($(element).attr('class') ?? '').split(/\s+/).filter(Boolean))
      return ![
        'header',
        'input-specification',
        'output-specification',
        'sample-tests',
        'note',
      ].some((className) => classes.has(className))
    })
    .toArray()
    .map((element) => $.html(element))
    .join('\n')

  const intro = normalizeCodeforcesText(htmlFragmentToPlainText(bodyHtml))
  const input = plainSectionText('.input-specification')
  const output = plainSectionText('.output-specification')
  const note = plainSectionText('.note')
  const examples: Challenge['examples'] = []

  statement.find('.sample-tests .sample-test').each((index, element) => {
    const sample = $(element)
    const inputText = normalizeCodeforcesSample(sample.find('.input pre').first().html() ?? '')
    const outputText = normalizeCodeforcesSample(sample.find('.output pre').first().html() ?? '')
    if (!inputText || !outputText) return
    examples.push({
      input: inputText,
      output: outputText,
      explanation: `Codeforces sample ${index + 1}`,
    })
  })

  const prompt = [
    intro,
    input ? `## Input\n${input}` : '',
    output ? `## Output\n${output}` : '',
    note ? `## Note\n${note}` : '',
    `Source: ${statementUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  if (!intro && !input && !output) return null
  return { examples, prompt, statementUrl }
}

async function fetchCodeforcesStatement(problem: CodeforcesProblem) {
  if (!problem.contestId) return null
  const candidates = [
    `${codeforcesMirrorBase}/problemset/problem/${problem.contestId}/${problem.index}?locale=en`,
    `${codeforcesMirrorBase}/contest/${problem.contestId}/problem/${problem.index}?locale=en`,
  ]
  for (const url of candidates) {
    const html = await fetchOptionalHtml(url)
    if (!html) continue
    const statement = parseCodeforcesStatement(html, url)
    if (statement) return statement
  }
  return null
}

export async function searchExternalChallenges(input: {
  provider?: SourceProvider
  query?: string
  limit?: number
  offset?: number
}) {
  const provider = input.provider ?? 'leetcode'
  const query = input.query?.trim().toLowerCase()
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 50)
  const offset = Math.max(input.offset ?? 0, 0)
  if (provider === 'leetcode') {
    const url = new URL(`${leetcodeApiBase}/problems`)
    url.searchParams.set(
      'limit',
      String(query ? Math.min(Math.max(offset + limit, 100), 500) : limit),
    )
    if (!query && offset > 0) url.searchParams.set('skip', String(offset))
    const payload = await fetchJson<LeetCodeProblemsResponse>(url.toString())
    const filtered = (payload.problemsetQuestionList ?? [])
      .filter((problem) => !problem.isPaidOnly)
      .filter((problem) => {
        const tags = problem.topicTags?.map((tag) => tag.slug || tag.name || '').join(' ') ?? ''
        const haystack = [problem.title, problem.titleSlug, problem.questionFrontendId, tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return !query || haystack.includes(query)
      })
    const page = query ? filtered.slice(offset, offset + limit) : filtered.slice(0, limit)
    const total = query ? filtered.length : (payload.totalQuestions ?? filtered.length)
    const sources = page
      .map((problem) => ({
        provider,
        id: problem.titleSlug ?? problem.title ?? '',
        title: problem.title ?? titleFromSlug(problem.titleSlug ?? 'leetcode-problem'),
        difficulty: difficultyFromText(problem.difficulty),
        description: [
          problem.questionFrontendId ? `#${problem.questionFrontendId}` : '',
          typeof problem.acRate === 'number' ? `${problem.acRate.toFixed(1)}% acceptance` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        url: problem.titleSlug ? `https://leetcode.com/problems/${problem.titleSlug}` : undefined,
      }))
      .filter((source) => source.id)
    return { sources, pageInfo: pageInfo(offset, limit, total, sources.length) }
  }

  if (provider === 'codeforces') {
    const problemset = await fetchCodeforcesProblemset()
    const statsById = new Map(
      (problemset.problemStatistics ?? []).map((stat) => [
        `${stat.contestId ?? 'problemset'}-${stat.index}`,
        stat,
      ]),
    )
    const filtered = (problemset.problems ?? []).filter((problem) => {
      const haystack = [
        problem.contestId,
        problem.index,
        problem.contestId ? `${problem.contestId}${problem.index}` : undefined,
        problem.name,
        problem.rating,
        ...(problem.tags ?? []),
      ]
        .filter((value) => value !== undefined)
        .join(' ')
        .toLowerCase()
      return !query || haystack.includes(query)
    })
    const sources = filtered.slice(offset, offset + limit).map((problem) => {
      const sourceId = `${problem.contestId ?? 'problemset'}-${problem.index}`
      const stat = statsById.get(`${problem.contestId ?? 'problemset'}-${problem.index}`)
      return {
        provider,
        id: sourceId,
        title: `${problem.contestId ?? 'Problemset'}${problem.index}. ${problem.name}`,
        difficulty: difficultyFromCodeforces(problem),
        description: [
          problem.rating ? `${problem.rating} rating` : '',
          stat?.solvedCount ? `${stat.solvedCount} solves` : '',
          ...(problem.tags ?? []).slice(0, 3),
        ]
          .filter(Boolean)
          .join(' · '),
        url: codeforcesProblemUrl(problem),
      }
    })
    return { sources, pageInfo: pageInfo(offset, limit, filtered.length, sources.length) }
  }

  throw new Error('unsupported_source_provider')
}

function pageInfo(offset: number, limit: number, total: number, pageSize: number) {
  return {
    offset,
    limit,
    total,
    hasMore: offset + pageSize < total,
  }
}

export async function importExternalChallenge(
  input: {
    provider?: SourceProvider
    sourceId: string
  },
  access: TrainerAccess,
) {
  const provider = input.provider ?? 'leetcode'
  const sourceId = input.sourceId.trim()

  if (provider === 'leetcode') {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(sourceId)) throw new Error('invalid_source_id')
    const detail = await fetchJson<LeetCodeProblemDetail>(
      `${leetcodeApiBase}/select?titleSlug=${encodeURIComponent(sourceId)}`,
    )
    if (!detail.questionTitle || !detail.question) throw new Error('leetcode_problem_not_found')
    if (detail.isPaidOnly) throw new Error('leetcode_paid_problem_not_importable')
    const examples = parseLeetCodeExamples(detail.question)
    const testCases = examples.map((example, index) => ({
      id: `example_${index + 1}`,
      input: example.input,
      expected: example.output,
      visibility: 'visible' as const,
    }))
    const challenge = upsertChallenge(
      {
        id: `leetcode_${sourceId}`,
        title: detail.questionTitle,
        difficulty: difficultyFromText(detail.difficulty),
        tags: [
          'leetcode',
          'imported',
          ...(detail.topicTags ?? []).map((tag) => tag.slug || tag.name || '').filter(Boolean),
        ].slice(0, 12),
        prompt: htmlToPlainText(detail.question),
        starterCode: problemFunctionStarter(sourceId),
        examples: examples.length
          ? examples
          : [
              {
                input: detail.exampleTestcases || 'See source problem statement',
                output: 'Buddy should derive expected output from the source statement.',
              },
            ],
        testCases,
        judgeInstructions: [
          'Imported from alfa-leetcode-api selected problem endpoint.',
          'Use visible examples from the statement for initial sandbox checks.',
          'Do not expose official solutions in learner feedback.',
          'If additional edge cases are needed, derive them from the constraints and explain them.',
          detail.hints?.length
            ? `Source hints available for Buddy coaching: ${detail.hints.map(htmlFragmentToPlainText).join(' ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        source: {
          provider,
          id: sourceId,
          url: detail.link || `https://leetcode.com/problems/${sourceId}`,
          importedAt: new Date().toISOString(),
        },
      },
      access,
    )
    return { challenge }
  }

  if (provider === 'codeforces') {
    const problemset = await fetchCodeforcesProblemset()
    const problem = (problemset.problems ?? []).find(
      (item) => `${item.contestId ?? 'problemset'}-${item.index}` === sourceId,
    )
    if (!problem) throw new Error('codeforces_problem_not_found')
    const importedStatement = await fetchCodeforcesStatement(problem)
    const examples = importedStatement?.examples ?? []
    const testCases = examples.map((example, index) => ({
      id: `sample_${index + 1}`,
      input: example.input,
      expected: example.output,
      visibility: 'visible' as const,
    }))
    const challenge = upsertChallenge(
      {
        id: `codeforces_${sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        title: `${problem.contestId ?? 'Problemset'}${problem.index}. ${problem.name}`,
        difficulty: difficultyFromCodeforces(problem),
        tags: ['codeforces', 'imported', ...(problem.tags ?? [])].slice(0, 12),
        prompt:
          importedStatement?.prompt ??
          [
            `${problem.name} was imported from Codeforces metadata, but the statement page could not be reached from this server.`,
            '',
            'The official Codeforces API exposes metadata, tags, rating, and solve counts. It does not include the problem statement or sample tests.',
            `Open the source problem for the full statement: ${codeforcesProblemUrl(problem)}`,
          ].join('\n'),
        starterCode:
          'function solve(input) {\n  // Parse Codeforces stdin and write your solution here.\n}',
        examples,
        testCases,
        judgeInstructions: [
          importedStatement
            ? 'Imported from Codeforces problemset metadata and mirror statement HTML.'
            : 'Imported from Codeforces problemset metadata only; statement fetch failed.',
          examples.length
            ? 'Use imported sample tests for visible sandbox checks.'
            : 'No sample tests were imported. Ask the learner to paste samples before sandbox validation.',
          'Buddy should generate additional hidden edge cases from the constraints and explain why each case matters.',
          'Do not expose official solutions in learner feedback.',
          problem.rating ? `Problem rating: ${problem.rating}.` : '',
          problem.tags?.length ? `Tags: ${problem.tags.join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        source: {
          provider,
          id: sourceId,
          url: importedStatement?.statementUrl ?? codeforcesProblemUrl(problem),
          importedAt: new Date().toISOString(),
        },
      },
      access,
    )
    return { challenge }
  }

  throw new Error('unsupported_source_provider')
}

export async function refreshImportedCodeforcesChallenge(
  challenge: Challenge,
  access: TrainerAccess,
) {
  if (challenge.source?.provider !== 'codeforces') return null
  const metadataOnly =
    challenge.prompt.includes('Codeforces API exposes problem metadata') ||
    challenge.prompt.includes('Paste or derive sample input') ||
    (challenge.examples.length === 0 && !challenge.prompt.includes('## Input'))
  if (!metadataOnly) return null

  try {
    const result = await importExternalChallenge(
      {
        provider: 'codeforces',
        sourceId: challenge.source.id,
      },
      access,
    )
    return result.challenge
  } catch {
    return null
  }
}

function codeforcesProblemUrl(problem: CodeforcesProblem) {
  if (problem.contestId) {
    return `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`
  }
  return 'https://codeforces.com/problemset'
}
