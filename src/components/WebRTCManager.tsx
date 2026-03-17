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
    setRemoteVoiceStream, setRemoteScreenStream,
    userStreamIds
  } = useStore();

  const pcs = useRef<Record<number, RTCPeerConnection>>({});
  const localTracks = useRef<Record<string, RTCRtpSender>>({}); // pcId_trackId -> sender
  const makingOffer = useRef<Record<number, boolean>>({});
  const ignoreOffer = useRef<Record<number, boolean>>({});
  const sdpFilter = (sdp: string) => {
    // Maximize audio quality
    let newSdp = sdp.replace(/a=fmtp:111 (.*)/g, 'a=fmtp:111 $1;maxaveragebitrate=128000;stereo=1;sprop-stereo=1;useinbandfec=1');
    return newSdp;
  };

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
        setRemoteVoiceStream(id, null);
        setRemoteScreenStream(id, null);
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
        console.log(`[WebRTC] New ICE candidate for ${otherUserId}:`, event.candidate.candidate);
        socket?.emit('webrtc_signal', {
          to: otherUserId,
          signal: { candidate: event.candidate }
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state to ${otherUserId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state to ${otherUserId}: ${pc.connectionState}`);
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${otherUserId}:`, event.track.kind, "Stream ID:", event.streams[0]?.id);
      const stream = event.streams[0];
      if (!stream) {
        console.warn(`[WebRTC] No stream found for track from ${otherUserId}`);
        return;
      }

      const streamId = stream.id;
      const userIds = useStore.getState().userStreamIds[otherUserId];

      if (userIds?.voice === streamId) {
        setRemoteVoiceStream(otherUserId, stream);
      } else if (userIds?.screen === streamId) {
        setRemoteScreenStream(otherUserId, stream);
      } else {
        // Fallback
        if (event.track.kind === 'audio') {
          setRemoteVoiceStream(otherUserId, stream);
        } else {
          setRemoteScreenStream(otherUserId, stream);
        }
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current[otherUserId] = true;
        console.log(`[WebRTC] Negotiation needed for ${otherUserId}`);
        const offer = await pc.createOffer();
        const modifiedOffer = {
          type: offer.type,
          sdp: sdpFilter(offer.sdp || '')
        };
        await pc.setLocalDescription(modifiedOffer);
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
    const state = useStore.getState();
    const streams = [
      { stream: state.localStream, prefix: 'voice' },
      { stream: state.localScreenStream, prefix: 'screen' }
    ];

    const currentTrackIds = new Set<string>();

    streams.forEach(({ stream, prefix }) => {
      if (stream) {
        stream.getTracks().forEach(track => {
          const key = `${otherUserId}_${prefix}_${track.id}`;
          currentTrackIds.add(key);
          if (!localTracks.current[key]) {
            console.log(`[WebRTC] Adding ${prefix} track ${track.kind} to ${otherUserId}`);
            const sender = pc.addTrack(track, stream);
            localTracks.current[key] = sender;
            
            // Set bitrate for video
            if (track.kind === 'video') {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              if (prefix === 'screen') {
                params.encodings[0].maxBitrate = 5000000; // 5Mbps for screenshare
              } else {
                params.encodings[0].maxBitrate = 2500000; // 2.5Mbps for camera
              }
              sender.setParameters(params).catch(console.error);
            }
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
            const answer = await pc.createAnswer();
            const modifiedAnswer = {
              type: answer.type,
              sdp: sdpFilter(answer.sdp || '')
            };
            await pc.setLocalDescription(modifiedAnswer);
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
