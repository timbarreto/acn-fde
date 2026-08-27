import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  createLocalizationStore,
  createMemoryLocalizationEnvironment,
} from "@/lib/localization"
import { LocalizationProvider, useLocalization } from "@/lib/use-localization"

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

    const before = renderToStaticMarkup(
      <LocalizationProvider store={store}>
        <Probe />
      </LocalizationProvider>,
    )
    expect(before).toContain("en:Interface language")

    store.setLanguage("es")

    const after = renderToStaticMarkup(
      <LocalizationProvider store={store}>
        <Probe />
      </LocalizationProvider>,
    )
    expect(after).toContain("es:Idioma de la interfaz")
    expect(after).not.toContain("Interface language")
  })
})
