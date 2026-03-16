import { describe, expect, it } from 'vitest'
import { formatDate, generateInviteCode, isValidEmail, slugify } from '../src/utils'

describe('generateInviteCode', () => {
  it('should generate a string of length 8', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(8)
  })

  it('should only contain alphanumeric characters', () => {
    const code = generateInviteCode()
    expect(code).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('should generate unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
    expect(codes.size).toBe(100)
  })
})

describe('formatDate', () => {
  it('should format a Date object to ISO string', () => {
    const date = new Date('2024-01-15T12:30:00Z')
    expect(formatDate(date)).toBe('2024-01-15T12:30:00.000Z')
  })

  it('should format a date string to ISO string', () => {
    const result = formatDate('2024-01-15T12:30:00Z')
    expect(result).toBe('2024-01-15T12:30:00.000Z')
  })

  it('should handle various date string formats', () => {
    const result = formatDate('2024-01-15')
    expect(result).toContain('2024-01-15')
  })
})

describe('isValidEmail', () => {
  it('should return true for valid emails', () => {
    expect(isValidEmail('user@shadowob.com')).toBe(true)
    expect(isValidEmail('first.last@domain.org')).toBe(true)
    expect(isValidEmail('user+tag@sub.domain.com')).toBe(true)
  })

  it('should return false for invalid emails', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('user')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('@domain.com')).toBe(false)
    expect(isValidEmail('user @domain.com')).toBe(false)
    expect(isValidEmail('user@domain')).toBe(false)
  })
})

describe('slugify', () => {
  it('should convert text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('should replace special characters with hyphens', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })

  it('should trim leading/trailing hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
    expect(slugify('---hello---')).toBe('hello')
  })

  it('should handle multiple consecutive special characters', () => {
    expect(slugify('hello...world')).toBe('hello-world')
  })

  it('should keep numbers', () => {
    expect(slugify('Version 2.0')).toBe('version-2-0')
  })

  it('should handle empty string', () => {
    expect(slugify('')).toBe('')
  })
})
