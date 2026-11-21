/** An error that maps directly to an HTTP response: `{ error, fields? }`. */
export class HttpError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string[] | undefined>;

  constructor(status: number, message: string, fields?: Record<string, string[] | undefined>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
