import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/aurora.css'
import { App } from './App'
import { InstallerApp } from './pages/InstallerApp'

const isInstaller = new URLSearchParams(window.location.search).get('installer') === '1'

if (isInstaller) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isInstaller ? <InstallerApp /> : <App />}</React.StrictMode>
)
