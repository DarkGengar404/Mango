import { useState, useEffect, useRef } from 'react';

import krispProcessorUrl from '../lib/krisp-processor.ts?url';
import rnnoiseWasmUrl from '../lib/rnnoise.wasm?url';

/**
 * useKrisp Hook
 * Manages the neural noise suppression pipeline.
 * 
 * @param rawStream The original MediaStream from getUserMedia
 * @param isKrispEnabled Toggle state for noise suppression
 */
export function useKrisp(rawStream: MediaStream | null, isKrispEnabled: boolean) {
  const [cleanStream, setCleanStream] = useState<MediaStream | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const isKrispEnabledRef = useRef(isKrispEnabled);
  useEffect(() => {
    isKrispEnabledRef.current = isKrispEnabled;
  }, [isKrispEnabled]);

  // Handle initialization and rawStream changes
  useEffect(() => {
    const cleanup = () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      sourceNodeRef.current = null;
      workletNodeRef.current = null;
      destinationNodeRef.current = null;
      setIsModelLoaded(false);
      setCleanStream(null);
    };

    if (!rawStream) {
      cleanup();
      return;
    }

    const initKrisp = async () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          console.error('[Krisp] AudioContext is not supported');
          setCleanStream(rawStream);
          return;
        }
        
        const ctx = new AudioContextClass({ sampleRate: 48000 });
        audioContextRef.current = ctx;

        try {
          await ctx.audioWorklet.addModule(krispProcessorUrl);
        } catch (e) {
          console.error('[Krisp] Failed to load audio worklet module:', e);
          setCleanStream(rawStream);
          return;
        }

        const response = await fetch(rnnoiseWasmUrl);
        if (!response.ok) {
          console.error('[Krisp] Could not load rnnoise.wasm binary');
          setCleanStream(rawStream);
          return;
        }
        const wasmBytes = await response.arrayBuffer();

        const source = ctx.createMediaStreamSource(rawStream);
        const worklet = new AudioWorkletNode(ctx, 'krisp-processor');
        const destination = ctx.createMediaStreamDestination();

        worklet.port.onmessage = (event) => {
          if (event.data.type === 'loaded') {
            setIsModelLoaded(true);
            console.log('[Krisp] Neural network initialized successfully');
            // Sync initial state using the ref to avoid stale closure
            worklet.port.postMessage({ type: 'setEnabled', enabled: isKrispEnabledRef.current });
          } else if (event.data.type === 'error') {
            console.error('[Krisp] Runtime error:', event.data.error);
          }
        };

        worklet.port.postMessage({ type: 'init', wasmBytes });

        source.connect(worklet);
        worklet.connect(destination);

        sourceNodeRef.current = source;
        workletNodeRef.current = worklet;
        destinationNodeRef.current = destination;

        setCleanStream(destination.stream);
      } catch (e) {
        console.error('[Krisp] Pipeline initialization failed:', e);
        setCleanStream(rawStream);
      }
    };

    initKrisp();

    return cleanup;
  }, [rawStream]);

  // Handle real-time toggling
  useEffect(() => {
    if (workletNodeRef.current && isModelLoaded) {
      workletNodeRef.current.port.postMessage({ type: 'setEnabled', enabled: isKrispEnabled });
    }
  }, [isKrispEnabled, isModelLoaded]);

  return { cleanStream: cleanStream || rawStream, isModelLoaded };
}
