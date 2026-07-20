import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ExamSetup } from "@/App"
import { domains } from "@/data/domains"

describe("ExamSetup", () => {
  it("renders every focused-practice domain with its published number and name", () => {
    const markup = renderToStaticMarkup(<ExamSetup onStart={vi.fn()} />)

    for (const domain of domains) {
      const renderedName = domain.short.replaceAll("&", "&amp;")
      expect(markup).toContain(`${domain.number} · ${renderedName}`)
      expect(markup).not.toContain(`Domain ${domain.number} · ${renderedName}`)
    }
  })
})
