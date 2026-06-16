interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function parseCsv(value?: string) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) || [];
}

export function getIceServers(): RTCIceServer[] {
  const jsonConfig = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (jsonConfig) {
    try {
      return JSON.parse(jsonConfig) as IceServerConfig[];
    } catch {
      console.warn("Invalid VITE_WEBRTC_ICE_SERVERS JSON. Falling back to CSV ICE config.");
    }
  }

  const stunUrls = parseCsv(import.meta.env.VITE_STUN_URLS as string | undefined);
  const turnUrls = parseCsv(import.meta.env.VITE_TURN_URLS as string | undefined);
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  return [
    ...stunUrls.map((urls) => ({ urls })),
    ...turnUrls.map((urls) => ({ urls, username: turnUsername, credential: turnCredential })),
  ];
}

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: getIceServers() });
}
