import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: resolveBasePath(env),
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
})
