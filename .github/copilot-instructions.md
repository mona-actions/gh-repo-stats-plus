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

- The application will leverage GitHub octokit javascript SDK for making calls to GitHub APIs.
- We work in TypeScript and the approach we are implementing should try to leverage constructs such as Queues, Batches, Retry, etc. when appropriate so take this into consideration when providing responses.
- We always use Prettier to format our code.
- We will use Jest for our unit tests.
- We will use winston as a Logger and have a createLogger function that exists to create an instance of this.
- We use tsx for compiling and running our code and we prefer to have any responses be for a more modern approach.

Code should always be readable and maintainable. Break things down into separate functions and into separate files where it makes sense to do so.
