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

type MaintenanceModule = {
  maintenanceDevToolsPlugin: () => Plugin
}

async function loadMaintenancePlugins(mode: string): Promise<Plugin[]> {
  if (mode !== 'development' || !existsSync(maintenancePluginPath)) {
    return []
  }

  const module = (await import(
    pathToFileURL(maintenancePluginPath).href
  )) as MaintenanceModule

  return [module.maintenanceDevToolsPlugin()]
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const maintenancePlugins = await loadMaintenancePlugins(mode)

  return {
    base: resolveBasePath(env),
    plugins: [...maintenancePlugins, react(), tailwindcss()],
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
