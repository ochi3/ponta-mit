// devtools/maintenancePlugin.ts は .gitignore 対象のため、CI の tsc 用スタブ
declare module "./devtools/maintenancePlugin.ts" {
  import type { Plugin } from "vite";

  export function maintenanceDevToolsPlugin(rootDir?: string): Plugin;
}
