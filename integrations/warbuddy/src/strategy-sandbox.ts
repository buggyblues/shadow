import vm from 'node:vm'
import type { WarbuddyRules } from './rules.js'

export function hasStrategyCode(code: string) {
  return code.trim().length > 0
}

export class ScriptBrain {
  private readonly timeoutMs: number
  private readonly context: vm.Context
  private readonly callScript = new vm.Script(
    `(() => {
      const hasUnitHandlers =
        typeof onTankIdle === "function" || typeof onEngineerIdle === "function";
      if (hasUnitHandlers) {
        if (typeof onTankIdle === "function") onTankIdle(__me.tank, __enemy, __game, __me);
        if (typeof onEngineerIdle === "function" && __me.engineer) {
          onEngineerIdle(__me.engineer, __enemy, __game, __me);
        }
      } else if (typeof onIdle === "function") {
        onIdle(__me, __enemy, __game);
      }
    })();`,
  )
  readonly compileError: string | null

  constructor(
    code: string,
    rules: WarbuddyRules,
    private readonly onSpeech: (text: string) => void,
    private readonly onPrint: (args: unknown[]) => void,
  ) {
    this.timeoutMs = rules.script.timeoutMs
    const raw = Buffer.byteLength(code, 'utf8') > rules.script.maxBytes ? '' : code
    this.context = vm.createContext({
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      JSON,
      Date: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      print: (...args: unknown[]) => this.onPrint(args),
      speak: (text: unknown) => this.onSpeech(String(text ?? '')),
    })

    if (!raw) {
      this.compileError = 'script_too_large'
      return
    }
    if (rules.script.blockedTokens.test(raw)) {
      this.compileError = 'script_uses_blocked_global'
      return
    }

    try {
      new vm.Script(
        `"use strict";\n${raw}\n;(() => {
          if (typeof onIdle !== "undefined" && typeof onIdle !== "function") {
            throw new Error("invalid_onIdle");
          }
          if (typeof onTankIdle !== "undefined" && typeof onTankIdle !== "function") {
            throw new Error("invalid_onTankIdle");
          }
          if (typeof onEngineerIdle !== "undefined" && typeof onEngineerIdle !== "function") {
            throw new Error("invalid_onEngineerIdle");
          }
        })();`,
      ).runInContext(this.context, { timeout: this.timeoutMs })
      this.compileError = null
    } catch (error) {
      this.compileError = error instanceof Error ? error.message : String(error)
    }
  }

  run(me: unknown, enemy: unknown, game: unknown) {
    ;(this.context as Record<string, unknown>).__me = me
    ;(this.context as Record<string, unknown>).__enemy = enemy
    ;(this.context as Record<string, unknown>).__game = game
    const started = performance.now()
    try {
      this.callScript.runInContext(this.context, { timeout: this.timeoutMs })
      return { ok: true as const, runtimeMs: performance.now() - started }
    } catch (error) {
      return {
        ok: false as const,
        runtimeMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
