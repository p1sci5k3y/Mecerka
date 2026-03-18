declare module 'cookie-parser' {
  import type { RequestHandler } from 'express';

  function cookieParser(secret?: string | string[]): RequestHandler;

  export default cookieParser;
}
