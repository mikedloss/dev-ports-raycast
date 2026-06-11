import tls from "node:tls";

const PROBE_TTL_MS = 15_000;
const HTTPS_PROBE_TIMEOUT_MS = 700;

type ProbeCacheEntry = {
  scheme: "http" | "https";
  expiresAt: number;
};

const schemeCache = new Map<string, ProbeCacheEntry>();
const pendingProbes = new Map<string, Promise<"http" | "https">>();

export async function detectUrlScheme(host: string, port: number): Promise<"http" | "https"> {
  const probeHost = normalizeProbeHost(host);
  const cacheKey = `${probeHost}:${port}`;
  const cached = schemeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.scheme;
  }

  const pending = pendingProbes.get(cacheKey);

  if (pending) {
    return pending;
  }

  const probe = probeHttps(probeHost, port)
    .then((isHttps) => (isHttps ? "https" : "http"))
    .then((scheme) => {
      schemeCache.set(cacheKey, {
        scheme,
        expiresAt: Date.now() + PROBE_TTL_MS,
      });
      pendingProbes.delete(cacheKey);
      return scheme;
    })
    .catch(() => {
      pendingProbes.delete(cacheKey);
      return "http" as const;
    });

  pendingProbes.set(cacheKey, probe);
  return probe;
}

function probeHttps(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port,
      servername: host === "127.0.0.1" ? "localhost" : host,
      rejectUnauthorized: false,
      timeout: HTTPS_PROBE_TIMEOUT_MS,
    });

    socket.once("secureConnect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function normalizeProbeHost(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }

  if (host === "*" || host === "0.0.0.0" || host === "::") {
    return "localhost";
  }

  return host;
}
