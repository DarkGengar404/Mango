import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function WebRTCManager() {
  const { 
    socket, user, voiceUsers, videoStreams, 
    localStream, localScreenStream,
    peerConnections, setPeerConnection,
    setRemoteStream
  } = useStore();

  const pcs = useRef<Record<number, RTCPeerConnection>>({});
  const localTracks = useRef<Record<string, RTCRtpSender>>({}); // pcId_trackId -> sender
  const makingOffer = useRef<Record<number, boolean>>({});
  const ignoreOffer = useRef<Record<number, boolean>>({});

  // Sync peer connections with voice/video users
  useEffect(() => {
    if (!socket || !user) return;

    const allRelevantUserIds = new Set([
      ...voiceUsers.map(u => u.id),
      ...Object.keys(videoStreams).map(id => parseInt(id))
    ]);
    allRelevantUserIds.delete(user.id);

    // Remove stale connections
    Object.keys(pcs.current).forEach(idStr => {
      const id = parseInt(idStr);
      if (!allRelevantUserIds.has(id)) {
        console.log(`[WebRTC] Closing connection to ${id}`);
        pcs.current[id].close();
        delete pcs.current[id];
        delete makingOffer.current[id];
        delete ignoreOffer.current[id];
        // Cleanup localTracks for this user
        Object.keys(localTracks.current).forEach(key => {
          if (key.startsWith(`${id}_`)) delete localTracks.current[key];
        });
        setPeerConnection(id, null);
        setRemoteStream(id, null);
      }
    });

    // Create new connections if needed
    allRelevantUserIds.forEach(id => {
      if (!pcs.current[id]) {
        createPeerConnection(id);
      }
    });
  }, [voiceUsers, videoStreams, socket, user]);

  // Sync local tracks to all peer connections
  useEffect(() => {
    Object.entries(pcs.current).forEach(([idStr, pc]) => {
      const id = parseInt(idStr);
      if (pc instanceof RTCPeerConnection) {
        syncTracks(id, pc);
      }
    });
  }, [localStream, localScreenStream]);

  const createPeerConnection = (otherUserId: number) => {
    console.log(`[WebRTC] Creating connection to ${otherUserId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcs.current[otherUserId] = pc;
    setPeerConnection(otherUserId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc_signal', {
          to: otherUserId,
          signal: { candidate: event.candidate }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state to ${otherUserId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${otherUserId}:`, event.track.kind);
      
      let currentStream = useStore.getState().remoteStreams[otherUserId];
      if (!currentStream) {
        currentStream = new MediaStream();
      }
      
      if (!currentStream.getTracks().includes(event.track)) {
        currentStream.addTrack(event.track);
      }
      
      setRemoteStream(otherUserId, currentStream);

      if (event.streams && event.streams[0]) {
        event.streams[0].onremovetrack = (removeEvent) => {
          console.log(`[WebRTC] Track removed from ${otherUserId}:`, removeEvent.track.kind);
          const latestStream = useStore.getState().remoteStreams[otherUserId];
          if (latestStream) {
            latestStream.removeTrack(removeEvent.track);
            setRemoteStream(otherUserId, latestStream);
          }
        };
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current[otherUserId] = true;
        console.log(`[WebRTC] Negotiation needed for ${otherUserId}`);
        await pc.setLocalDescription();
        socket?.emit('webrtc_signal', {
          to: otherUserId,
          signal: { sdp: pc.localDescription }
        });
      } catch (err) {
        console.error(`[WebRTC] Negotiation error for ${otherUserId}:`, err);
      } finally {
        makingOffer.current[otherUserId] = false;
      }
    };

    // Initial sync of tracks
    syncTracks(otherUserId, pc);

    return pc;
  };

  const syncTracks = (otherUserId: number, pc: RTCPeerConnection) => {
    const streams = [
      { stream: localStream, prefix: 'voice' },
      { stream: localScreenStream, prefix: 'screen' }
    ];

    const currentTrackIds = new Set<string>();

    streams.forEach(({ stream, prefix }) => {
      if (stream) {
        stream.getTracks().forEach(track => {
          const key = `${otherUserId}_${prefix}_${track.id}`;
          currentTrackIds.add(key);
          if (!localTracks.current[key]) {
            console.log(`[WebRTC] Adding ${prefix} track ${track.kind} to ${otherUserId}`);
            localTracks.current[key] = pc.addTrack(track, stream);
          }
        });
      }
    });

    // Remove tracks that are no longer in local streams
    Object.keys(localTracks.current).forEach(key => {
      if (key.startsWith(`${otherUserId}_`) && !currentTrackIds.has(key)) {
        console.log(`[WebRTC] Removing track ${key} from ${otherUserId}`);
        const sender = localTracks.current[key];
        try {
          pc.removeTrack(sender);
        } catch (e) {
          console.error(`[WebRTC] Failed to remove track ${key}:`, e);
        }
        delete localTracks.current[key];
      }
    });
  };

  // Handle incoming signals
  useEffect(() => {
    if (!socket || !user) return;

    const handleSignal = async (data: { from: number, signal: any }) => {
      const { from, signal } = data;
      let pc = pcs.current[from];
      
      if (!pc) {
        pc = createPeerConnection(from);
      }

      try {
        if (signal.sdp) {
          const polite = user.id > from;
          const offerCollision = signal.sdp.type === 'offer' && 
            (makingOffer.current[from] || pc.signalingState !== 'stable');
            
          ignoreOffer.current[from] = !polite && offerCollision;
          if (ignoreOffer.current[from]) {
            console.log(`[WebRTC] Ignoring colliding offer from ${from}`);
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            await pc.setLocalDescription();
            socket.emit('webrtc_signal', {
              to: from,
              signal: { sdp: pc.localDescription }
            });
          }
        } else if (signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            if (!ignoreOffer.current[from]) {
              console.error(`[WebRTC] Error adding ICE candidate from ${from}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`[WebRTC] Signal error from ${from}:`, err);
      }
    };

    socket.on('webrtc_signal', handleSignal);
    return () => {
      socket.off('webrtc_signal', handleSignal);
    };
  }, [socket, user]);

  return null;
}
