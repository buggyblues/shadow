import { DesktopApplicationService } from './services/desktop-application.service'
import { loggerService } from './services/logger.service'

loggerService.install()

process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') {
    loggerService.write('warn', '[uncaughtException]', err)
    return
  }
  loggerService.write('error', '[uncaughtException]', err)
  throw err
})

new DesktopApplicationService().start()
