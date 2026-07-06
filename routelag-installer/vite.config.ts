import { defineConfig } from "vite";

import react from "@vitejs/plugin-react";



const DEV_HOST = "127.0.0.1";

const DEV_PORT = 1430;



export default defineConfig({

  plugins: [react()],

  clearScreen: false,

  // Relative paths so Tauri can load bundled assets via the asset protocol.

  base: "./",

  server: {

    port: DEV_PORT,

    strictPort: true,

    host: DEV_HOST,

    hmr: {

      protocol: "ws",

      host: DEV_HOST,

      port: DEV_PORT + 1,

    },

    watch: {

      ignored: ["**/src-tauri/**"],

    },

  },

  build: {

    outDir: "dist",

    emptyOutDir: true,

  },

});

