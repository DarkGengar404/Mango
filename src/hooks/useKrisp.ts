import { useState, useEffect, useRef } from 'react';

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
    };

    // If Krisp is disabled or no stream, bypass and cleanup
    if (!rawStream || !isKrispEnabled) {
      setCleanStream(rawStream);
      cleanup();
      return;
    }

    const initKrisp = async () => {
      try {
        // 1. Create AudioContext locked to 48kHz (required by most neural audio models)
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error('AudioContext is not supported');
        }
        const ctx = new AudioContextClass({ sampleRate: 48000 });
        audioContextRef.current = ctx;

        // 2. Load the AudioWorklet module
        // Using Vite's URL import ensures the worklet is correctly bundled and served
        const processorUrl = new URL('../lib/krisp-processor.ts', import.meta.url).href;
        try {
          await ctx.audioWorklet.addModule(processorUrl);
        } catch (e) {
          // If it fails because it's already added, we can ignore or log
          console.warn('[Krisp] Module might already be added:', e);
        }

        // 3. Fetch the Wasm binary from a reliable CDN
        const wasmUrl = 'https://unpkg.com/@livekit/krisp-noise-filter@0.4.1/dist/rnnoise.wasm';
        const response = await fetch(wasmUrl);
        if (!response.ok) throw new Error('Could not load rnnoise.wasm binary from CDN');
        const wasmBytes = await response.arrayBuffer();

        // 4. Initialize the Pipeline
        const source = ctx.createMediaStreamSource(rawStream);
        const worklet = new AudioWorkletNode(ctx, 'krisp-processor');
        const destination = ctx.createMediaStreamDestination();

        worklet.port.onmessage = (event) => {
          if (event.data.type === 'loaded') {
            setIsModelLoaded(true);
            console.log('[Krisp] Neural network initialized successfully');
          } else if (event.data.type === 'error') {
            console.error('[Krisp] Runtime error:', event.data.error);
          }
        };

        // Send the Wasm binary to the processor thread
        worklet.port.postMessage({ type: 'init', wasmBytes });

        // Connect nodes
        source.connect(worklet);
        worklet.connect(destination);

        sourceNodeRef.current = source;
        workletNodeRef.current = worklet;
        destinationNodeRef.current = destination;

        // Return the cleaned stream
        setCleanStream(destination.stream);
      } catch (e) {
        console.error('[Krisp] Pipeline initialization failed:', e);
        // Fallback to raw stream on failure
        setCleanStream(rawStream);
      }
    };

    initKrisp();

    return cleanup;
  }, [rawStream, isKrispEnabled]);

  return { cleanStream, isModelLoaded };
}
