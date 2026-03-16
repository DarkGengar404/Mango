class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.005; // Noise gate threshold
    this.smoothing = 0.95;
    this.currentLevel = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      const inputData = input[0];
      
      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);

      // Smooth the level
      this.currentLevel = this.smoothing * this.currentLevel + (1 - this.smoothing) * rms;

      // Apply noise gate
      const gain = this.currentLevel > this.threshold ? 1 : 0;

      // Send audio data back to main thread (optionally gated)
      // We send the original data for volume visualization, but the actual output is gated
      this.port.postMessage(inputData);

      // If we wanted to gate the output to the destination:
      const output = outputs[0];
      if (output && output[0]) {
        for (let i = 0; i < inputData.length; i++) {
          output[0][i] = inputData[i] * gain;
        }
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
