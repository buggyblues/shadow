import { defineSetupPluginEntry } from 'openclaw/plugin-sdk/core'
import { shadowPlugin } from './src/channel.js'

export default defineSetupPluginEntry(shadowPlugin)
