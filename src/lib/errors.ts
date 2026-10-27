export class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new Problem(status, code, message);
}
