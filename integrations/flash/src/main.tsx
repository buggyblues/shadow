import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import { Playground } from './components/Playground'

createRoot(document.getElementById('root')!).render(<Playground />)
