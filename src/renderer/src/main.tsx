import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import './index.css'
import { applyDark, getStoredChoice, resolveDark } from './lib/theme'

// Set the theme class before first paint to avoid a light->dark flash on launch.
applyDark(resolveDark(getStoredChoice()))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
