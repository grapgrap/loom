import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    // Bound concurrent CLI subprocesses, each of which loads TypeScript independently.
    maxWorkers: 4,
    // CLI tests start Node processes, so their source dependencies are outside Vitest's module graph.
    forceRerunTriggers: [...configDefaults.forceRerunTriggers, "**/scripts/context/*.{ts,sh,cmd}"],
  },
});
