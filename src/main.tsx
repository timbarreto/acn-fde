import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { LocalizationProvider } from "./lib/use-localization"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocalizationProvider>
      <App />
    </LocalizationProvider>
  </StrictMode>,
)
