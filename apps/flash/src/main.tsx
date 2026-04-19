import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App'
import { isPlaygroundMode, Playground } from './components/Playground'

const Root = isPlaygroundMode() ? Playground : App

createRoot(document.getElementById('root')!).render(<Root />)
