import { OAuth2Client } from 'google-auth-library';
import { AppError, unauthorized } from '../../lib/errors.js';

/** Who the person is, as checked by Google. */
export interface GoogleProfile {
  /** Google's fixed id for this person ("sub"). Never changes, even with a new Gmail address. */
  googleId: string;
  /** Lowercase, and confirmed by Google. */
  email: string;
  name: string;
}

/** Checks the ID token the app got from Google. Tests use a fake one. */
export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

const SIGN_IN_FAILED = 'Google sign-in did not work. Please try again.';

/**
 * Checks Google ID tokens with Google's official library. Free: the check runs on our
 * server with Google's public keys (fetched once and cached), with no paid API calls.
 *
 * The same token comes from every app: the Android one-tap sheet (Credential Manager),
 * the web button / one-tap prompt (Google Identity Services) and later the iPhone.
 *
 * @param clientIds our OAuth client IDs; a token made for any other app is refused.
 */
export function googleVerifier(clientIds: string[]): GoogleVerifier {
  const client = new OAuth2Client();

  return {
    async verify(idToken) {
      // Google's public keys. Failing here means Google can't be reached, not a bad token.
      let certs;
      try {
        ({ certs } = await client.getFederatedSignonCertsAsync());
      } catch {
        throw new AppError(
          503,
          'GOOGLE_UNAVAILABLE',
          'Google sign-in is not reachable right now. Please try again.',
        );
      }

      // Signature, issuer (accounts.google.com), expiry and audience (one of our apps).
      let payload;
      try {
        const ticket = await client.verifySignedJwtWithCertsAsync(idToken, certs, clientIds, client.issuers);
        payload = ticket.getPayload();
      } catch {
        throw unauthorized(SIGN_IN_FAILED, 'GOOGLE_TOKEN_INVALID');
      }
      if (!payload?.sub || !payload.email) throw unauthorized(SIGN_IN_FAILED, 'GOOGLE_TOKEN_INVALID');

      // Only an email Google has confirmed may log in to (or be linked with) an account.
      if (payload.email_verified !== true) {
        throw unauthorized(
          'Your Google account email is not verified. Verify it with Google, or use another way to log in.',
          'GOOGLE_EMAIL_NOT_VERIFIED',
        );
      }

      const email = payload.email.toLowerCase();
      const name = (payload.name ?? payload.given_name ?? '').trim() || email.split('@')[0]!;
      return { googleId: payload.sub, email, name: name.slice(0, 80) };
    },
  };
}
