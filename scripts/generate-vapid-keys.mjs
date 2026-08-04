#!/usr/bin/env node
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

// `--json` is used by the setup scripts, which write the keys straight into
// .env.local. The human-readable form is the default.
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ publicKey, privateKey }));
  process.exit(0);
}

process.stdout.write(
  [
    "",
    "VAPID key pair generated. Add these to .env.local:",
    "",
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    "",
    "Also set VAPID_SUBJECT to a mailto: or https: URL you control, for example:",
    "VAPID_SUBJECT=mailto:you@example.com",
    "",
  ].join("\n"),
);
