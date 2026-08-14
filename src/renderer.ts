interface LauncherStatus {
  phase: 'locating' | 'installing' | 'building' | 'starting' | 'ready' | 'error'
  message: string
  detail?: string
}

interface LauncherApi {
  chooseRepository(): Promise<void>
  retry(): Promise<void>
  openLog(): Promise<void>
  onStatus(listener: (status: LauncherStatus) => void): () => void
}

declare global {
  interface Window {
    dshLauncher: LauncherApi
  }
}

const status = requiredElement('status')
const detail = requiredElement('detail')
const actions = requiredElement('actions')
const choose = requiredButton('choose')
const retry = requiredButton('retry')
const logs = requiredButton('logs')

window.dshLauncher.onStatus((next) => {
  document.body.dataset.phase = next.phase
  status.textContent = next.message
  detail.textContent = next.detail ?? ''
  actions.hidden = next.phase !== 'error'
})

choose.addEventListener('click', () => void window.dshLauncher.chooseRepository())
retry.addEventListener('click', () => void window.dshLauncher.retry())
logs.addEventListener('click', () => void window.dshLauncher.openLog())

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`missing #${id}`)
  return element
}

function requiredButton(id: string): HTMLButtonElement {
  const element = requiredElement(id)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`#${id} is not a button`)
  return element
}

export {}
