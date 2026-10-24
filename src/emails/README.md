# Forecourt emails

Copy: marketing/email/forecourt-email-drafts-v3.md (approved, used as written).

- `npm run emails:render` renders every template with React Email to `src/emails/dist/<name>.html` and `.txt` (gitignored) and regenerates `src/lib/email/newsletter-confirm.generated.ts`. It sends nothing.
- Hero images are real site UI, served from `https://www.forecourt.me/email/*.png` (public/email) once this ships.
- No name is collected, so every email opens "Hello,". Fill `{{UNSUBSCRIBE_URL}}` per recipient with `fillPlaceholders()` from `fill.ts`. Monthly editorial `{{SLOTS}}` go in `extra`. Refuse to send when `unfilled()` returns anything.

## Every newsletter send must

1. Go only to contacts in the newsletter Segment (`RESEND_NEWSLETTER_SEGMENT_ID`, formerly the Audience) with `unsubscribed: false`.
2. Be one email per recipient, with `{{UNSUBSCRIBE_URL}}` set to `unsubscribeUrl(config, email)` from `src/lib/server/newsletter.ts`.
3. Pass `headers: newsletterUnsubscribeHeaders(config, email)` to Resend. That sets `List-Unsubscribe` (our signed one-click URL plus mailto) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mail clients POST to `/api/newsletter/unsubscribe`, which sets `unsubscribed: true` with no further click.
4. Use a subject starting `Forecourt: ` and send from `Forecourt <hello@forecourt.me>`.
