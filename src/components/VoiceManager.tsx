import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function VoiceManager() {
  const { socket, inVoice, user, isMuted, isDeafened, addSpeakingUser, removeSpeakingUser, selectedInputDevice, selectedOutputDevice, localVolumes, localMutes, inputGain, noiseSuppressionLevel } = useStore();
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speakingTimeouts = useRef<Record<number, NodeJS.Timeout>>({});

  const handleSpeak = (id: number) => {
    addSpeakingUser(id);
    if (speakingTimeouts.current[id]) clearTimeout(speakingTimeouts.current[id]);
    speakingTimeouts.current[id] = setTimeout(() => {
      removeSpeakingUser(id);
    }, 500);
  };

  useEffect(() => {
    if (socket && inVoice) {
      socket.emit('voice_state', { muted: isMuted, deafened: isDeafened });
    }
  }, [socket, inVoice, isMuted, isDeafened]);

  useEffect(() => {
    if (!inVoice || !socket) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
      return;
    }

    let isActive = true;

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
        if (!isActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        
        // Add a compressor to help with noise floor and leveling
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
        compressor.knee.setValueAtTime(40, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(compressor);
        compressor.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          const state = useStore.getState();
          if (state.isMuted) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const gain = state.inputGain;
          const suppression = state.noiseSuppressionLevel / 100; // 0 to 1
          
          // Calculate RMS for speaking indicator and gate
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
          const rms = Math.sqrt(sum / inputData.length);
          
          // Improved gate logic
          // Higher suppression = higher threshold
          // We use a logarithmic scale for more natural feel
          const threshold = 0.001 * Math.pow(10, suppression * 2); // 0.001 to 0.1
          
          if (rms < threshold) {
            // Send silence if below threshold to keep stream alive but quiet
            // Or just return to save bandwidth
            return; 
          }
          if (user) handleSpeak(user.id);

          // Convert Float32Array to Int16Array for smaller payload
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Apply gain
            let s = inputData[i] * gain;
            s = Math.max(-1, Math.min(1, s));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          socket.emit('voice_chunk', pcm16.buffer);
        };

      } catch (err) {
        console.error("Failed to access microphone", err);
      }
    };

    startVoice();

    return () => {
      isActive = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
    };
  }, [inVoice, socket, selectedInputDevice]);

  // Receiving audio
  useEffect(() => {
    if (!socket || !inVoice) return;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Set output device if supported
    if (selectedOutputDevice && typeof (audioCtx as any).setSinkId === 'function') {
      (audioCtx as any).setSinkId(selectedOutputDevice).catch(console.error);
    }

    let nextTime = 0;

    const handleChunk = (data: { from: number, chunk: ArrayBuffer }) => {
      const state = useStore.getState();
      const isDeafenedNow = state.isDeafened;
      const isLocallyMuted = state.localMutes[data.from];
      
      if (isDeafenedNow || isLocallyMuted || data.from === user?.id) return;
      
      handleSpeak(data.from);

      const pcm16 = new Int16Array(data.chunk);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      const audioBuffer = audioCtx.createBuffer(1, float32.length, audioCtx.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      
      // Apply local volume
      const gainNode = audioCtx.createGain();
      const userVolume = state.localVolumes[data.from] ?? 1;
      gainNode.gain.value = userVolume;
      
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (nextTime < audioCtx.currentTime) {
        nextTime = audioCtx.currentTime + 0.05; // small buffer
      }
      source.start(nextTime);
      nextTime += audioBuffer.duration;
    };

    socket.on('voice_chunk', handleChunk);

    return () => {
      socket.off('voice_chunk', handleChunk);
      if (audioCtx.state !== 'closed') {
        audioCtx.close().catch(console.error);
      }
    };
  }, [socket, inVoice, user, selectedOutputDevice]);

  return null; // Invisible manager
}
