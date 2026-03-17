import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Track } from 'livekit-client';
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';

export function VoiceManager() {
  const { socket, inVoice, user, isMuted, isDeafened, isKrispEnabled, addSpeakingUser, selectedInputDevice, selectedOutputDevice, localVolumes, localMutes, setLocalStream, remoteVoiceStreams, refreshAudioCounter } = useStore();
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const remoteAudioNodes = useRef<Record<number, { source: MediaStreamAudioSourceNode, gain: GainNode, stream: MediaStream }>>({});
  const localSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const originalStreamRef = useRef<MediaStream | null>(null);
  const krispProcessorRef = useRef<any>(null);

  // Initialize AudioContext once
  useEffect(() => {
    if (inVoice && !audioContextRef.current) {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      audioCtx.onstatechange = () => {
        console.log(`[VoiceManager] AudioContext state: ${audioCtx.state}`);
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(console.error);
        }
      };

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(console.error);
      }

      if ((audioCtx as any).setSinkId && selectedOutputDevice) {
        (audioCtx as any).setSinkId(selectedOutputDevice).catch(console.error);
      }
    }

    return () => {
      if (!inVoice && audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
    };
  }, [inVoice, refreshAudioCounter, selectedOutputDevice]);

  useEffect(() => {
    if (socket && inVoice) {
      socket.emit('voice_state', { muted: isMuted, deafened: isDeafened });
    }
  }, [socket, inVoice, isMuted, isDeafened]);

  // Render remote audio streams
  useEffect(() => {
    if (!audioContextRef.current) return;
    const audioCtx = audioContextRef.current;

    Object.entries(remoteVoiceStreams).forEach(([idStr, stream]) => {
      const id = parseInt(idStr);
      const existing = remoteAudioNodes.current[id];
      
      if ((!existing || existing.stream !== stream) && stream.getAudioTracks().length > 0) {
        if (existing) {
          existing.source.disconnect();
          existing.gain.disconnect();
        }
        
        console.log(`[VoiceManager] Connecting audio for user ${id}, stream: ${stream.id}`);
        const source = audioCtx.createMediaStreamSource(stream);
        const gain = audioCtx.createGain();
        source.connect(gain);
        gain.connect(audioCtx.destination);
        remoteAudioNodes.current[id] = { source, gain, stream };
      }
      
      if (remoteAudioNodes.current[id]) {
        const { gain } = remoteAudioNodes.current[id];
        const volume = localVolumes[id] ?? 1;
        const muted = localMutes[id] || isDeafened;
        gain.gain.setTargetAtTime(muted ? 0 : volume, audioCtx.currentTime, 0.05);
      }
    });

    // Cleanup remote audio nodes
    Object.keys(remoteAudioNodes.current).forEach(idStr => {
      const id = parseInt(idStr);
      if (!remoteVoiceStreams[id]) {
        remoteAudioNodes.current[id].source.disconnect();
        remoteAudioNodes.current[id].gain.disconnect();
        delete remoteAudioNodes.current[id];
      }
    });
  }, [remoteVoiceStreams, localVolumes, localMutes, isDeafened]);

  useEffect(() => {
    if (!inVoice) {
      setLocalStream(null);
      socket?.emit('set_stream_id', { type: 'voice', streamId: null });
      if (krispProcessorRef.current) {
        try { krispProcessorRef.current.dispose(); } catch(e) {}
        krispProcessorRef.current = null;
      }
      return;
    }

    const startVoice = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          }
        });
        originalStreamRef.current = stream;
        
        const audioCtx = audioContextRef.current;
        if (!audioCtx) return;
        
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        
        let finalStream = stream;
        try {
          if (isKrispEnabled && isKrispNoiseFilterSupported()) {
            console.log("[VoiceManager] Initializing Krisp...");
            const processor = await (KrispNoiseFilter as any)();
            krispProcessorRef.current = processor;
            await processor.init({
              kind: Track.Kind.Audio,
              track: stream.getAudioTracks()[0],
              audioContext: audioCtx,
            });
            if (processor.processedTrack) {
              finalStream = new MediaStream([processor.processedTrack]);
              console.log("[VoiceManager] Krisp noise suppression enabled");
            }
          }
        } catch (e) {
          console.error("[VoiceManager] Failed to initialize Krisp noise suppression", e);
        }

        setLocalStream(finalStream);
        socket?.emit('set_stream_id', { type: 'voice', streamId: finalStream.id });

        await audioCtx.audioWorklet.addModule('/audio-processor.js');
        
        if (localSourceNodeRef.current) {
          localSourceNodeRef.current.disconnect();
        }
        
        const source = audioCtx.createMediaStreamSource(finalStream);
        localSourceNodeRef.current = source;
        
        const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
        workletNodeRef.current = workletNode;

        source.connect(workletNode);
        const dummyGain = audioCtx.createGain();
        dummyGain.gain.value = 0;
        workletNode.connect(dummyGain);
        dummyGain.connect(audioCtx.destination);

        workletNode.port.onmessage = (e) => {
          const inputData = e.data;
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);
          
          const isSpeaking = rms > 0.01 && !isMuted;
          if (isSpeaking && user) {
            addSpeakingUser(user.id);
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              socket?.emit('speaking', true);
            }
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = setTimeout(() => {
              isSpeakingRef.current = false;
              removeSpeakingUser(user.id);
              socket?.emit('speaking', false);
            }, 500);
          }
        };
      } catch (err) {
        console.error("Failed to access microphone", err);
      }
    };

    startVoice();

    return () => {
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
      if (useStore.getState().localStream) {
        useStore.getState().localStream?.getTracks().forEach(t => t.stop());
      }
      if (originalStreamRef.current) {
        originalStreamRef.current.getTracks().forEach(t => t.stop());
        originalStreamRef.current = null;
      }
      if (krispProcessorRef.current) {
        try { krispProcessorRef.current.dispose(); } catch(e) {}
        krispProcessorRef.current = null;
      }
      setLocalStream(null);
      socket?.emit('set_stream_id', { type: 'voice', streamId: null });
    };
  }, [inVoice, selectedInputDevice, isKrispEnabled]);

  const isSpeakingRef = useRef(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { removeSpeakingUser } = useStore();

  // Handle muting
  const { localStream } = useStore();
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted && !isDeafened;
      });
    }
    if (originalStreamRef.current) {
      originalStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted && !isDeafened;
      });
    }
  }, [localStream, isMuted, isDeafened]);

  return null;
}
