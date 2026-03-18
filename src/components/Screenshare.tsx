import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { MonitorOff, X, VideoOff, Maximize2, Minimize2, Eye, Settings2, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { sounds } from '../lib/sounds';
import { UserContextMenu } from './UserContextMenu';

export function Screenshare({ onClose, mode, targetUserId }: { onClose: () => void, mode: 'screen' | 'camera', targetUserId?: number }) {
  const { socket, user, users, streamViewers, localScreenStream, remoteScreenStreams, setLocalScreenStream, screenshareSettings, setScreenshareSettings, localScreenVolumes, setLocalScreenVolume, localScreenMutes, setLocalScreenMute, facingMode, setFacingMode } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQualitySettings, setShowQualitySettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ userId: number, x: number, y: number } | null>(null);
  const [isLocalMuted, setIsLocalMuted] = useState(false);

  const viewers = streamViewers[targetUserId || user?.id || 0] || [];
  const viewerNames = viewers.map(id => users.find(u => u.id === id)?.displayName || 'Unknown').join(', ');

  const volume = localScreenVolumes[targetUserId || 0] ?? 1;
  const isMuted = localScreenMutes[targetUserId || 0] ?? false;

  // Rendering logic
  useEffect(() => {
    if (!videoRef.current) return;

    let streamToRender: MediaStream | null = null;
    if (!targetUserId) {
      streamToRender = localScreenStream;
      console.log("[Screenshare] Local preview mode. Stream:", streamToRender?.id, "Tracks:", streamToRender?.getTracks().length);
    } else {
      streamToRender = remoteScreenStreams[targetUserId] || null;
      console.log("[Screenshare] Remote view mode. Target:", targetUserId, "Stream:", streamToRender?.id, "Tracks:", streamToRender?.getTracks().length);
    }

    if (videoRef.current.srcObject !== streamToRender) {
      console.log("[Screenshare] Setting srcObject to stream:", streamToRender?.id, "Tracks:", streamToRender?.getTracks().length);
      videoRef.current.srcObject = streamToRender;
      videoRef.current.muted = !targetUserId; // Mute only if local preview
      if (streamToRender) {
        console.log("[Screenshare] Stream tracks:", streamToRender.getTracks().map(t => t.kind));
        videoRef.current.play().catch(e => {
          if (e.name !== 'AbortError') {
            console.error("[Screenshare] Immediate play failed", e);
          }
        });
        videoRef.current.onloadedmetadata = () => {
          console.log("[Screenshare] Metadata loaded, calling play()");
          videoRef.current?.play().catch(e => {
            if (e.name !== 'AbortError') {
              console.error("[Screenshare] Video play failed", e);
            }
          });
        };
      } else {
        videoRef.current.onloadedmetadata = null;
      }
    }
    
    if (streamToRender) {
      const handleAddTrack = () => {
        console.log("[Screenshare] Track added to stream, playing video");
        if (videoRef.current) {
          videoRef.current.srcObject = streamToRender;
          videoRef.current.play().catch(console.error);
        }
      };
      streamToRender.addEventListener('addtrack', handleAddTrack);
      return () => {
        streamToRender.removeEventListener('addtrack', handleAddTrack);
      };
    }
  }, [localScreenStream, remoteScreenStreams, targetUserId, isFullscreen]);

  useEffect(() => {
    let streamToRender: MediaStream | null = null;
    if (!targetUserId) {
      streamToRender = localScreenStream;
    } else {
      streamToRender = remoteScreenStreams[targetUserId] || null;
    }

    if (audioRef.current && streamToRender && targetUserId) {
      audioRef.current.srcObject = streamToRender;
      audioRef.current.volume = isMuted ? 0 : Math.min(1, volume);
    }
  }, [localScreenStream, remoteScreenStreams, targetUserId, volume, isMuted]);

  useEffect(() => {
    if (!targetUserId || !socket) return;
    
    socket.emit('join_stream', targetUserId);
    sounds.playJoinStream();

    return () => {
      socket.emit('leave_stream', targetUserId);
      sounds.playLeaveStream();
    };
  }, [targetUserId, socket]);

  useEffect(() => {
    if (!targetUserId) {
      socket?.emit('video_stream_start', mode);
      sounds.playStartShare();
      return () => {
        socket?.emit('video_stream_stop');
        sounds.playStopShare();
        if (localScreenStream) {
          localScreenStream.getTracks().forEach(t => t.stop());
          setLocalScreenStream(null);
        }
      };
    }
  }, [mode, targetUserId]);

  const stopShare = () => {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
      setLocalScreenStream(null);
    }
    onClose();
  };

  const content = (
    <>
      <div className="p-2 flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 cursor-move handle">
        <div className="flex flex-col">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            {mode === 'screen' ? <MonitorOff className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            {targetUserId ? `Viewing ${mode === 'screen' ? 'Stream' : 'Camera'}` : `Your ${mode === 'screen' ? 'Stream' : 'Camera'}`}
          </h2>
        </div>
        <div className="flex gap-2">
          {!targetUserId && mode === 'camera' && (
            <button 
              onClick={() => setFacingMode(facingMode === 'user' ? 'environment' : 'user')} 
              className="text-zinc-400 hover:text-white p-1"
              title="Switch Camera"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {!targetUserId && (
            <div className="relative">
              <button onClick={() => setShowQualitySettings(!showQualitySettings)} className="text-zinc-400 hover:text-white p-1">
                <Settings2 className="w-4 h-4" />
              </button>
              {showQualitySettings && (
                <div className="absolute top-full right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-2 w-40 z-20 text-xs">
                  <div className="mb-2">
                    <label className="block text-zinc-400 mb-1">Resolution</label>
                    <select
                      value={screenshareSettings.quality}
                      onChange={(e) => setScreenshareSettings({ ...screenshareSettings, quality: e.target.value as 'source' | '720p' | '1080p' })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-white"
                    >
                      <option value="source">Source</option>
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">FPS</label>
                    <select
                      value={screenshareSettings.fps}
                      onChange={(e) => setScreenshareSettings({ ...screenshareSettings, fps: parseInt(e.target.value) as 30 | 60 })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-white"
                    >
                      <option value={60}>60 FPS</option>
                      <option value={30}>30 FPS</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="text-zinc-400 hover:text-white p-1">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => { stopShare(); onClose(); }} className="text-zinc-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        className="flex-1 bg-black flex items-center justify-center overflow-hidden relative group"
        onContextMenu={(e) => {
          if (targetUserId) {
            e.preventDefault();
            setContextMenu({ userId: targetUserId, x: e.clientX, y: e.clientY });
          }
        }}
      >
        {viewers.length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded text-[10px] text-zinc-300 backdrop-blur-sm border border-white/5">
            <Eye className="w-3 h-3 text-emerald-400" />
            <span className="truncate max-w-[150px]">{viewers.length} watching: {viewerNames}</span>
          </div>
        )}
        <video ref={videoRef} autoPlay muted={!targetUserId} playsInline className="w-full h-full object-contain" />
        {targetUserId && remoteScreenStreams[targetUserId]?.getAudioTracks().length > 0 && (
          <audio ref={audioRef} autoPlay muted={false} />
        )}
        
        <div className="absolute bottom-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {targetUserId ? (
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
              <button
                onClick={() => setLocalScreenMute(targetUserId, !isMuted)}
                className="text-white/70 hover:text-white"
              >
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setLocalScreenVolume(targetUserId, parseFloat(e.target.value))}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          ) : (
            localScreenStream?.getAudioTracks().length > 0 && (
              <button
                onClick={() => {
                  const track = localScreenStream.getAudioTracks()[0];
                  if (track) {
                    track.enabled = !track.enabled;
                    setIsLocalMuted(!track.enabled);
                  }
                }}
                className="p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white border border-white/10"
                title="Mute your screenshare for others"
              >
                {!isLocalMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            )
          )}
        </div>
      </div>
      {contextMenu && (
        <UserContextMenu 
          userId={contextMenu.userId} 
          position={{ x: contextMenu.x, y: contextMenu.y }} 
          onClose={() => setContextMenu(null)} 
          isScreenContext
        />
      )}
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
