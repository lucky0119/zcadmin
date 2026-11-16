import { config, validateConfig } from './config.mjs'
import { createAppServer } from './routes.mjs'

validateConfig()

const server = createAppServer()

server.listen(config.port, config.host, () => {
  console.info(`Asset server listening at http://${config.host}:${config.port}`)
  console.info(
    config.useFileStorage
      ? `Persistent data file: ${config.dataFile}`
      : 'Persistent storage: MySQL',
  )
})
