/**
 * Converts a GitHub API URL to a base URL.
 * For example: https://api.github.com -> https://github.com
 *              https://ghes.example.com/api/v3 -> https://ghes.example.com
 *
 * @param apiUrl - The GitHub API URL
 * @returns The base URL with protocol and host only
 */
export function apiUrlToBaseUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.hostname.startsWith('api.')) {
    url.hostname = url.hostname.slice(4);
  }
  url.pathname = '/';
  return url.origin;
}

/**
 * Extracts the hostname from a GitHub API URL, resolving through the base URL.
 * For example: https://api.github.com -> github.com
 *              https://ghes.example.com/api/v3 -> ghes.example.com
 *
 * @param apiUrl - The GitHub API URL
 * @returns The hostname portion of the resolved base URL
 */
export function hostnameFromApiUrl(apiUrl: string): string {
  return new URL(apiUrlToBaseUrl(apiUrl)).hostname;
}

/**
 * Checks if the given URL points to public GitHub (github.com).
 *
 * @param apiUrl - A GitHub API URL or base URL
 * @returns true if the URL resolves to github.com
 */
export function isGitHubDotCom(apiUrl: string): boolean {
  return hostnameFromApiUrl(apiUrl) === 'github.com';
}
