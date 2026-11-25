import type { InkNexusApi, InkNexusInstallerApi } from './index'

declare global {
  interface Window {
    inknexus: InkNexusApi
    inknexusInstaller: InkNexusInstallerApi
    __inknexusSmoke?: (scene: string) => void
    __installerSmoke?: (scene: string) => void
  }
}
