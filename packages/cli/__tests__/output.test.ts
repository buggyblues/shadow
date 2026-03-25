import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { output, outputError, outputSuccess } from '../src/utils/output.js'

describe('output utils', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('output', () => {
    it('should output JSON when json option is true', () => {
      const data = { id: '123', name: 'test' }
      output(data, { json: true })
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2))
    })

    it('should output string directly', () => {
      output('hello world', { json: false })
      expect(consoleLogSpy).toHaveBeenCalledWith('hello world')
    })

    it('should output array in list format', () => {
      const data = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ]
      output(data, { json: false })
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should output object in key-value format', () => {
      const data = { id: '123', name: 'test', active: true }
      output(data, { json: false })
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should handle null/undefined', () => {
      output(null, { json: false })
      output(undefined, { json: false })
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('outputError', () => {
    it('should output JSON error when json option is true', () => {
      outputError('something went wrong', { json: true })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: 'something went wrong' }, null, 2),
      )
    })

    it('should output colored error to stderr when json is false', () => {
      outputError('something went wrong', { json: false })
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('outputSuccess', () => {
    it('should output JSON success when json option is true', () => {
      outputSuccess('operation completed', { json: true })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ success: true, message: 'operation completed' }, null, 2),
      )
    })

    it('should output colored success when json is false', () => {
      outputSuccess('operation completed', { json: false })
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })
})
