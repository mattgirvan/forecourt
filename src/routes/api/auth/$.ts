import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { dbConfigured, dbUnavailableResponse } from "@/lib/db";

// With no database on this deployment, Better Auth cannot read or write
// sessions. Answer with a clear 503 instead of letting the request fail deep
// inside the auth library.
const handle = (request: Request) =>
  dbConfigured ? auth.handler(request) : dbUnavailableResponse();

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
