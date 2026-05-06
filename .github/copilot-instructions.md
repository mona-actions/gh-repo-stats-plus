This application will be used to gather repository statistics for repositories that exist in GitHub. Collection of the results should always try and leverage an approach that is performant, retrieves results incrementally, and provides the ability to retry when failures occur. Use Async Generators, await/async, and patterns that help with processing large amounts of data whenever possible.

## Documentation Consistency

This project maintains focused documentation in the `docs/` folder:

- `docs/installation.md` - Prerequisites and installation methods
- `docs/usage.md` - Authentication and usage examples
- `docs/commands.md` - Complete command reference
- `docs/development.md` - Setup and development workflow

**IMPORTANT**: When making changes to the implementation, ensure these documentation files stay in sync with the actual approach used. The documentation should accurately reflect:

- Technical implementation patterns
- Command-line options and usage
- Development workflow and setup
- Authentication methods

## GitHub CLI Extension

This project is designed as a GitHub CLI extension using the **interpreted extension approach**. Key aspects:

- Uses the `gh-repo-stats-plus` shell script as the entry point
- Requires Node.js runtime (not precompiled binaries)
- Distributed through GitHub CLI extension system (`gh extension install`)
- Leverages GitHub CLI's authentication system (`gh auth`)
- Follows GitHub's extension naming conventions and structure

When making changes that affect the extension interface or requirements, ensure the main executable script and installation instructions remain accurate.

Take into consideration the following when providing responses:

- The application will leverage GitHub `octokit` javascript SDK for making calls to GitHub APIs.
- We work in TypeScript and the approach we are implementing should try to leverage constructs such as Queues, Batches, Retry, etc. when appropriate so take this into consideration when providing responses.
- We always use Prettier to format our code.
- Testing is implemented using `Vitest`. Tests are stored in the `__tests__` folder.
- Use `__mocks__` directory for mocking external dependencies like octokit and fs modules.
- Follow Vitest best practices: use vi.mock() for module mocking, vi.fn() for function mocks, and for test organization.
- Test files use `.test.ts` naming convention and mirror the src folder structure within `__tests__`.
- Leverage Vitest's built-in TypeScript support and fast execution for efficient development workflow.
- We will use `winston` as a Logger and have a createLogger function that exists to create an instance of this.
- We use `tsx` for compiling and running our code and we prefer to have any responses be for a more modern approach.

Code should always be readable and maintainable. Break things down into separate functions and into separate files where it makes sense to do so.

## Design Principles

Follow **SOLID** design principles throughout the codebase:

- **Single Responsibility**: Each module, class, or function should have one reason to change. Keep concerns separated into focused files and functions.
- **Open/Closed**: Design modules to be open for extension but closed for modification. Prefer composition and well-defined interfaces over modifying existing implementations.
- **Liskov Substitution**: Subtypes and implementations should be interchangeable without altering correctness. Honor the contracts defined by interfaces and base types.
- **Interface Segregation**: Prefer small, focused interfaces over large monolithic ones. Consumers should not depend on methods they do not use.
- **Dependency Inversion**: Depend on abstractions (interfaces/types), not concrete implementations. Pass dependencies in rather than hard-coding them.

Keep code **DRY** (Don't Repeat Yourself). This project has established reusable patterns and utilities — look for existing abstractions before introducing new ones. Shared logic belongs in dedicated modules so it can be maintained in one place.

Apply **YAGNI** (You Ain't Gonna Need It) to avoid premature abstraction. Only introduce new abstractions, configuration options, or extensibility points when there is a concrete, immediate need. Simplicity and clarity take priority over speculative flexibility.

## Async Generators and Streaming Data

When retrieving large amounts of data (e.g., paginated API results, repository statistics) or writing results to files, use **async generators** (`async function*`) to process data incrementally rather than buffering entire datasets in memory. This enables:

- Incremental processing of paginated API responses without waiting for all pages
- Streaming writes to output files as data becomes available
- Backpressure-friendly pipelines that keep memory usage predictable
- Composable data pipelines where generators can be chained together

Prefer `for await...of` loops to consume async generators and structure data flows as pipelines of small, focused generator functions.

## Verification Before Completion

**IMPORTANT**: When implementing features, fixing bugs, or making any code changes, always run the following checks before considering the work complete:

1. **Lint**: `npm run lint` — Ensure there are no linting errors
2. **Format**: `npm run format:check` — Ensure code formatting is correct (run `npm run format:write` to fix)
3. **Tests**: `npm run test:ci` — Ensure all tests pass
4. **Type Check**: `npx tsc --noEmit` — Ensure TypeScript compiles without errors

Do not skip these steps. CI will fail if any of these checks do not pass.
