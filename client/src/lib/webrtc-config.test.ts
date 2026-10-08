import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyIceAddress, createPeerConnection, DEFAULT_STUN_URLS, getDirectIceServers, getIceServers, prepareIceServers, resetRuntimeIceServersForTests, summarizeIceCandidate } from "./webrtc-config";

describe("WebRTC ICE configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetRuntimeIceServersForTests();
  });

  it("uses a public STUN fallback when deployment variables are absent", () => {
    vi.stubEnv("VITE_WEBRTC_ICE_SERVERS", "");
    vi.stubEnv("VITE_STUN_URLS", "");
    vi.stubEnv("VITE_TURN_URLS", "");
    expect(getIceServers()).toEqual(DEFAULT_STUN_URLS.map((urls) => ({ urls })));
  });

  it("summarizes ICE candidates without retaining network addresses", () => {
    expect(summarizeIceCandidate({
      candidate: "candidate:1 1 udp 2122260223 192.0.2.10 54321 typ host generation 0 ufrag test network-cost 999",
    })).toEqual({ type: "host", protocol: "udp", addressKind: "public-ipv4", tcpType: undefined });
    expect(summarizeIceCandidate({
      candidate: "candidate:2 1 tcp 1518280447 example.local 9 typ host tcptype active generation 0",
    })).toEqual({ type: "host", protocol: "tcp", addressKind: "mdns", tcpType: "active" });
  });

  it("classifies candidate addresses without exposing the address", () => {
    expect(classifyIceAddress("10.0.0.4")).toBe("private-ipv4");
    expect(classifyIceAddress("203.0.113.7")).toBe("public-ipv4");
    expect(classifyIceAddress("fe80::1")).toBe("link-local-ipv6");
    expect(classifyIceAddress("2001:db8::1")).toBe("public-ipv6");
    expect(classifyIceAddress("abc123.local")).toBe("mdns");
  });

  it("keeps explicitly configured STUN and TURN servers", () => {
    vi.stubEnv("VITE_WEBRTC_ICE_SERVERS", "");
    vi.stubEnv("VITE_STUN_URLS", "stun:example.test:3478");
    vi.stubEnv("VITE_TURN_URLS", "turn:example.test:3478");
    vi.stubEnv("VITE_TURN_USERNAME", "user");
    vi.stubEnv("VITE_TURN_CREDENTIAL", "secret");
    expect(getIceServers()).toEqual([
      { urls: "stun:example.test:3478" },
      { urls: "turn:example.test:3478", username: "user", credential: "secret" },
    ]);
  });

  it("keeps TURN out of the initial direct connection", () => {
    vi.stubEnv("VITE_WEBRTC_ICE_SERVERS", "");
    vi.stubEnv("VITE_STUN_URLS", "stun:example.test:3478");
    vi.stubEnv("VITE_TURN_URLS", "turn:relay.example.test:3478");
    expect(getDirectIceServers()).toEqual([{ urls: "stun:example.test:3478" }]);
  });

  it("enforces the selected ICE transport instead of silently mixing modes", () => {
    const configurations: RTCConfiguration[] = [];
    class PeerConnectionStub {
      constructor(configuration: RTCConfiguration) {
        configurations.push(configuration);
      }
    }
    vi.stubGlobal("RTCPeerConnection", PeerConnectionStub);

    createPeerConnection(false);
    createPeerConnection(true);

    expect(configurations.map(({ iceTransportPolicy }) => iceTransportPolicy)).toEqual(["all", "relay"]);
    expect(configurations[0].iceServers).toEqual(DEFAULT_STUN_URLS.map((urls) => ({ urls })));
  });

  it("prepares configured relay servers without sending a request to the application server", async () => {
    vi.stubEnv("VITE_WEBRTC_ICE_SERVERS", "");
    vi.stubEnv("VITE_STUN_URLS", "stun:example.test:3478");
    vi.stubEnv("VITE_TURN_URLS", "turn:relay.example.test:3478");
    vi.stubEnv("VITE_TURN_USERNAME", "user");
    vi.stubEnv("VITE_TURN_CREDENTIAL", "secret");
    const fetcher = vi.fn();
    await expect(prepareIceServers(fetcher, true)).resolves.toEqual(getIceServers());
    await expect(prepareIceServers(fetcher, false)).resolves.toEqual([{ urls: "stun:example.test:3478" }]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
