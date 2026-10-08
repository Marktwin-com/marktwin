interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const DEFAULT_STUN_URLS = ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"];

let runtimeIceServers: RTCIceServer[] | undefined;
let runtimeDirectIceServers: RTCIceServer[] | undefined;

function collaborationDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("collabDiagnostics") === "1";
}

export function summarizeIceCandidate(candidate: RTCIceCandidateInit | RTCIceCandidate) {
  const fields = (candidate.candidate || "").trim().split(/\s+/);
  const typeIndex = fields.indexOf("typ");
  const tcpTypeIndex = fields.indexOf("tcptype");
  return {
    type: typeIndex >= 0 ? fields[typeIndex + 1] || "unknown" : "unknown",
    protocol: fields[2]?.toLowerCase() || "unknown",
    addressKind: classifyIceAddress(fields[4]),
    tcpType: tcpTypeIndex >= 0 ? fields[tcpTypeIndex + 1] || "unknown" : undefined,
  };
}

export function classifyIceAddress(address?: string | null) {
  if (!address) return "unknown";
  const normalized = address.toLowerCase();
  if (normalized.endsWith(".local")) return "mdns";
  if (/^127\./.test(normalized)) return "loopback-ipv4";
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(normalized)) return "private-ipv4";
  if (/^169\.254\./.test(normalized)) return "link-local-ipv4";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) return "public-ipv4";
  if (normalized === "::1") return "loopback-ipv6";
  if (/^fe[89ab]/.test(normalized)) return "link-local-ipv6";
  if (/^f[cd]/.test(normalized)) return "private-ipv6";
  if (normalized.includes(":")) return "public-ipv6";
  return "hostname";
}

async function permissionState(name: string) {
  try {
    return (await navigator.permissions.query({ name: name as PermissionName })).state;
  } catch {
    return "unsupported";
  }
}

function summarizeStatsCandidate(report: RTCStats) {
  const candidate = report as RTCStats & {
    address?: string;
    ip?: string;
    candidateType?: string;
    protocol?: string;
    tcpType?: string;
  };
  return {
    type: candidate.candidateType || "unknown",
    protocol: candidate.protocol?.toLowerCase() || "unknown",
    addressKind: classifyIceAddress(candidate.address || candidate.ip),
    tcpType: candidate.tcpType,
  };
}

export async function logDirectPeerFailure(label: "owner" | "joiner", connection: RTCPeerConnection, attempt?: number) {
  try {
    const stats = await connection.getStats();
    const localCandidates: ReturnType<typeof summarizeStatsCandidate>[] = [];
    const remoteCandidates: ReturnType<typeof summarizeStatsCandidate>[] = [];
    const candidatePairs: Array<{ state: string; nominated: boolean; writable?: boolean }> = [];
    stats.forEach((report) => {
      if (report.type === "local-candidate") localCandidates.push(summarizeStatsCandidate(report));
      if (report.type === "remote-candidate") remoteCandidates.push(summarizeStatsCandidate(report));
      if (report.type === "candidate-pair") {
        const pair = report as RTCStats & { state?: string; nominated?: boolean; writable?: boolean };
        candidatePairs.push({
          state: pair.state || "unknown",
          nominated: pair.nominated === true,
          writable: pair.writable,
        });
      }
    });
    const [localNetworkPermission, legacyLocalNetworkPermission] = await Promise.all([
      permissionState("local-network"),
      permissionState("local-network-access"),
    ]);
    console.warn(`[collab:${label}] direct P2P failed ${JSON.stringify({
      attempt,
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
      iceGatheringState: connection.iceGatheringState,
      localNetworkPermission,
      legacyLocalNetworkPermission,
      localCandidates,
      remoteCandidates,
      candidatePairs,
    })}`);
  } catch (error) {
    console.warn(`[collab:${label}] direct P2P diagnostics unavailable`, error);
  }
}

export function logRemoteIceCandidate(label: "owner" | "joiner", candidate: RTCIceCandidateInit) {
  if (!collaborationDiagnosticsEnabled()) return;
  console.info(`[collab:${label}] remote ICE candidate ${JSON.stringify(summarizeIceCandidate(candidate))}`);
}

function parseCsv(value?: string) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) || [];
}

export function getIceServers(): RTCIceServer[] {
  const jsonConfig = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig) as IceServerConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      console.warn("Invalid VITE_WEBRTC_ICE_SERVERS JSON. Falling back to CSV ICE config.");
    }
  }

  const stunUrls = parseCsv(import.meta.env.VITE_STUN_URLS as string | undefined);
  const turnUrls = parseCsv(import.meta.env.VITE_TURN_URLS as string | undefined);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  return [
    ...(stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS).map((urls) => ({ urls })),
    ...turnUrls.map((urls) => ({ urls, username: turnUsername, credential: turnCredential })),
  ];
}

export function hasTurnRelay(servers: RTCIceServer[]) {
  return servers.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/.test(url)));
}

export function getDirectIceServers(): RTCIceServer[] {
  if (runtimeDirectIceServers) return runtimeDirectIceServers;
  const directServers = getIceServers().filter((server) => !hasTurnRelay([server]));
  return directServers.length > 0 ? directServers : DEFAULT_STUN_URLS.map((urls) => ({ urls }));
}

export async function prepareIceServers(_fetcher: typeof fetch = fetch, allowTurnRelay = false): Promise<RTCIceServer[]> {
  if (allowTurnRelay) { runtimeIceServers = getIceServers(); return runtimeIceServers; }
  runtimeDirectIceServers = getDirectIceServers(); return runtimeDirectIceServers;
}

export function createPeerConnection(
  forceTurnRelay = false,
  diagnosticLabel: "owner" | "joiner" = "joiner",
  automaticTurnFallback = false,
) {
  const useRuntimeIceServers = forceTurnRelay || automaticTurnFallback;
  const connection = new RTCPeerConnection({
    iceServers: useRuntimeIceServers ? (runtimeIceServers || getIceServers()) : getDirectIceServers(),
    // Automatic workspace sessions use `all`, which follows the proven main
    // deployment behavior: ICE prefers direct candidates and can fall back to
    // TURN without restarting negotiation. Explicit relay sessions stay relay-only.
    iceTransportPolicy: forceTurnRelay ? "relay" : "all",
  });
  if (collaborationDiagnosticsEnabled()) {
    const mode = forceTurnRelay ? "relay-only" : automaticTurnFallback ? "automatic" : "direct-only";
    console.info(`[collab:${diagnosticLabel}] created ${mode} peer connection`);
    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        console.info(`[collab:${diagnosticLabel}] local ICE candidate ${JSON.stringify(summarizeIceCandidate(event.candidate))}`);
      } else {
        console.info(`[collab:${diagnosticLabel}] ICE candidate gathering complete`);
      }
    });
    connection.addEventListener("icegatheringstatechange", () => {
      console.info(`[collab:${diagnosticLabel}] ICE gathering state=${connection.iceGatheringState}`);
    });
    connection.addEventListener("iceconnectionstatechange", () => {
      console.info(`[collab:${diagnosticLabel}] ICE connection state=${connection.iceConnectionState}`);
    });
    connection.addEventListener("connectionstatechange", () => {
      console.info(`[collab:${diagnosticLabel}] peer connection state=${connection.connectionState}`);
    });
    connection.addEventListener("icecandidateerror", (event) => {
      console.warn(`[collab:${diagnosticLabel}] ICE candidate error code=${event.errorCode} text=${event.errorText}`);
    });
  }
  return connection;
}

export function resetRuntimeIceServersForTests() {
  runtimeIceServers = undefined;
  runtimeDirectIceServers = undefined;
}
