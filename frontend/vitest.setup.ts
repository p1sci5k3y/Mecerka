import "@testing-library/jest-dom"
import { afterAll, beforeAll } from "vitest"

function preventAnchorNavigation(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest("a[href]")
  if (!anchor) return

  // In jsdom, following anchors logs "Not implemented: navigation to another Document".
  // Prevent the browser navigation while still allowing component click handlers to run.
  event.preventDefault()
}

beforeAll(() => {
  document.addEventListener("click", preventAnchorNavigation, true)
})

afterAll(() => {
  document.removeEventListener("click", preventAnchorNavigation, true)
})
