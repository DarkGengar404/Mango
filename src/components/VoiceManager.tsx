import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function VoiceManager() {
  const { socket, inVoice, user, isMuted, isDeafened, addSpeakingUser, selectedInputDevice, selectedOutputDevice, localVolumes, localMutes, setLocalStream, remoteStreams } = useStore();
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioElements = useRef<Record<number, HTMLAudioElement>>({});

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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
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
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        setLocalStream(stream);

        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;

        await audioCtx.audioWorklet.addModule('/audio-processor.js');
        const source = audioCtx.createMediaStreamSource(stream);
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
      setLocalStream(null);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, [inVoice, selectedInputDevice]);

  // Handle muting
  const { localStream } = useStore();
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
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
