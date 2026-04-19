// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — Typia Validators
//
// Runtime validation powered by typia.
// Import and call these to validate data at system boundaries.
// ═══════════════════════════════════════════════════════════════

import typia from 'typia'
import type { CardRecord, DeckRecord, MaterialRecord, SkillRecord } from './records.js'
import type { AppSettings, UserSettings } from './settings.js'

// ── Card ──

export const validateCard = typia.createValidate<CardRecord>()
export const isCard = typia.createIs<CardRecord>()
export const assertCard = typia.createAssert<CardRecord>()

// ── Material ──

export const validateMaterial = typia.createValidate<MaterialRecord>()
export const isMaterial = typia.createIs<MaterialRecord>()
export const assertMaterial = typia.createAssert<MaterialRecord>()

// ── Deck ──

export const validateDeck = typia.createValidate<DeckRecord>()
export const isDeck = typia.createIs<DeckRecord>()
export const assertDeck = typia.createAssert<DeckRecord>()

// ── Skill ──

export const validateSkill = typia.createValidate<SkillRecord>()
export const isSkill = typia.createIs<SkillRecord>()

// ── Settings ──

export const validateUserSettings = typia.createValidate<UserSettings>()
export const validateAppSettings = typia.createValidate<AppSettings>()

// ── Partial updates ──

export const validatePartialCard = typia.createValidate<Partial<CardRecord>>()
export const validatePartialDeck = typia.createValidate<Partial<DeckRecord>>()
