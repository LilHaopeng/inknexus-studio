import type { InkNexusApi } from './index'

declare global {
  interface Window {
    inknexus: InkNexusApi
    __inknexusSmoke?: (scene: string) => void
  }
}
