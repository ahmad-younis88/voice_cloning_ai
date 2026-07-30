"use client";
import { useState, useRef } from "react";

export default function Home() {
  const [status, setStatus] = useState("idle"); // idle, connecting, active
  const [volume, setVolume] = useState(0);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioElRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);

  const initWebRTC = async () => {
    try {
      setStatus("connecting");
      
      // Step 1: Get ephemeral token from our server
      const tokenResponse = await fetch("/api/session", { method: "POST" });
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(
          (errorData.error || `HTTP error! status: ${tokenResponse.status}`) +
          (errorData.details ? "\nDetails: " + errorData.details : "")
        );
      }
      const tokenData = await tokenResponse.json();
      // The API returns { client_secret: { value: "..." } }
      const ephemeralKey = tokenData.client_secret?.value;
      if (!ephemeralKey) {
        console.error("Token response:", JSON.stringify(tokenData));
        throw new Error("No ephemeral key returned. Check server logs.");
      }

      // Step 2: Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Step 3: Set up to play remote audio from the model
      pc.ontrack = (e) => {
        console.log("[WebRTC] Remote track received:", e.track.kind);
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // Step 4: Add local microphone track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = ms;
      pc.addTrack(ms.getTracks()[0]);

      // Step 5: Set up data channel for sending and receiving events (REQUIRED)
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        console.log("[DataChannel] Connection opened - session is live!");
      });

      dc.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          console.log("[Realtime Event]", event.type, event);
          
          // Handle error events from the server
          if (event.type === "error") {
            console.error("[Realtime Error]", event.error);
          }
        } catch (parseErr) {
          console.warn("[DataChannel] Non-JSON message:", e.data);
        }
      });

      dc.addEventListener("close", () => {
        console.log("[DataChannel] Connection closed");
      });

      // Step 6: Monitor ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          console.warn("[WebRTC] Connection lost, cleaning up...");
          stopWebRTC();
        }
      };

      // Step 7: Setup audio analyzer for local microphone volume visualization
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
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
        setVolume(avg);
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Step 8: Create SDP offer and exchange with OpenAI
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        }
      });

      if (!sdpResponse.ok) {
        const sdpError = await sdpResponse.text();
        throw new Error(`SDP Exchange Failed (${sdpResponse.status}): ${sdpError}`);
      }
      
      // Step 9: Set the remote SDP answer
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      console.log("[WebRTC] Connection established successfully!");
      setStatus("active");

    } catch (err) {
      console.error("[WebRTC] Init failed:", err);
      alert("Error: " + err.message);
      stopWebRTC();
    }
  };

  const stopWebRTC = () => {
    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // Stop all media tracks (release microphone)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    // Close audio context
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    // Cancel animation frame
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
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
