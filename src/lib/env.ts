import { z } from "zod";
import { publicEnv } from "./public-env";

/**
 * Configuration is validated once, at module load. A missing or malformed value
 * fails the build or the boot rather than surfacing as a confusing runtime error
 * three screens into the application. DF-CFG-001, DF-CFG-002.
 *
 * The values themselves are read in `src/lib/public-env.ts` and only checked
 * here, because zod is around 18 kB gzipped and every client component that
 * needs a `NEXT_PUBLIC_` value would otherwise carry it. Public configuration is
 * therefore validated during the build and on the server, never in a browser -
 * which is enough, since a browser only ever sees values a build compiled into
 * it, and a build that fails produces no bundle at all.
 *
 * That argument holds only while this module is reachable from the server module
 * graph of every build. `appOrigin` below is how that is arranged.
 */

/**
 * A VAPID public key is an uncompressed P-256 point: 65 bytes, which is 87
 * base64 characters, or 88 with padding. Both alphabets are accepted because
 * `urlBase64ToUint8Array` in `src/features/notifications/use-push.ts` normalises
 * either one.
 */
const VAPID_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_+/-]{87}=?$/;

/**
 * Strict, because the browser reads its values from `src/lib/public-env.ts` and
 * this is the only thing that inspects them. A name added there and forgotten
 * here would otherwise be stripped in silence and reach users unchecked; strict
 * turns that omission into a failed build naming the key.
 */
const publicSchema = z.strictObject({
  /**
   * No default. This is the origin Supabase is told to send confirmation and
   * password reset links back to, so a value that is merely plausible is worse
   * than no value at all: a default of localhost would let a production build
   * succeed and then put a localhost link in every email that leaves the system.
   */
  NEXT_PUBLIC_APP_URL: z
    .string()
    .min(1, "required - the origin this deployment is served from")
    .refine((value) => /^https?:\/\/[^/]+$/.test(value), {
      message:
        "must be an absolute http or https origin with no path and no trailing slash, " +
        "because auth redirect targets are built by appending a path to it",
    }),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "required - Project Settings, API"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "required - the publishable key from Project Settings, API"),
  /**
   * Optional, because push is optional: `sendPush` skips and the settings screen
   * reports the feature as unconfigured. A malformed key is not optional though.
   * It reaches the browser and fails inside `pushManager.subscribe` with an
   * opaque InvalidCharacterError - which is what the `.env.example` placeholder
   * would do - so it is refused here, where the variable name is still attached
   * to the problem.
   */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .default("")
    .refine((value) => value === "" || VAPID_PUBLIC_KEY_PATTERN.test(value), {
      message:
        "must be an 87-character base64 VAPID public key, or empty to run without push. " +
        "Generate a pair with: npm run vapid:generate",
    }),
});

const parsedPublic = publicSchema.safeParse(publicEnv);

if (!parsedPublic.success) {
  // DF-CFG-005 forbids echoing configuration values. Nothing in this schema is
  // secret by definition, and a bare list of names cannot distinguish "unset"
  // from "set to something unusable", so the reason is reported alongside the
  // name. The messages above are fixed strings and never interpolate the input.
  //
  // Trimmed because an unrecognised key carries its name in the message and has
  // no path, so the pair would otherwise begin with a stray space.
  const problems = parsedPublic.error.issues
    .map((issue) => `${issue.path.join(".")} ${issue.message}`.trim())
    .join("; ");

  throw new Error(
    `Invalid public environment configuration: ${problems}. ` +
      `Copy .env.example to .env.local and fill in the values.`,
  );
}

/**
 * The origin, for `metadataBase` in the root layout. It is the same string as
 * `publicEnv.NEXT_PUBLIC_APP_URL`; reading it from here is what pulls this module
 * into the server graph, and with it the check above.
 *
 * Nothing else runs that check. The browser bundle no longer contains the schema,
 * so if no server module imports this file, a malformed `NEXT_PUBLIC_APP_URL`
 * yields a clean build and a deployment that mails every user a confirmation link
 * pointing somewhere else - which is the failure `src/lib/env.test.ts` was
 * written for. A real usage survives a tidy-up better than a bare side-effect
 * import would, and that test asserts the root layout still has one.
 */
export const appOrigin = parsedPublic.data.NEXT_PUBLIC_APP_URL;

/**
 * Server-only configuration. Importing this from a client component is a build
 * error by design, because these values must never reach a browser bundle.
 * DF-CFG-003.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:noreply@example.com"),
  AI_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

/**
 * Read lazily rather than at module load so that importing a shared module from
 * a client component does not blow up on missing server secrets.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    // Names only here, unlike the public schema above. These are secrets, and a
    // validation message is written by a library rather than by this file, so it
    // is not the place to guarantee that a value never appears in a server log.
    // DF-CFG-005.
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment configuration: ${missing}`);
  }

  // DF-CFG-004: an AI key is required only when AI is actually switched on.
  if (parsed.data.AI_ENABLED) {
    const key =
      parsed.data.AI_PROVIDER === "openai"
        ? parsed.data.OPENAI_API_KEY
        : parsed.data.ANTHROPIC_API_KEY;

    if (!key) {
      throw new Error(
        `AI_ENABLED is true but no API key is set for provider "${parsed.data.AI_PROVIDER}".`,
      );
    }
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
