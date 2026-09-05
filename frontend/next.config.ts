import type { NextConfig } from "next";

// Dev-only: when NEXT_PUBLIC_USE_REMOTE_BACKEND=1, proxy /api/* to a remote
// backend (e.g. the Docker stack on Debian) so `npm run dev` talks to a real
// database. The proxy keeps requests same-origin, so cookies work and there is
// no CORS. Production builds always use static export (Debian's build path).
const useRemoteBackend =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_USE_REMOTE_BACKEND === "1";

const backendUrl = process.env.KANBAN_BACKEND_URL ?? "http://192.168.1.72:8000";

const nextConfig: NextConfig = useRemoteBackend
  ? {
      async rewrites() {
        return [
          { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
        ];
      },
    }
  : {
      output: "export",
    };

export default nextConfig;
