/**
 * Krisp AudioWorkletProcessor
 * Handles real-time background noise suppression using a Wasm-compiled neural network.
 */

// Define types for AudioWorklet environment
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: any): void;

class KrispProcessor extends AudioWorkletProcessor {
  private wasmInstance: any = null;
  private rnnoiseState: number = 0;
  private inPtr: number = 0;
  private outPtr: number = 0;
  private frameSize: number = 480; // RNNoise standard frame size
  
  // Ring buffers to handle the mismatch between Web Audio (128 samples) 
  // and Neural Model (480 samples) block sizes.
  private inputBuffer: Float32Array;
  private outputBuffer: Float32Array;
  private inputWriteIndex: number = 0;
  private inputReadIndex: number = 0;
  private outputWriteIndex: number = 0;
  private outputReadIndex: number = 0;
  private bufferSize: number = 8192;

  constructor() {
    super();
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.outputBuffer = new Float32Array(this.bufferSize);
    
    this.port.onmessage = async (event) => {
      if (event.data.type === 'init') {
        const { wasmBytes } = event.data;
        try {
          const module = await WebAssembly.instantiate(wasmBytes);
          this.wasmInstance = module.instance;
          
          const { exports } = this.wasmInstance;
          // Initialize RNNoise state
          this.rnnoiseState = exports.rnnoise_create(0);
          // Allocate memory on Wasm heap for input/output frames (Float32 = 4 bytes)
          this.inPtr = exports.malloc(this.frameSize * 4);
          this.outPtr = exports.malloc(this.frameSize * 4);
          
          this.port.postMessage({ type: 'loaded' });
        } catch (e: any) {
          this.port.postMessage({ type: 'error', error: e.message });
        }
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0][0];
    const output = outputs[0][0];

    // If no input or output, keep the processor alive
    if (!input || !output) return true;

    // 1. Push incoming 128-sample block into the input ring buffer
    for (let i = 0; i < input.length; i++) {
      this.inputBuffer[this.inputWriteIndex] = input[i];
      this.inputWriteIndex = (this.inputWriteIndex + 1) % this.bufferSize;
    }

    // 2. If Wasm is ready, process as many 480-sample frames as possible
    if (this.wasmInstance) {
      const { exports } = this.wasmInstance;
      const heap = new Float32Array(exports.memory.buffer);
      
      let availableInput = (this.inputWriteIndex - this.inputReadIndex + this.bufferSize) % this.bufferSize;
      
      while (availableInput >= this.frameSize) {
        // Copy from ring buffer to Wasm heap
        for (let i = 0; i < this.frameSize; i++) {
          // RNNoise expects 16-bit PCM range (-32768 to 32767)
          heap[this.inPtr / 4 + i] = this.inputBuffer[this.inputReadIndex] * 32768.0;
          this.inputReadIndex = (this.inputReadIndex + 1) % this.bufferSize;
        }

        // Run inference
        exports.rnnoise_process_frame(this.rnnoiseState, this.outPtr, this.inPtr);

        // Copy cleaned audio from Wasm heap to output ring buffer
        for (let i = 0; i < this.frameSize; i++) {
          this.outputBuffer[this.outputWriteIndex] = heap[this.outPtr / 4 + i] / 32768.0;
          this.outputWriteIndex = (this.outputWriteIndex + 1) % this.bufferSize;
        }
        
        availableInput = (this.inputWriteIndex - this.inputReadIndex + this.bufferSize) % this.bufferSize;
      }
    } else {
      // Bypass mode: copy input directly to output buffer if model isn't ready
      for (let i = 0; i < input.length; i++) {
        this.outputBuffer[this.outputWriteIndex] = input[i];
        this.outputWriteIndex = (this.outputWriteIndex + 1) % this.bufferSize;
      }
      this.inputReadIndex = this.inputWriteIndex;
    }

    // 3. Pull processed audio from output ring buffer into the 128-sample output block
    const availableOutput = (this.outputWriteIndex - this.outputReadIndex + this.bufferSize) % this.bufferSize;
    const toCopy = Math.min(output.length, availableOutput);
    
    for (let i = 0; i < toCopy; i++) {
      output[i] = this.outputBuffer[this.outputReadIndex];
      this.outputReadIndex = (this.outputReadIndex + 1) % this.bufferSize;
    }
    
    // If we have a buffer underrun (latency), fill with silence
    for (let i = toCopy; i < output.length; i++) {
      output[i] = 0;
    }

    return true;
  }
}

// @ts-ignore
registerProcessor('krisp-processor', KrispProcessor);
