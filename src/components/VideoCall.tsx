import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3000');

export const VideoCall: React.FC = () => {
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    // Request access to the user's microphone
    navigator.mediaDevices.getUserMedia({ audio: true }).then((mediaStream) => {
      setStream(mediaStream);
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = mediaStream;
      }
    });

    // Handle signaling events
    socket.on('user-joined', (id) => setRemoteSocketId(id));
    socket.on('offer', handleReceiveOffer);
    socket.on('answer', handleReceiveAnswer);
    socket.on('ice-candidate', handleNewICECandidateMsg);

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleNewICECandidateMsg = (msg: any) => {
    peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(msg.candidate));
  };

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && remoteSocketId) {
        socket.emit('ice-candidate', { target: remoteSocketId, candidate: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    if (stream) {
      stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    }

    return peerConnection;
  };

  const handleReceiveOffer = async (data: any) => {
    const peerConnection = createPeerConnection();
    peerConnectionRef.current = peerConnection;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', { sdp: answer, target: data.callerId });
  };

  const handleReceiveAnswer = async (data: any) => {
    await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.sdp));
  };

  const callUser = async () => {
    if (remoteSocketId) {
      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('offer', { sdp: offer, target: remoteSocketId });
    }
  };

  return (
    <div className="app">
      <h2>WebRTC Audio Call</h2>
      <div>
        <audio ref={localAudioRef} autoPlay controls muted />
        <audio ref={remoteAudioRef} autoPlay controls />
      </div>
      <button onClick={callUser} disabled={!remoteSocketId}>
        Call
      </button>
    </div>
  );
};

