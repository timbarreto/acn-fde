// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import {
  createLocalizationStore,
  createMemoryLocalizationEnvironment,
} from "@/lib/localization"
import { LocalizationProvider, useLocalization } from "@/lib/use-localization"

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  const { language, text } = useLocalization()
  return (
    <p>
      {language}:{text("account.language.label")}
    </p>
  )
}

describe("useLocalization", () => {
  it("renders the active catalog and switches immediately when the store language changes", () => {
    const store = createLocalizationStore(
      createMemoryLocalizationEnvironment({ languages: ["en"] }),
    )

    const container = document.createElement("div")
    const root = createRoot(container)

    act(() => {
      root.render(
        <LocalizationProvider store={store}>
          <Probe />
        </LocalizationProvider>,
      )
    })
    expect(container.textContent).toBe("en:Interface language")

    act(() => {
      store.setLanguage("es")
    })

    expect(container.textContent).toBe("es:Idioma de la interfaz")

    act(() => root.unmount())
  })
})
