import { createCLI } from './interfaces/cli/index.js'
import { createContainer } from './services/container.js'

const container = createContainer()
const program = createCLI(container)

program.parse()
