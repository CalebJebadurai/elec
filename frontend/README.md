# Election Analytics — Frontend

> **Package Manager: [Bun](https://bun.sh/)** — npm is not supported.

## Getting Started

```sh
bun install
bun run dev
```

## Scripts

| Command                 | Description               |
| ----------------------- | ------------------------- |
| `bun run dev`           | Start Vite dev server     |
| `bun run build`         | Production build          |
| `bun run test`          | Run tests (watch mode)    |
| `bun run test:coverage` | Run tests with coverage   |
| `bun run lint`          | ESLint                    |
| `bun run format`        | Format code with Prettier |
| `bun run format:check`  | Check formatting (CI)     |

## Stack

- React 19 + Vite 8
- TypeScript (incremental — `allowJs: true`, `checkJs: false`)
- Vitest + Testing Library
- ESLint 9 (flat config) + Prettier
- Husky + lint-staged pre-commit hooks
