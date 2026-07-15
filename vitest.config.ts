import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The real 'obsidian' npm package (a devDependency, used for its .d.ts
// types) ships zero runtime code — it only exists inside the Obsidian app.
// Any source file that uses one of its classes as a value (not just a
// type), e.g. `instanceof TFile` or `new Notice(...)`, would fail to even
// load under a plain test runner. Aliasing the bare specifier to a small
// local stub (test/obsidian-stub.ts) lets those modules load unmodified;
// tsconfig's own `paths` mapping still points `obsidian` at the real .d.ts
// for type-checking, so this has no effect on `npm run typecheck`/`build`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Guarded internally to a no-op under the default `node` environment —
    // only files with a `// @vitest-environment jsdom` pragma need it. See
    // obsidian-dom-polyfill.ts's own comment for why this exists at all.
    setupFiles: ['./test/obsidian-dom-polyfill.ts'],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'html'],
      // Scoped to the modules that actually have dedicated unit tests (the
      // pure data layer) — the rest of src/ is DOM-rendering code with no
      // test harness yet (see the "UI-level smoke tests" follow-up), so
      // including it here would just report a meaningless near-0% number
      // rather than catching real regressions.
      include: [
        'src/canvas-format.ts',
        'src/kanban-migrate.ts',
        'src/dated-items.ts',
        'src/file-io.ts',
        'src/asset-manager.ts',
        'src/save-queue.ts',
      ],
      // Set a little below current actual coverage (~65/59/77/66 as of
      // writing) rather than right at it — enough headroom that adding or
      // trimming a couple of untested lines elsewhere in these files isn't
      // flaky, while still catching a real drop (e.g. new pure logic added
      // with no tests at all). dated-items.ts's renderCalendarGrid (DOM
      // rendering) is the main reason this isn't closer to 90%+ — see the
      // UI smoke-test layer for that half.
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 70,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./test/obsidian-stub.ts', import.meta.url)),
    },
  },
});
