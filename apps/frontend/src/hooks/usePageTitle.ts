import { useEffect } from 'react';

const BASE_TITLE = 'DocuMind AI';

/**
 * Sets the document title per route.
 *
 * This is not cosmetic: with a single static title, browser history and open
 * tabs are indistinguishable, and screen readers announce the same thing on
 * every navigation.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} - ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
