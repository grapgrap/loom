import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
    // CLI tests start Node processes, so their source dependencies are outside Vitest's module graph.
    forceRerunTriggers: [...configDefaults.forceRerunTriggers, "**/scripts/context/*.{mjs,sh,cmd}"],
  },
});
