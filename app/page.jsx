"use client";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [status, setStatus] = useState("idle"); // idle, connecting, active
  const pcRef = useRef(null);
  const audioElRef = useRef(null);

  const initWebRTC = async () => {
    try {
      setStatus("connecting");
      
      const tokenResponse = await fetch("/api/session", { method: "POST" });
      if (!tokenResponse.ok) {
        throw new Error("Failed to get session token");
      }
      const tokenData = await tokenResponse.json();
      const ephemeralKey = tokenData.client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");
      
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Play remote audio
      audioElRef.current = document.createElement("audio");
      audioElRef.current.autoplay = true;
      pc.ontrack = (e) => {
        audioElRef.current.srcObject = e.streams[0];
      };

      // Add local microphone track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1"
        }
      });

      if (!sdpResponse.ok) throw new Error("Failed to exchange SDP");
      
      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      setStatus("active");

    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
      setStatus("idle");
    }
  };

  const stopWebRTC = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setStatus("idle");
  };

  const toggleConnection = () => {
    if (status === "active" || status === "connecting") {
      stopWebRTC();
    } else {
      initWebRTC();
    }
  };

  return (
    <>
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="container">
        <div className="orb-container" onClick={toggleConnection}>
          <div className={`orb ${status}`} />
        </div>
      </div>
    </>
  );
}
