import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Track } from 'livekit-client';
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';

export function VoiceManager() {
  const { socket, inVoice, user, isMuted, isDeafened, isKrispEnabled, addSpeakingUser, selectedInputDevice, selectedOutputDevice, localVolumes, localMutes, setLocalStream, remoteStreams } = useStore();
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioElements = useRef<Record<number, HTMLAudioElement>>({});
  const originalStreamRef = useRef<MediaStream | null>(null);
  const krispProcessorRef = useRef<any>(null);

  useEffect(() => {
    if (socket && inVoice) {
      socket.emit('voice_state', { muted: isMuted, deafened: isDeafened });
    }
  }, [socket, inVoice, isMuted, isDeafened]);

  // Render remote audio streams
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([idStr, stream]) => {
      const id = parseInt(idStr);
      if (!audioElements.current[id]) {
        const audio = new Audio();
        audio.autoplay = true;
        audioElements.current[id] = audio;
      }
      if (audioElements.current[id].srcObject !== stream) {
        audioElements.current[id].srcObject = stream;
      }
      
      // Apply output device
      if (selectedOutputDevice && (audioElements.current[id] as any).setSinkId) {
        (audioElements.current[id] as any).setSinkId(selectedOutputDevice);
      }
    });

    // Cleanup audio elements for users no longer in remoteStreams
    Object.keys(audioElements.current).forEach(idStr => {
      const id = parseInt(idStr);
      if (!remoteStreams[id]) {
        audioElements.current[id].srcObject = null;
        audioElements.current[id].remove();
        delete audioElements.current[id];
      }
    });
  }, [remoteStreams, selectedOutputDevice]);

  useEffect(() => {
    if (!inVoice) {
      setLocalStream(null);
      if (krispProcessorRef.current) {
        krispProcessorRef.current.dispose();
        krispProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
      return;
    }

    const startVoice = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: !isKrispEnabled,
            autoGainControl: true,
          }
        });
        originalStreamRef.current = stream;
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioContextRef.current = audioCtx;

        let finalStream = stream;
        try {
          if (isKrispEnabled && isKrispNoiseFilterSupported()) {
            const processor = KrispNoiseFilter();
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
          } else {
            console.log("[VoiceManager] Krisp noise suppression disabled or not supported");
          }
        } catch (e) {
          console.error("[VoiceManager] Failed to initialize Krisp noise suppression", e);
        }

        setLocalStream(finalStream);

        await audioCtx.audioWorklet.addModule('/audio-processor.js');
        const source = audioCtx.createMediaStreamSource(finalStream);
        const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
        workletNodeRef.current = workletNode;

        source.connect(workletNode);
        // workletNode.connect(audioCtx.destination); // Don't hear ourselves

        workletNode.port.onmessage = (e) => {
          const inputData = e.data;
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);
          if (rms > 0.01 && user) {
            addSpeakingUser(user.id);
          }
        };

      } catch (err) {
        console.error("Failed to access microphone", err);
      }
    };

    startVoice();

    return () => {
      if (useStore.getState().localStream) {
        useStore.getState().localStream?.getTracks().forEach(t => t.stop());
      }
      if (originalStreamRef.current) {
        originalStreamRef.current.getTracks().forEach(t => t.stop());
        originalStreamRef.current = null;
      }
      if (krispProcessorRef.current) {
        krispProcessorRef.current.dispose();
        krispProcessorRef.current = null;
      }
      setLocalStream(null);
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
    };
  }, [inVoice, selectedInputDevice, isKrispEnabled]);

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

  // Update audio elements volume/mute
  useEffect(() => {
    Object.entries(audioElements.current).forEach(([idStr, audio]) => {
      const id = parseInt(idStr);
      const volume = localVolumes[id] ?? 1;
      const muted = localMutes[id] || isDeafened;
      if (audio instanceof HTMLAudioElement) {
        audio.volume = muted ? 0 : volume;
      }
    });
  }, [localVolumes, localMutes, isDeafened]);

  return null;
}
