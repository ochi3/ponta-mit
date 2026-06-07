import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function resolveBasePath(env: Record<string, string>) {
  const explicitBasePath = env.VITE_BASE_PATH?.trim();
  if (explicitBasePath) {
    return explicitBasePath;
  }

  if (env.GITHUB_ACTIONS === "true") {
    const repoName = env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
    if (!repoName || repoName.endsWith(".github.io")) {
      return "/";
    }
    return `/${repoName}/`;
  }

  return "/";
}

const maintenancePluginPath = path.resolve(__dirname, 'devtools/maintenancePlugin.ts')
const astReactionPluginPath = path.resolve(__dirname, 'devtools/astReactionPlugin.ts')

type MaintenanceModule = {
  maintenanceDevToolsPlugin: () => Plugin
}

type AstReactionModule = {
  astReactionDevToolsPlugin: () => Plugin
}

async function loadDevOnlyPlugins(mode: string): Promise<Plugin[]> {
  if (mode !== 'development') {
    return []
  }

  const plugins: Plugin[] = []

  if (existsSync(maintenancePluginPath)) {
    try {
      const module = (await import(
        pathToFileURL(maintenancePluginPath).href
      )) as MaintenanceModule
      plugins.push(module.maintenanceDevToolsPlugin())
    } catch (error) {
      console.warn(
        '[vite] maintenance dev plugin を読み込めませんでした:',
        error instanceof Error ? error.message : error
      )
    }
  }

  if (existsSync(astReactionPluginPath)) {
    try {
      const module = (await import(
        pathToFileURL(astReactionPluginPath).href
      )) as AstReactionModule
      plugins.push(module.astReactionDevToolsPlugin())
    } catch (error) {
      console.warn(
        '[vite] AST reaction dev plugin を読み込めませんでした:',
        error instanceof Error ? error.message : error
      )
    }
  }

  return plugins
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devOnlyPlugins = await loadDevOnlyPlugins(mode)

  return {
    base: resolveBasePath(env),
    plugins: [...devOnlyPlugins, react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            const normalizedId = id.replace(/\\/g, "/");

            if (!normalizedId.includes("node_modules")) {
              return undefined;
            }

            if (
              normalizedId.includes("/react/") ||
              normalizedId.includes("/react-dom/") ||
              normalizedId.includes("/scheduler/")
            ) {
              return "react-vendor";
            }

            if (
              normalizedId.includes("/@supabase/") ||
              normalizedId.includes("/ws/")
            ) {
              return "supabase-vendor";
            }

            if (normalizedId.includes("/zustand/")) {
              return "state-vendor";
            }

            return "vendor";
          },
        },
      },
    },
    server: {
      proxy: {
        "/fflogs-oauth": {
          target: "https://www.fflogs.com",
          changeOrigin: true,
          rewrite: (requestPath: string) => requestPath.replace(/^\/fflogs-oauth/, "/oauth"),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
})
