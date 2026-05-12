/**
 * Shared error utility functions for consistent error handling across the application.
 */

export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status === status
  );
}

interface GraphQLError {
  type?: string;
  message?: string;
}

function hasGraphQLErrors(error: unknown): error is { errors: GraphQLError[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray((error as { errors: unknown }).errors)
  );
}

/**
 * Determines if an error represents a GitHub not-found condition.
 * Checks in order:
 * 1. HTTP 404 status on the error object (REST API)
 * 2. Structured GraphQL error type 'NOT_FOUND' (preferred for GraphQL)
 * 3. GraphQL message containing 'Could not resolve to a Repository' (fallback)
 */
export function isGitHubNotFoundError(error: unknown): boolean {
  if (hasStatus(error, 404)) {
    return true;
  }

  if (
    hasGraphQLErrors(error) &&
    error.errors.some((e) => e.type === 'NOT_FOUND')
  ) {
    return true;
  }

  const message = formatErrorMessage(error);
  return message.includes('Could not resolve to a Repository with the name');
}
