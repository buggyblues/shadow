/**
 * CLI Interface — registers all commands on the Commander program.
 *
 * This is the thin interface layer. Each command only:
 * 1. Defines options and arguments
 * 2. Parses and validates input
 * 3. Delegates to the service container
 * 4. Handles output formatting and process.exit
 */

import chalk from 'chalk'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'
import { loadEnvFiles } from '../../utils/env.js'
import { createBuildCommand } from './build.command.js'
import { createConsoleCommand } from './dashboard.command.js'
import { createDoctorCommand } from './doctor.command.js'
import { createDownCommand } from './down.command.js'
import { createGenerateCommand } from './generate.command.js'
import { createImagesCommand } from './images.command.js'
import { createInitCommand } from './init.command.js'
import { createLogsCommand } from './logs.command.js'
import { createOnboardCommand } from './onboard.command.js'
import { createProvisionCommand } from './provision.command.js'
import { createScaleCommand } from './scale.command.js'
import { createServeCommand } from './serve.command.js'
import { createStatusCommand } from './status.command.js'
import { createUpCommand } from './up.command.js'
import { createValidateCommand } from './validate.command.js'

/**
 * Create the CLI program with all commands registered.
 */
export function createCLI(container: ServiceContainer): Command {
  const program = new Command()

  program
    .name('shadowob-cloud')
    .description('shadowob-cloud — deploy AI agents to Kubernetes')
    .version('1.0.0')
    .option('--env-file <paths...>', 'Load environment variables from file(s) (default: .env)')
    .configureHelp({ sortSubcommands: true })
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts<{ envFile?: string[] }>()
      try {
        const loaded = loadEnvFiles(opts.envFile)
        if (loaded.length > 0 && process.env.SHADOWOB_VERBOSE) {
          for (const f of loaded) {
            console.error(chalk.dim(`Loaded env: ${f}`))
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error loading env file: ${(err as Error).message}`))
        process.exit(1)
      }
    })

  program.addCommand(createUpCommand(container))
  program.addCommand(createBuildCommand(container))
  program.addCommand(createDownCommand(container))
  program.addCommand(createStatusCommand(container))
  program.addCommand(createLogsCommand(container))
  program.addCommand(createScaleCommand(container))
  program.addCommand(createInitCommand(container))
  program.addCommand(createServeCommand(container))
  program.addCommand(createConsoleCommand(container))
  program.addCommand(createValidateCommand(container))
  program.addCommand(createImagesCommand(container))
  program.addCommand(createProvisionCommand(container))
  program.addCommand(createGenerateCommand(container))
  program.addCommand(createDoctorCommand(container))
  program.addCommand(createOnboardCommand(container))

  return program
}
