import type { PracticeState } from "@/types"

export interface PracticeStateExport {
  filename: string
  mediaType: "application/json"
  content: string
}

export function createPracticeStateExport(
  practiceState: PracticeState,
  exportedAt = new Date(),
): PracticeStateExport {
  const date = exportedAt.toISOString()
  return {
    filename: `agentic-ready-gh600-practice-state-${date.slice(0, 10)}.json`,
    mediaType: "application/json",
    content: JSON.stringify({
      schemaVersion: 2,
      exportedAt: date,
      practiceState,
    }, null, 2),
  }
}

export function downloadPracticeStateExport(practiceState: PracticeState) {
  const artifact = createPracticeStateExport(practiceState)
  const url = URL.createObjectURL(new Blob([artifact.content], {
    type: artifact.mediaType,
  }))
  const link = document.createElement("a")
  link.href = url
  link.download = artifact.filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
