declare module 'safe-regex' {
  /**
   * Check if a regex pattern is safe from ReDoS attacks
   * @param pattern - The regex pattern to check (string or RegExp)
   * @param options - Optional configuration
   * @returns true if the pattern is safe, false if it may cause ReDoS
   */
  function safeRegex(
    pattern: string | RegExp,
    options?: { limit?: number }
  ): boolean;

  export = safeRegex;
}
