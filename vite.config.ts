import devServer from "@hono/vite-dev-server"
import path from "path"
import fs from "fs"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// Identifiant de build : commit Render (RENDER_GIT_COMMIT) + horodatage. Different a chaque deploiement.
const commit = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "local").slice(0, 7)
const builtAt = new Date()
const buildId = `${commit}-${builtAt.getTime().toString(36)}`
const buildDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(builtAt).replace(",", "")
const appVersion = `${commit} · ${buildDate}`

// Ecrit l'identifiant de build dans dist/public/sw.js : le fichier change a chaque deploiement,
// le navigateur installe donc le nouveau service worker et renouvelle le cache.
function stampServiceWorker(): Plugin {
  return {
    name: "govapark-stamp-sw",
    apply: "build",
    closeBundle() {
      const file = path.resolve(__dirname, "dist/public/sw.js")
      if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, "utf8").split("__BUILD_ID__").join(buildId))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(), react(), stampServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
