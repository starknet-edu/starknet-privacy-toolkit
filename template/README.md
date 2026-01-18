# Tongo Integration Template

This folder is a minimal starting point for hackers who want to integrate Tongo quickly.

## Quick Start

1. Install dependencies from the repo root:
   ```bash
   bun install
   ```

2. Copy env template (CLI/preflight only):
   ```bash
   cp env.example .env
   ```

3. Run the quickstart example:
   ```bash
   bun run template:quickstart
   ```

## Files

- `quickstart.ts` — Minimal end-to-end client usage
- `snippet.ts` — Drop-in snippet for your app

Use the `createTongoClient()` helper in `src/tongo-client.ts` as the stable API surface.
