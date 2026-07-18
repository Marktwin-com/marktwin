import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { base64UrlToBytes, bytesToBase64Url, decodeInvite, deriveDocumentKey, encodeInvite, encryptJson, decryptJson, randomSecret } from "@/lib/private-crypto";
import { createPeerConnection } from "@/lib/webrtc-config";

type ManualPacket =
  | { type: "state-request" }
  | { type: "y-update"; update: string };

interface ManualOffer {
  v: 1;
  documentSecret: string;
  description: RTCSessionDescriptionInit;
}

interface ManualAnswer {
  v: 1;
  description: RTCSessionDescriptionInit;
}

function waitForIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(() => resolve(), 1500);
  });
}

function replaceYText(ytext: Y.Text, value: string) {
  ytext.doc?.transact(() => {
    ytext.delete(0, ytext.length);
    ytext.insert(0, value);
  });
}

function currentDescription(pc: RTCPeerConnection): RTCSessionDescriptionInit {
  if (!pc.localDescription) {
    throw new Error("WebRTC local description was not created.");
  }
  return {
    type: pc.localDescription.type,
    sdp: pc.localDescription.sdp,
  };
}

export default function ManualPairPage() {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const [content, setContent] = useState("");
  const [offer, setOffer] = useState("");
  const [incomingOffer, setIncomingOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [incomingAnswer, setIncomingAnswer] = useState("");
  const [status, setStatus] = useState("This isolated transport lab does not use Marktwin signaling.");

  useEffect(() => {
    const observer = () => setContent(ytext.toString());
    const updateHandler = async (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || !keyRef.current || channelRef.current?.readyState !== "open") return;
      channelRef.current.send(await encryptJson(keyRef.current, { type: "y-update", update: bytesToBase64Url(update) }));
    };
    ytext.observe(observer);
    ydoc.on("update", updateHandler);
    return () => {
      ytext.unobserve(observer);
      ydoc.off("update", updateHandler);
    };
  }, [ydoc, ytext]);

  const setupChannel = (channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.onopen = async () => {
      setStatus("Manual WebRTC connection open.");
      if (keyRef.current) {
        channel.send(await encryptJson(keyRef.current, { type: "y-update", update: bytesToBase64Url(Y.encodeStateAsUpdate(ydoc)) }));
      }
    };
    channel.onmessage = async (event) => {
      if (!keyRef.current) return;
      const payload = await decryptJson<ManualPacket>(keyRef.current, event.data);
      if (payload.type === "state-request") {
        channel.send(await encryptJson(keyRef.current, { type: "y-update", update: bytesToBase64Url(Y.encodeStateAsUpdate(ydoc)) }));
      }
      if (payload.type === "y-update") {
        Y.applyUpdate(ydoc, base64UrlToBytes(payload.update), "remote");
      }
    };
  };

  const createOwnerOffer = async () => {
    const documentSecret = randomSecret();
    keyRef.current = await deriveDocumentKey(documentSecret);
    const pc = createPeerConnection();
    pcRef.current = pc;
    setupChannel(pc.createDataChannel("marktwin-manual"));
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    setOffer(encodeInvite({ v: 1, documentSecret, description: currentDescription(pc) } satisfies ManualOffer));
    setStatus("Offer ready. Send it to the collaborator out-of-band.");
  };

  const createCollaboratorAnswer = async () => {
    const parsed = decodeInvite<ManualOffer>(incomingOffer);
    keyRef.current = await deriveDocumentKey(parsed.documentSecret);
    const pc = createPeerConnection();
    pcRef.current = pc;
    pc.ondatachannel = (event) => setupChannel(event.channel);
    await pc.setRemoteDescription(parsed.description);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    setAnswer(encodeInvite({ v: 1, description: currentDescription(pc) } satisfies ManualAnswer));
    setStatus("Answer ready. Send it back to the owner.");
  };

  const acceptAnswer = async () => {
    if (!pcRef.current) return;
    const parsed = decodeInvite<ManualAnswer>(incomingAnswer);
    await pcRef.current.setRemoteDescription(parsed.description);
    setStatus("Answer accepted. Waiting for data channel.");
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] p-4">
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">
        <section className="space-y-4">
          <div className="rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-sm text-amber-100">
            Technical demo only: this page pairs one temporary Yjs text document. It is not connected to an agent workspace, its files, discussion, roles, or Changes review.
          </div>
          <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
            <CardHeader>
              <CardTitle>Manual WebRTC transport lab</CardTitle>
              <CardDescription className="text-gray-400">{status}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={createOwnerOffer} className="w-full">Owner: Create Offer</Button>
              <Textarea readOnly value={offer} placeholder="Owner offer appears here" className="min-h-28 bg-[hsl(var(--obsidian-bg))]" />
              <Textarea value={incomingAnswer} onChange={(event) => setIncomingAnswer(event.target.value)} placeholder="Owner pastes collaborator answer here" className="min-h-28 bg-[hsl(var(--obsidian-bg))]" />
              <Button onClick={acceptAnswer} disabled={!incomingAnswer} variant="outline" className="w-full">Owner: Accept Answer</Button>
            </CardContent>
          </Card>

          <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
            <CardHeader>
              <CardTitle>Collaborator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={incomingOffer} onChange={(event) => setIncomingOffer(event.target.value)} placeholder="Collaborator pastes owner offer here" className="min-h-28 bg-[hsl(var(--obsidian-bg))]" />
              <Button onClick={createCollaboratorAnswer} disabled={!incomingOffer} className="w-full">Collaborator: Create Answer</Button>
              <Textarea readOnly value={answer} placeholder="Collaborator answer appears here" className="min-h-28 bg-[hsl(var(--obsidian-bg))]" />
            </CardContent>
          </Card>
        </section>

        <Card className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
          <CardHeader>
            <CardTitle>Temporary demo document</CardTitle>
            <CardDescription className="text-gray-400">Edits travel only over the manual WebRTC connection.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={content}
              onChange={(event) => replaceYText(ytext, event.target.value)}
              className="min-h-[74vh] font-mono bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
