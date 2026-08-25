/**
 * PROTOTYPE — drive the proposed localization Module by hand.
 *
 * This TUI exposes the complete relevant state after every action so the
 * selected-language precedence, immediate switching, persistence failure, and
 * English Question bank boundary can be challenged before production work.
 */

import { emitKeypressEvents } from "node:readline"
import {
  createLocalizationPrototype,
  type InterfaceLanguage,
  type LocalizationPrototype,
} from "../../src/lib/localization.prototype.ts"

const bold = "\u001b[1m"
const dim = "\u001b[2m"
const reset = "\u001b[0m"
const preferenceScenarios = [
  ["fr-CA", "de-AT", "es"],
  ["es-MX", "de-DE"],
  ["de-CH"],
  ["en-US"],
  ["fr-FR"],
] as const

let storedPreference: unknown = null
let requestedLanguagesIndex = 0
let documentLanguage = ""
let failPreferenceWrites = false
let lastAction = "Mounted with no stored preference."
let localization = mount()

function mount(): LocalizationPrototype {
  return createLocalizationPrototype({
    readPreference: () => storedPreference,
    writePreference: (language) => {
      if (failPreferenceWrites) {
        throw new Error("Prototype storage write failure")
      }
      storedPreference = language
    },
    requestedLanguages: () =>
      preferenceScenarios[requestedLanguagesIndex],
    applyDocumentLanguage: (language) => {
      documentLanguage = language
    },
  })
}

function selectLanguage(language: InterfaceLanguage) {
  const result = localization.setLanguage(language)
  lastAction = result.status === "persisted"
    ? `Selected ${language}; preference persisted.`
    : `Selected ${language}; visible now but session-only.`
}

function remount() {
  localization = mount()
  lastAction = "Remounted the Module from browser inputs."
}

function render() {
  if (process.stdout.isTTY) console.clear()

  const snapshot = localization.getSnapshot()
  const now = Date.UTC(2026, 7, 25, 19, 0)
  const acceptedAt = now - 2 * 60_000
  const finishedAt = Date.UTC(2026, 7, 24, 16, 30)

  console.log(`${bold}Localization architecture prototype${reset}`)
  console.log(
    `${dim}One typed text interface; no production wiring or persistence.${reset}`,
  )
  console.log()
  console.log(`${bold}Public interface${reset}`)
  console.log("  getSnapshot()")
  console.log("  subscribe(listener)")
  console.log("  setLanguage(language)")
  console.log("  text(key, typedArgs?)")
  console.log()
  console.log(`${bold}Current state${reset}`)
  console.log(`  language:            ${snapshot.language}`)
  console.log(`  source:              ${snapshot.source}`)
  console.log(`  persistence:         ${snapshot.persistence}`)
  console.log(`  stored preference:   ${String(storedPreference)}`)
  console.log(
    `  requested languages: ${JSON.stringify(
      preferenceScenarios[requestedLanguagesIndex],
    )}`,
  )
  console.log(`  document language:   ${documentLanguage}`)
  console.log(`  fail writes:         ${failPreferenceWrites}`)
  console.log()
  console.log(`${bold}Rendered through text(...)${reset}`)
  console.log(`  navigation:          ${localization.text("nav.account")}`)
  console.log(
    `  history:             ${localization.text("history.summary", {
      finishedAt,
      questionCount: 2,
    })}`,
  )
  console.log(
    `  sync:                ${localization.text("sync.elapsed", {
      acceptedAt,
      now,
    })}`,
  )
  console.log(
    `  visible notice:      ${localization.text("account.notice", {
      notice: "sign-in-failed",
    })}`,
  )
  console.log(
    `  derived label:       ${localization.text("attempt.label", {
      mode: "domain",
      domainCount: 2,
    })}`,
  )
  console.log(
    `  language boundary:   ${localization.text(
      "questionBank.notice",
    )}`,
  )
  console.log()
  console.log(`${bold}Question bank (deliberately untouched)${reset}`)
  console.log(
    "  Which GitHub feature lets a workflow authenticate without a long-lived secret?",
  )
  console.log()
  console.log(`${bold}Last action${reset}`)
  console.log(`  ${lastAction}`)
  console.log()
  console.log(`${bold}Actions${reset}`)
  console.log(
    `  ${bold}[e]${reset} English  ${bold}[s]${reset} Spanish  ${bold}[g]${reset} German`,
  )
  console.log(
    `  ${bold}[f]${reset} toggle write failure  ${bold}[c]${reset} corrupt stored value`,
  )
  console.log(
    `  ${bold}[x]${reset} clear stored value    ${bold}[n]${reset} next browser languages`,
  )
  console.log(
    `  ${bold}[m]${reset} remount               ${bold}[q]${reset} quit`,
  )
}

function quit() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.stdin.pause()
  console.log()
}

emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.on("keypress", (input, key) => {
  const pressed = key?.name ?? input.toLowerCase()

  if (pressed === "q" || (key?.ctrl && pressed === "c")) {
    quit()
    return
  }
  if (pressed === "e") selectLanguage("en")
  if (pressed === "s") selectLanguage("es")
  if (pressed === "g") selectLanguage("de")
  if (pressed === "f") {
    failPreferenceWrites = !failPreferenceWrites
    lastAction = `Preference write failure ${
      failPreferenceWrites ? "enabled" : "disabled"
    }.`
  }
  if (pressed === "c") {
    storedPreference = "fr-CA"
    lastAction = "Stored preference corrupted to fr-CA; remount to resolve."
  }
  if (pressed === "x") {
    storedPreference = null
    lastAction = "Stored preference cleared; remount to detect again."
  }
  if (pressed === "n") {
    requestedLanguagesIndex =
      (requestedLanguagesIndex + 1) % preferenceScenarios.length
    lastAction = "Browser language list advanced; remount to detect it."
  }
  if (pressed === "m") remount()

  render()
})

render()
