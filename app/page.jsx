"use client";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [status, setStatus] = useState("idle"); // idle, connecting, active
  const [volume, setVolume] = useState(0);
  const pcRef = useRef(null);
  const audioElRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  const initWebRTC = async () => {
    try {
      setStatus("connecting");
      
      const tokenResponse = await fetch("/api/session", { method: "POST" });
      if (!tokenResponse.ok) {
        throw new Error("Failed to get session token");
      }
      const tokenData = await tokenResponse.json();
      const ephemeralKey = tokenData.client_secret?.value || tokenData.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");
      
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // Add local microphone track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      // Setup audio analyzer for local microphone
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(ms);
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setVolume(avg); // 0 to 255
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime/calls";
      const sdpResponse = await fetch(baseUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
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
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setVolume(0);
    setStatus("idle");
  };

  const toggleConnection = () => {
    if (status === "active" || status === "connecting") {
      stopWebRTC();
    } else {
      initWebRTC();
    }
  };

  // Calculate dynamic scale based on volume (0 to 255)
  // Scale between 1 and 1.3
  const dynamicScale = status === "active" ? 1 + (volume / 255) * 0.4 : 1;

  return (
    <>
      <audio ref={audioElRef} autoPlay style={{ display: "none" }} />
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="container">
        <div 
          className={`orb ${status}`} 
          onClick={toggleConnection}
          style={{ transform: `scale(${dynamicScale})` }}
        />
      </div>
    </>
  );
}
