import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // React Router injects a browser refresh preamble that DOM unit tests do not run.
  plugins: [tailwindcss(), ...(process.env.VITEST ? [] : [reactRouter()])],
  resolve: {
    tsconfigPaths: true,
  },
});

