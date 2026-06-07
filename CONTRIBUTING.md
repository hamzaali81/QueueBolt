# Contributing to QueueBolt

Thank you for your interest in contributing to QueueBolt! This guide will help you get started.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/queuebolt.git
   cd queuebolt
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

### Building

```bash
npm run build
```

## Branch Naming

Use descriptive branch names with a prefix:

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation changes
- `refactor/` — code refactoring
- `test/` — adding or updating tests
- `chore/` — maintenance tasks

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add SQLite backend connection pooling
fix: prevent race condition in getNextJob
docs: add Redis backend configuration guide
test: add integration tests for retry logic
chore: update dev dependencies
```

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Ensure code passes lint (`npm run lint`)
3. Ensure types are correct (`npm run typecheck`)
4. Update documentation if you changed the API
5. Add tests for new features
6. Fill out the PR template completely

## Code Style

- TypeScript strict mode is enabled
- Use Prettier for formatting (runs automatically)
- Prefer `async/await` over raw promises
- Export types separately from implementations
- Write JSDoc comments for public APIs
- Use descriptive variable names — avoid abbreviations

## Adding a New Storage Backend

1. Create a new file in `src/backends/`
2. Implement the `StorageAdapter` interface from `src/types/index.ts`
3. Add tests in `tests/unit/`
4. Add an export in `package.json` under `exports`
5. Update the README with usage examples

## Reporting Bugs

Use the [Bug Report template](https://github.com/hamzaali81/queuebolt/issues/new?template=bug_report.md) and include:

- QueueBolt version
- Node.js version
- Storage backend used
- Minimal reproduction code
- Expected vs actual behavior

## Suggesting Features

Use the [Feature Request template](https://github.com/hamzaali81/queuebolt/issues/new?template=feature_request.md) and describe:

- The problem you're trying to solve
- Your proposed solution
- Alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
