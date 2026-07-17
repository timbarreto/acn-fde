import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/data/questions.json": path.resolve(__dirname, "./src/data/questions.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
