import { useState, useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTC(socket: Socket | null, roomId: string | null, currentGuestId: string | null) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize or get local stream
  const getOrCreateLocalStream = useCallback(async (needVideo = false, needAudio = true): Promise<MediaStream> => {
    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: needVideo,
        audio: needAudio,
      });
      return stream;
    } catch (err: any) {
      console.warn('Failed to access media devices:', err);
      let errMsg = 'Failed to access camera or microphone';
      if (err.name === 'NotAllowedError') errMsg = 'Permission to access camera/microphone was denied';
      if (err.name === 'NotFoundError') errMsg = 'No camera or microphone found on this device';
      setMediaError(errMsg);
      throw err;
    }
  }, []);

  // Voice activity detection
  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -80;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingCounter = 0;

      const checkAudio = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        const speakingNow = average > 18;
        if (speakingNow) {
          speakingCounter = 5;
        } else if (speakingCounter > 0) {
          speakingCounter--;
        }

        const active = speakingCounter > 0;
        setIsSpeaking((prev) => {
          if (prev !== active && socket && roomId) {
            socket.emit('participant:media_state', {
              roomId,
              mediaState: { isSpeaking: active },
            });
          }
          return active;
        });

        animFrameRef.current = requestAnimationFrame(checkAudio);
      };

      checkAudio();
    } catch (err) {
      console.warn('Speaking detection initialization failed:', err);
    }
  }, [socket, roomId]);

  // Create or retrieve Peer Connection for a remote guest
  const createPeerConnection = useCallback((remoteGuestId: string): RTCPeerConnection => {
    if (peerConnections.current.has(remoteGuestId)) {
      return peerConnections.current.get(remoteGuestId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local media tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Add screen share tracks if active
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((track) => {
        pc.addTrack(track, localScreenStream);
      });
    }

    // Remote ICE candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && roomId) {
        socket.emit('signal:ice', {
          toGuestId: remoteGuestId,
          roomId,
          candidate: event.candidate,
        });
      }
    };

    // Remote track handler
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((prev) => ({
        ...prev,
        [remoteGuestId]: stream,
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[remoteGuestId];
          return next;
        });
      }
    };

    peerConnections.current.set(remoteGuestId, pc);
    return pc;
  }, [localStream, localScreenStream, socket, roomId]);

  // Handle incoming signaling events
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleOffer = async ({ fromGuestId, offer }: { fromGuestId: string; offer: RTCSessionDescriptionInit }) => {
      const pc = createPeerConnection(fromGuestId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('signal:answer', {
        toGuestId: fromGuestId,
        roomId,
        answer,
      });
    };

    const handleAnswer = async ({ fromGuestId, answer }: { fromGuestId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnections.current.get(fromGuestId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleIce = async ({ fromGuestId, candidate }: { fromGuestId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnections.current.get(fromGuestId);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate:', e);
        }
      }
    };

    const handleParticipantLeft = ({ guestId }: { guestId: string }) => {
      const pc = peerConnections.current.get(guestId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(guestId);
      }
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[guestId];
        return next;
      });
    };

    // When a participant joins, the existing peer initiates an offer
    const handleParticipantJoined = async ({ guestId }: { guestId: string }) => {
      if (guestId === currentGuestId) return;
      const pc = createPeerConnection(guestId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('signal:offer', {
        toGuestId: guestId,
        roomId,
        offer,
      });
    };

    socket.on('signal:offer', handleOffer);
    socket.on('signal:answer', handleAnswer);
    socket.on('signal:ice', handleIce);
    socket.on('room:participant_left', handleParticipantLeft);
    socket.on('room:participant_joined', handleParticipantJoined);

    return () => {
      socket.off('signal:offer', handleOffer);
      socket.off('signal:answer', handleAnswer);
      socket.off('signal:ice', handleIce);
      socket.off('room:participant_left', handleParticipantLeft);
      socket.off('room:participant_joined', handleParticipantJoined);
    };
  }, [socket, roomId, currentGuestId, createPeerConnection]);

  // Toggle Microphone
  const toggleMic = async () => {
    try {
      if (isMicOn) {
        // Mute
        if (localStream) {
          localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        }
        setIsMicOn(false);
        setIsSpeaking(false);
        if (socket && roomId) {
          socket.emit('participant:media_state', {
            roomId,
            mediaState: { audioEnabled: false, isSpeaking: false },
          });
        }
      } else {
        // Unmute
        let stream = localStream;
        if (!stream || stream.getAudioTracks().length === 0) {
          const newStream = await getOrCreateLocalStream(isCamOn, true);
          if (localStream) {
            newStream.getVideoTracks().forEach((t) => stream?.addTrack(t));
          }
          stream = newStream;
          setLocalStream(stream);

          // Add audio track to existing peer connections
          stream.getAudioTracks().forEach((track) => {
            peerConnections.current.forEach((pc) => {
              pc.addTrack(track, stream!);
            });
          });
        } else {
          stream.getAudioTracks().forEach((t) => (t.enabled = true));
        }

        setIsMicOn(true);
        startSpeakingDetection(stream);

        if (socket && roomId) {
          socket.emit('participant:media_state', {
            roomId,
            mediaState: { audioEnabled: true },
          });
        }
      }
    } catch (err) {
      console.error('Failed to toggle microphone:', err);
    }
  };

  // Toggle Camera
  const toggleCam = async () => {
    try {
      if (isCamOn) {
        // Disable camera
        if (localStream) {
          localStream.getVideoTracks().forEach((t) => {
            t.enabled = false;
            t.stop();
            localStream.removeTrack(t);
          });
        }
        setIsCamOn(false);
        if (socket && roomId) {
          socket.emit('participant:media_state', {
            roomId,
            mediaState: { videoEnabled: false },
          });
        }
      } else {
        // Enable camera
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const videoTrack = videoStream.getVideoTracks()[0];

        let stream = localStream;
        if (!stream) {
          stream = new MediaStream([videoTrack]);
          setLocalStream(stream);
        } else {
          stream.addTrack(videoTrack);
          setLocalStream(new MediaStream(stream.getTracks()));
        }

        // Add or replace video track in peer connections
        peerConnections.current.forEach((pc) => {
          pc.addTrack(videoTrack, stream!);
        });

        setIsCamOn(true);
        if (socket && roomId) {
          socket.emit('participant:media_state', {
            roomId,
            mediaState: { videoEnabled: true },
          });
        }
      }
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  };

  // Start Screen Sharing
  const startScreenShare = async () => {
    try {
      setMediaError(null);
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      setLocalScreenStream(screenStream);
      setIsScreenSharing(true);

      // Add track to peer connections
      peerConnections.current.forEach((pc) => {
        pc.addTrack(videoTrack, screenStream);
      });

      if (socket && roomId) {
        socket.emit('participant:screen_share', {
          roomId,
          isSharing: true,
        });
      }

      // Handle user stopping screen share via browser floating bar
      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('Failed to start screen share:', err);
        setMediaError('Could not start screen sharing');
      }
    }
  };

  // Stop Screen Sharing
  const stopScreenShare = () => {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((t) => t.stop());
      setLocalScreenStream(null);
    }
    setIsScreenSharing(false);

    if (socket && roomId) {
      socket.emit('participant:screen_share', {
        roomId,
        isSharing: false,
      });
    }
  };

  // Cleanup on unmount or room leave
  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((t) => t.stop());
    }

    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    setLocalStream(null);
    setLocalScreenStream(null);
    setRemoteStreams({});
    setIsMicOn(false);
    setIsCamOn(false);
    setIsScreenSharing(false);
    setIsSpeaking(false);
  }, [localStream, localScreenStream]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    localStream,
    localScreenStream,
    remoteStreams,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isSpeaking,
    mediaError,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    cleanup,
  };
}
