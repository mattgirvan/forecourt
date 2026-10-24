/**
 * Who-am-I is still pending until the stored session has been read and the
 * lookup for the current token (or "signed out") has finished. Reporting done
 * any earlier flashes the wrong notice and shifts the page.
 */
export function whoAmIPending(known: boolean, token: string | null, doneFor: string | null | undefined): boolean {
  return !known || doneFor !== token;
}
