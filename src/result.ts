/**
 * The process exit contract, defined once so every command agrees on it.
 *
 * Automation depends on these codes. Treat a change here as a breaking change.
 */
export const ExitCode = {
  /** The operation completed and every applicable check passed. */
  Success: 0,
  /** The operation completed and produced a definite negative answer. */
  Failure: 1,
  /** The arguments were not usable, so nothing was attempted. */
  Usage: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Raised when arguments are unusable. Reported with the usage text rather than as a crash. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}
