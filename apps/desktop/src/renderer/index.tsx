import './i18n'
import './styles/globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

document.documentElement.classList.add('desktop-app')

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
