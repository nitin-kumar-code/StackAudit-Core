import { NextRequest } from 'next/server';
import { proxy } from './proxy';

export function middleware(request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    },
  ],
};
