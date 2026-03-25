import { Command } from 'commander'
import { configManager } from '../config/manager.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createConfigCommand(): Command {
  const config = new Command('config').description('Configuration management commands')

  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      console.log(configManager.getConfigPath())
    })

  config
    .command('validate')
    .description('Validate configuration file')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const result = await configManager.validate()
        const outputOpts: OutputOptions = { json: options.json }

        if (options.json) {
          output(result, outputOpts)
          process.exit(result.valid ? 0 : 1)
          return
        }

        if (result.valid) {
          outputSuccess('Configuration is valid', outputOpts)
          if (result.warnings.length > 0) {
            console.log('\nWarnings:')
            for (const warning of result.warnings) {
              console.log(`  - ${warning}`)
            }
          }
          process.exit(0)
        } else {
          outputError('Configuration is invalid', outputOpts)
          if (result.errors.length > 0) {
            console.log('\nErrors:')
            for (const error of result.errors) {
              console.log(`  - ${error}`)
            }
          }
          if (result.warnings.length > 0) {
            console.log('\nWarnings:')
            for (const warning of result.warnings) {
              console.log(`  - ${warning}`)
            }
          }
          process.exit(1)
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  config
    .command('fix')
    .description('Fix common configuration issues')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const result = await configManager.fix()
        const outputOpts: OutputOptions = { json: options.json }

        if (options.json) {
          output(result, outputOpts)
          process.exit(0)
          return
        }

        if (result.fixed) {
          outputSuccess('Configuration fixed', outputOpts)
          console.log('\nChanges:')
          for (const change of result.changes) {
            console.log(`  - ${change}`)
          }
        } else {
          outputSuccess('No issues found', outputOpts)
        }
        process.exit(0)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return config
}
