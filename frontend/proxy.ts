import createMiddleware from 'next-intl/middleware';
import { routing } from './lib/navigation';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|runtime-config|_next|_vercel|.*\\..*).*)'],
};
