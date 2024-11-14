import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3000');

export const VideoCall: React.FC = () => {
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    // Request user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((mediaStream) => {
      setStream(mediaStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
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
      if (event.candidate) {
        socket.emit('ice-candidate', { target: remoteSocketId, candidate: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
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
    <div>
      <h2>WebRTC Video Call</h2>
      <div>
        <video ref={localVideoRef} autoPlay playsInline muted />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
      <button onClick={callUser} disabled={!remoteSocketId}>
        Call
      </button>
    </div>
  );
};
