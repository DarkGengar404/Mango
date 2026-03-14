import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MonitorOff, X, VideoOff } from 'lucide-react';

export function Screenshare({ onClose, mode }: { onClose: () => void, mode: 'screen' | 'camera' }) {
  const { socket, user } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  
  const encoderRef = useRef<VideoEncoder | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start sharing
  const startShare = async () => {
    try {
      const stream = mode === 'screen' 
        ? await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'monitor',
              frameRate: 60,
              width: { ideal: 3840 },
              height: { ideal: 2160 }
            },
            audio: true
          })
        : await navigator.mediaDevices.getUserMedia({
            video: {
              frameRate: 30,
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: true
          });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsSharing(true);

      const track = stream.getVideoTracks()[0];
      const processor = new (window as any).MediaStreamTrackProcessor({ track });
      const reader = processor.readable.getReader();

      const initEncoder = {
        output: (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata) => {
          const buffer = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(buffer);
          socket?.emit('video_chunk', {
            chunk: buffer,
            type: chunk.type,
            timestamp: chunk.timestamp
          });
          if (metadata.decoderConfig) {
            socket?.emit('video_config', { config: metadata.decoderConfig });
          }
        },
        error: (e: Error) => console.error('Encoder error', e)
      };

      const encoder = new VideoEncoder(initEncoder);
      encoder.configure({
        codec: 'vp8',
        width: track.getSettings().width || 1920,
        height: track.getSettings().height || 1080,
        bitrate: 5_000_000, // 5 Mbps for high quality
        framerate: 60
      });
      encoderRef.current = encoder;

      const encodeFrames = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (encoder.state === 'configured') {
            encoder.encode(value, { keyFrame: value.timestamp % 60 === 0 });
          }
          value.close();
        }
      };
      encodeFrames();

      track.onended = () => stopShare();
    } catch (e) {
      console.error('Screenshare failed', e);
    }
  };

  const stopShare = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    encoderRef.current?.close();
    setIsSharing(false);
  };

  // Receive sharing
  useEffect(() => {
    if (!socket || isSharing) return;

    const initDecoder = {
      output: (frame: VideoFrame) => {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = frame.displayWidth;
            canvasRef.current.height = frame.displayHeight;
            ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
          }
        }
        frame.close();
      },
      error: (e: Error) => console.error('Decoder error', e)
    };

    const decoder = new VideoDecoder(initDecoder);
    decoderRef.current = decoder;

    socket.on('video_config', (data) => {
      if (data.from === user?.id) return;
      if (decoder.state === 'unconfigured') {
        decoder.configure(data.config);
        setReceiving(true);
      }
    });

    socket.on('video_chunk', (data) => {
      if (data.from === user?.id) return;
      if (decoder.state === 'configured') {
        const chunk = new EncodedVideoChunk({
          type: data.type,
          timestamp: data.timestamp,
          data: data.chunk
        });
        decoder.decode(chunk);
      }
    });

    return () => {
      socket.off('video_config');
      socket.off('video_chunk');
      if (decoder.state !== 'closed') decoder.close();
    };
  }, [socket, isSharing, user]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="p-4 flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800">
        <h2 className="text-white font-semibold">{mode === 'screen' ? 'High-End Screenshare' : 'Camera Share'} (WebCodecs)</h2>
        <div className="flex gap-4">
          {!isSharing && !receiving && (
            <button onClick={startShare} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Start {mode === 'screen' ? 'Sharing' : 'Camera'}
            </button>
          )}
          {isSharing && (
            <button onClick={stopShare} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              {mode === 'screen' ? <MonitorOff className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />} Stop {mode === 'screen' ? 'Sharing' : 'Camera'}
            </button>
          )}
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        {isSharing ? (
          <video ref={videoRef} autoPlay muted className="max-w-full max-h-full rounded-lg shadow-2xl border border-zinc-800" />
        ) : receiving ? (
          <canvas ref={canvasRef} className="max-w-full max-h-full rounded-lg shadow-2xl border border-zinc-800" />
        ) : (
          <div className="text-zinc-500 flex flex-col items-center">
            {mode === 'screen' ? <MonitorOff className="w-16 h-16 mb-4 opacity-50" /> : <VideoOff className="w-16 h-16 mb-4 opacity-50" />}
            <p>No active {mode === 'screen' ? 'screenshare' : 'camera'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
