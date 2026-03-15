import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MonitorOff, X, VideoOff, Maximize2, Minimize2, Eye } from 'lucide-react';
import { motion } from 'motion/react';
import { sounds } from '../lib/sounds';

export function Screenshare({ onClose, mode, targetUserId, stream }: { onClose: () => void, mode: 'screen' | 'camera', targetUserId?: number, stream?: MediaStream }) {
  const { socket, user, users, screenshareSettings, setScreenshareSettings, streamViewers } = useStore();
  const { quality, fps } = screenshareSettings;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const encoderRef = useRef<VideoEncoder | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const streamRef = useRef<MediaStream | null>(stream || null);

  const viewers = streamViewers[targetUserId || user?.id || 0] || [];
  const viewerNames = viewers.map(id => users.find(u => u.id === id)?.displayName || 'Unknown').join(', ');

  // Ensure video srcObject is set and stays playing
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && !targetUserId) {
      // Only set srcObject if it's different to avoid interruptions
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      
      const playVideo = async () => {
        try {
          if (video.paused) {
            await video.play();
          }
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            console.error('Video play failed', e);
          }
        }
      };

      playVideo();
      
      const handlePlay = () => {
        playVideo();
      };
      
      window.addEventListener('focus', handlePlay);
      document.addEventListener('visibilitychange', handlePlay);
      
      return () => {
        window.removeEventListener('focus', handlePlay);
        document.removeEventListener('visibilitychange', handlePlay);
      };
    }
  }, [stream, targetUserId]);

  // Stream lifecycle: stop tracks on unmount
  useEffect(() => {
    streamRef.current = stream || null;
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [stream]);

  const forceKeyFrame = useRef(false);

  // Encoder lifecycle
  useEffect(() => {
    if (targetUserId || !stream || !socket) return;
    
    let isCancelled = false;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const handleRequestKeyframe = () => {
      forceKeyFrame.current = true;
    };
    socket.on('request_keyframe', handleRequestKeyframe);

    const startEncoder = async () => {
      if (typeof VideoEncoder === 'undefined') {
        console.error('VideoEncoder is not supported');
        return;
      }

      try {
        socket?.emit('video_stream_start', mode);
        socket?.emit('play_sound', 'start_share');
        sounds.playStartShare();
        setIsSharing(true);

        const initEncoder = {
          output: (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata) => {
            if (isCancelled) return;
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
        const settings = track.getSettings();
        
        let width = (settings.width || 1280) & ~1;
        let height = (settings.height || 720) & ~1;
        
        if (quality === '720p') {
          width = 1280;
          height = 720;
        } else if (quality === '1080p') {
          width = 1920;
          height = 1080;
        }

        encoder.configure({
          codec: 'vp8',
          width,
          height,
          bitrate: quality === '1080p' ? 4_000_000 : 2_000_000, 
          framerate: fps,
          latencyMode: 'realtime'
        });
        encoderRef.current = encoder;

        if (typeof (window as any).MediaStreamTrackProcessor === 'function') {
          const processor = new (window as any).MediaStreamTrackProcessor({ track });
          const reader = processor.readable.getReader();
          const encodeFrames = async () => {
            while (!isCancelled) {
              try {
                const { done, value } = await reader.read();
                if (done) break;
                if (encoder.state === 'configured') {
                  const keyFrame = forceKeyFrame.current || value.timestamp % (fps * 2) === 0;
                  encoder.encode(value, { keyFrame });
                  if (forceKeyFrame.current) forceKeyFrame.current = false;
                }
                value.close();
              } catch (e) {
                if (!isCancelled) console.error('Read frame error', e);
                break;
              }
            }
            reader.releaseLock();
          };
          encodeFrames();
        } else {
          // Fallback for browsers without MediaStreamTrackProcessor
          const fallbackVideo = document.createElement('video');
          fallbackVideo.srcObject = new MediaStream([track]);
          fallbackVideo.muted = true;
          fallbackVideo.playsInline = true;
          
          const playFallback = async () => {
            try {
              await fallbackVideo.play();
            } catch (e: any) {
              if (e.name !== 'AbortError') {
                console.error('Fallback video play failed', e);
              }
            }
          };
          playFallback();
          
          let frameCount = 0;
          const drawAndEncode = () => {
            if (isCancelled) {
              fallbackVideo.pause();
              fallbackVideo.srcObject = null;
              return;
            }
            if (encoder.state === 'configured' && fallbackVideo.readyState >= 2) {
              try {
                const frame = new VideoFrame(fallbackVideo, { timestamp: performance.now() * 1000 });
                frameCount++;
                const keyFrame = forceKeyFrame.current || frameCount % (fps * 2) === 0;
                encoder.encode(frame, { keyFrame });
                if (forceKeyFrame.current) forceKeyFrame.current = false;
                frame.close();
              } catch (e) {
                console.error('VideoFrame creation failed', e);
              }
            }
            setTimeout(drawAndEncode, 1000 / fps);
          };
          setTimeout(drawAndEncode, 1000 / fps);
        }
      } catch (e) {
        console.error('Encoder setup failed', e);
      }
    };

    startEncoder();

    return () => {
      isCancelled = true;
      socket.off('request_keyframe', handleRequestKeyframe);
      if (encoderRef.current && encoderRef.current.state !== 'closed') {
        encoderRef.current.close();
        encoderRef.current = null;
      }
      socket?.emit('video_stream_stop');
      socket?.emit('play_sound', 'stop_share');
      sounds.playStopShare();
      setIsSharing(false);
    };
  }, [mode, stream, quality, fps, targetUserId]);

  // Join/Leave stream tracking
  useEffect(() => {
    if (targetUserId && socket) {
      socket.emit('join_stream', targetUserId);
      socket.emit('play_sound', 'join_stream');
      sounds.playJoinStream();
      return () => {
        socket.emit('leave_stream', targetUserId);
        socket.emit('play_sound', 'leave_stream');
        sounds.playLeaveStream();
      };
    }
  }, [targetUserId, socket]);

  const stopShare = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    onClose();
  };

  // Receive sharing
  useEffect(() => {
    if (!socket || !targetUserId) return;
    if (typeof VideoDecoder === 'undefined') {
      console.error('VideoDecoder is not supported in this browser.');
      return;
    }

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
      if (data.from !== targetUserId) return;
      if (decoder.state === 'unconfigured') {
        decoder.configure(data.config);
        setReceiving(true);
      }
    });

    socket.on('video_chunk', (data) => {
      if (data.from !== targetUserId) return;
      if (decoder.state === 'configured') {
        try {
          const chunk = new EncodedVideoChunk({
            type: data.type,
            timestamp: data.timestamp,
            data: data.chunk
          });
          decoder.decode(chunk);
        } catch (e) {
          console.error('Decode error', e);
        }
      }
    });

    return () => {
      socket.off('video_config');
      socket.off('video_chunk');
      if (decoder.state !== 'closed') decoder.close();
    };
  }, [socket, targetUserId]);

  const content = (
    <>
      <div className="p-2 flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 cursor-move handle">
        <div className="flex flex-col">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            {mode === 'screen' ? <MonitorOff className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            {targetUserId ? `Viewing ${mode === 'screen' ? 'Stream' : 'Camera'}` : `Your ${mode === 'screen' ? 'Stream' : 'Camera'}`}
          </h2>
          {!targetUserId && mode === 'screen' && (
            <div className="flex gap-2 mt-1">
              <select 
                value={quality} 
                onChange={(e) => setScreenshareSettings({ ...screenshareSettings, quality: e.target.value as any })}
                className="bg-zinc-800 text-[10px] text-zinc-300 rounded px-1 outline-none"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="source">Source</option>
              </select>
              <select 
                value={fps} 
                onChange={(e) => setScreenshareSettings({ ...screenshareSettings, fps: parseInt(e.target.value) as any })}
                className="bg-zinc-800 text-[10px] text-zinc-300 rounded px-1 outline-none"
              >
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="text-zinc-400 hover:text-white p-1">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => { stopShare(); onClose(); }} className="text-zinc-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-black flex items-center justify-center overflow-hidden relative">
        {viewers.length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-300 backdrop-blur-sm border border-white/5">
            <Eye className="w-3 h-3 text-emerald-400" />
            <span className="truncate max-w-[150px]">{viewers.length} watching: {viewerNames}</span>
          </div>
        )}
        {!targetUserId ? (
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
        ) : receiving ? (
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
        ) : (
          <div className="text-zinc-500 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mb-2"></div>
            <p className="text-sm">Connecting...</p>
          </div>
        )}
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        {content}
      </div>
    );
  }

  return (
    <motion.div 
      drag 
      dragHandle=".handle"
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="fixed bottom-24 right-8 w-80 h-60 bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 flex flex-col overflow-hidden z-50"
    >
      {content}
    </motion.div>
  );
}
