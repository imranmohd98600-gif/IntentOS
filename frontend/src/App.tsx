import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Square,
  Pause,
  AlertTriangle,
  Monitor,
  Mic,
  MicOff,
  Hand,
  Search,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  CheckCircle2,
  Camera,
  Video
} from 'lucide-react';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => {
    return localStorage.getItem('intentos_backend_url') || DEFAULT_BACKEND_URL;
  });
  const [showConfig, setShowConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState(backendUrl);

  const [status, setStatus] = useState('stopped');
  const [connected, setConnected] = useState(false);
  const [lastGesture, setLastGesture] = useState('None');
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceState, setVoiceState] = useState('Idle');
  const [voiceHistory, setVoiceHistory] = useState<any[]>([]);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [lastZoomAction, setLastZoomAction] = useState('None');

  const [ttsVoices, setTtsVoices] = useState<any[]>([]);
  const [ttsSelectedVoice, setTtsSelectedVoice] = useState('');
  const [ttsRate, setTtsRate] = useState(175);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [ttsStatus, setTtsStatus] = useState('Idle');
  const [ttsLastText, setTtsLastText] = useState('');

  // Fallback Camera & Voice State
  const [useBrowserCamera, setUseBrowserCamera] = useState(false);
  const [browserCameraActive, setBrowserCameraActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout((window as any)._toastTimeout);
    (window as any)._toastTimeout = window.setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  const getWsUrl = (httpUrl: string) => {
    const trimmed = httpUrl.replace(/\/+$/, '');
    if (trimmed.startsWith('https://')) {
      return trimmed.replace('https://', 'wss://') + '/ws/events';
    }
    return trimmed.replace('http://', 'ws://') + '/ws/events';
  };

  // Populate browser TTS voices
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadSysVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0 && ttsVoices.length === 0) {
          setTtsVoices(v.map(voice => ({ id: voice.name, name: voice.name })));
          if (!ttsSelectedVoice) setTtsSelectedVoice(v[0].name);
        }
      };
      loadSysVoices();
      window.speechSynthesis.onvoiceschanged = loadSysVoices;
    }
  }, [ttsVoices.length, ttsSelectedVoice]);

  // Start Browser Webcam & In-Browser MediaPipe Hand Tracking
  const startBrowserCamera = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }
      setBrowserCameraActive(true);
      showToast('Live Camera Started with MediaPipe Hand Tracking');

      // Initialize In-Browser MediaPipe Hands
      const HandsClass = (window as any).Hands;
      const CameraClass = (window as any).Camera;

      if (HandsClass && videoRef.current) {
        const hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults((results: any) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // Draw Hand Skeleton Connections
            const drawUtils = (window as any);
            if (drawUtils.drawConnectors && drawUtils.drawLandmarks && drawUtils.HAND_CONNECTIONS) {
              drawUtils.drawConnectors(ctx, landmarks, drawUtils.HAND_CONNECTIONS, {
                color: '#00FF88',
                lineWidth: 4
              });
              drawUtils.drawLandmarks(ctx, landmarks, {
                color: '#FF0055',
                lineWidth: 2,
                radius: 4
              });
            }

            // Real-Time Gesture Classification
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];

            const indexPip = landmarks[6];
            const middlePip = landmarks[10];
            const ringPip = landmarks[14];
            const pinkyPip = landmarks[18];

            const indexUp = indexTip.y < indexPip.y;
            const middleUp = middleTip.y < middlePip.y;
            const ringUp = ringTip.y < ringPip.y;
            const pinkyUp = pinkyTip.y < pinkyPip.y;

            const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

            let detected = "None";
            if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
              detected = "Closed Fist";
            } else if (pinchDist < 0.065) {
              detected = "Pinch";
            } else if (indexUp && middleUp && ringUp && pinkyUp) {
              detected = "Open Palm";
            } else if (indexUp && middleUp && !ringUp && !pinkyUp) {
              detected = "Two Fingers";
            } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
              detected = "Index Extended";
            }

            if (detected !== "None") {
              setLastGesture(detected);
            }
          }
          ctx.restore();
        });

        if (CameraClass && videoRef.current) {
          const cam = new CameraClass(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && hands) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          cam.start();
          cameraRef.current = cam;
        }

        handsRef.current = hands;
      }
    } catch (err) {
      console.warn('Browser webcam error:', err);
      showToast('Could not access browser webcam');
    }
  };

  // Stop Browser Webcam & MediaPipe
  const stopBrowserCamera = () => {
    if (cameraRef.current) {
      try { cameraRef.current.stop(); } catch (_) {}
      cameraRef.current = null;
    }
    if (handsRef.current) {
      try { handsRef.current.close(); } catch (_) {}
      handsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setBrowserCameraActive(false);
  };

  // Browser Speech Recognition (Web Speech API)
  const startBrowserSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setVoiceListening(true);
        setVoiceState('listening');
      };

      rec.onresult = (e: any) => {
        const text = e.results[e.results.length - 1][0].transcript.trim();
        handleVoiceInput(text);
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        if (status === 'running') {
          setTimeout(() => {
            try { rec.start(); } catch (_) {}
          }, 1000);
        }
      };

      rec.onend = () => {
        if (status === 'running') {
          try { rec.start(); } catch (_) {}
        } else {
          setVoiceListening(false);
          setVoiceState('Idle');
        }
      };

      rec.start();
      recognitionRef.current = rec;
      showToast('Microphone Listening (Say: "Open Google", "Zoom in", "Stop")');
    } catch (err) {
      console.warn('Error starting speech recognition:', err);
    }
  };

  const stopBrowserSpeech = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setVoiceListening(false);
    setVoiceState('Idle');
  };

  // Handle Recognized Voice Command
  const handleVoiceInput = (text: string) => {
    const lower = text.toLowerCase();
    let reply = "Command recognized.";
    let intent = "unknown";

    if (lower.includes('scroll down')) {
      intent = "scroll_down";
      reply = "Scrolling down.";
      window.scrollBy({ top: 350, behavior: 'smooth' });
    } else if (lower.includes('scroll up')) {
      intent = "scroll_up";
      reply = "Scrolling up.";
      window.scrollBy({ top: -350, behavior: 'smooth' });
    } else if (lower.includes('zoom in')) {
      intent = "zoom_in";
      setZoomEnabled(true);
      setLastZoomAction('Zoom In (+)');
      reply = "Zooming in.";
    } else if (lower.includes('zoom out')) {
      intent = "zoom_out";
      setZoomEnabled(true);
      setLastZoomAction('Zoom Out (-)');
      reply = "Zooming out.";
    } else if (lower.includes('open google')) {
      intent = "browser_open";
      reply = "Opening Google in a new tab.";
      window.open('https://www.google.com', '_blank');
    } else if (lower.includes('stop')) {
      handleAction('stop');
      reply = "Stopping all controls.";
    } else if (lower.includes('pause')) {
      handleAction('pause');
      reply = "Pausing control.";
    } else if (lower.includes('resume') || lower.includes('start')) {
      handleAction('resume');
      reply = "Resuming control.";
    }

    setVoiceHistory(prev => [
      {
        time: new Date().toLocaleTimeString(),
        text,
        actions: [{ intent }],
        reply,
        success: true
      },
      ...prev
    ].slice(0, 5));

    speakTts(reply);
    showToast(`Voice: "${text}" ➔ ${reply}`);
  };

  // Speak TTS (Audio output)
  const speakTts = (text: string) => {
    if (ttsMuted || !text) return;
    setTtsStatus('speaking');
    setTtsLastText(text);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = Math.max(0.5, Math.min(2.0, ttsRate / 175));
      u.volume = ttsVolume;
      u.onend = () => setTtsStatus('Idle');
      u.onerror = () => setTtsStatus('Idle');
      window.speechSynthesis.speak(u);
    }
  };

  // Lifecycle for Camera and Speech based on status
  useEffect(() => {
    if (status === 'running') {
      if (!connected || useBrowserCamera) {
        startBrowserCamera();
      }
      startBrowserSpeech();
    } else if (status === 'stopped') {
      stopBrowserCamera();
      stopBrowserSpeech();
    }
  }, [status, connected, useBrowserCamera]);

  // Backend Polling & WebSocket
  useEffect(() => {
    let active = true;

    const fetchStatus = () => {
      fetch(`${backendUrl}/api/status`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!active) return;
          setConnected(true);
          if (data.running) setStatus(data.paused ? 'paused' : 'running');
          if (data.zoom_enabled !== undefined) setZoomEnabled(data.zoom_enabled);
        })
        .catch(() => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            if (active) setConnected(false);
          }
        });
    };

    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 3000);

    fetch(`${backendUrl}/api/tts/voices`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.voices && data.voices.length > 0) {
          setTtsVoices(data.voices);
          if (data.current_id) setTtsSelectedVoice(data.current_id);
        }
      })
      .catch(() => {});

    try {
      const ws = new WebSocket(getWsUrl(backendUrl));
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setConnected(true);
      };

      ws.onmessage = event => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status_change') setStatus(data.payload.status);
          if (data.type === 'gesture') setLastGesture(data.payload.name);
          if (data.type === 'voice') {
            const item = {
              time: new Date().toLocaleTimeString(),
              text: data.payload.text,
              actions: data.payload.actions || [],
              reply: data.payload.reply,
              success: data.payload.success
            };
            setVoiceHistory(prev => [item, ...prev].slice(0, 5));
          }
          if (data.type === 'zoom_status') {
            if (data.payload.enabled !== undefined) setZoomEnabled(data.payload.enabled);
            if (data.payload.action && data.payload.action !== 'None') {
              setLastZoomAction(data.payload.action);
            }
          }
        } catch (_) {}
      };
    } catch (_) {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAction('stop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (wsRef.current) wsRef.current.close();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [backendUrl]);

  // Handle Control Actions
  const handleAction = async (action: string) => {
    if (action === 'start') {
      setStatus('running');
      showToast('System Started (Camera & Voice Live)');
      speakTts("IntentOS Active. Tracking hand gestures and voice.");
    } else if (action === 'pause') {
      setStatus('paused');
      showToast('System Paused');
    } else if (action === 'resume') {
      setStatus('running');
      showToast('System Resumed');
    } else if (action === 'stop') {
      setStatus('stopped');
      setLastGesture('None');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setTtsStatus('Idle');
      showToast('Emergency Stop (Camera & Voice Off)');
    } else if (action === 'zoom_enable') {
      setZoomEnabled(true);
      showToast('Gesture Zoom Enabled');
    } else if (action === 'zoom_disable') {
      setZoomEnabled(false);
      showToast('Gesture Zoom Disabled');
    }

    try {
      await fetch(`${backendUrl}/api/control/${action}`, { method: 'POST' });
    } catch (_) {}
  };

  const handleTestVoice = () => {
    const text = 'Hello, this is a voice test from IntentOS.';
    speakTts(text);
    showToast('Testing Voice Speech...');
  };

  const handleStopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setTtsStatus('Idle');
    showToast('Voice Output Stopped');
  };

  const handleToggleMute = () => {
    const next = !ttsMuted;
    setTtsMuted(next);
    showToast(next ? 'Assistant Muted' : 'Assistant Unmuted');
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setBackendUrl(clean);
      localStorage.setItem('intentos_backend_url', clean);
      setShowConfig(false);
      showToast(`Backend set to: ${clean}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-blue-600 border border-blue-400 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 size={18} className="text-blue-200 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 mb-8 flex flex-col md:flex-row justify-between items-center bg-gray-950/90 backdrop-blur p-4 border-b border-gray-800 rounded-xl">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            IntentOS
          </h1>
          <p className="text-gray-400 text-sm">
            AI-Powered Hand Gesture and Voice-Based PC Control
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Backend Connection Status */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm transition-colors cursor-pointer"
            title="Click to configure backend URL"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className="text-gray-300 text-xs md:text-sm">
              {connected ? 'Python Backend Online' : 'Direct Browser Active'}
            </span>
            <Settings size={14} className="text-gray-400 ml-1" />
          </button>

          {/* Emergency Stop Header Button */}
          <button
            onClick={() => handleAction('stop')}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg shadow-red-900/30 text-sm cursor-pointer"
            title="Emergency Stop (Esc)"
          >
            <AlertTriangle size={18} />
            STOP
          </button>
        </div>
      </header>

      {/* Backend URL Configuration Modal */}
      {showConfig && (
        <div className="mb-8 p-5 bg-gray-900 border border-blue-500/50 rounded-xl shadow-xl">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Settings size={16} className="text-blue-400" />
            Backend Connection Settings
          </h3>
          <form onSubmit={handleSaveBackendUrl} className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                placeholder="http://localhost:8000 or https://xyz.loca.lt"
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm transition-colors cursor-pointer"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputUrl(DEFAULT_BACKEND_URL);
                  setBackendUrl(DEFAULT_BACKEND_URL);
                  localStorage.removeItem('intentos_backend_url');
                  setShowConfig(false);
                  showToast('Reset to default: http://localhost:8000');
                }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors cursor-pointer"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </form>
          <div className="mt-3 p-3 bg-gray-950/60 rounded-lg text-xs text-gray-400 space-y-1">
            <p>• <strong>To control across devices:</strong> run <code className="text-blue-400">npx localtunnel --port 8000</code> on your main computer and paste the https URL above.</p>
          </div>
        </div>
      )}

      {/* Live Camera Viewport with Hand Landmark Overlay */}
      {(status === 'running' || status === 'paused') && (
        <div className="mb-8 bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col items-center justify-center relative">
          <div className="flex justify-between items-center w-full mb-3 px-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Camera size={14} className="text-blue-400" />
              Live Camera Stream & Hand Skeleton
            </span>
            <button
              onClick={() => {
                const next = !useBrowserCamera;
                setUseBrowserCamera(next);
                if (next) startBrowserCamera();
                else stopBrowserCamera();
              }}
              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-300 rounded border border-gray-700 cursor-pointer"
            >
              {useBrowserCamera ? 'Switch to Python OpenCV Stream' : 'Switch to Browser Webcam'}
            </button>
          </div>

          {/* Video & Canvas MediaPipe Container */}
          <div className="relative w-full max-w-xl mx-auto overflow-hidden rounded-lg shadow-lg border border-gray-700 bg-black flex justify-center items-center aspect-video">
            {(useBrowserCamera || !connected) ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={480}
                  className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
                />
                <div className="absolute top-3 left-3 bg-blue-600/85 backdrop-blur px-2.5 py-1 rounded text-xs font-semibold text-white flex items-center gap-1.5 shadow-md">
                  <Hand size={13} className="text-green-300" />
                  MediaPipe Hand Tracking: <span className="text-yellow-300 font-bold ml-1">{lastGesture}</span>
                </div>
              </>
            ) : (
              <img
                src={`${backendUrl}/api/video_feed`}
                alt="MediaPipe Webcam Feed"
                className="w-full h-full object-cover"
                onError={() => {
                  setUseBrowserCamera(true);
                  startBrowserCamera();
                }}
              />
            )}
          </div>

          <p className="text-xs text-gray-400 mt-2">
            Show your hand to the camera. Green lines and red points track your hand landmarks in real time.
          </p>
        </div>
      )}

      {/* Grid: Gestures, Zoom, System */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Gestures Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hand size={20} /> Gestures
            </h2>
            <span className={`text-sm ${status === 'running' ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
              {status === 'running' ? 'Active' : 'Standby'}
            </span>
          </div>
          <p className="text-3xl font-mono text-blue-400">{lastGesture}</p>
          <p className="text-xs text-gray-400 mt-1">
            Index Extended: Move cursor | Pinch: Click | Two Fingers: Scroll
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => { setLastGesture('Index Extended'); showToast('Gesture: Index Extended (Cursor)'); }}
              className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300 cursor-pointer"
            >
              Index Extended
            </button>
            <button
              onClick={() => { setLastGesture('Pinch'); showToast('Gesture: Pinch (Click)'); }}
              className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300 cursor-pointer"
            >
              Pinch
            </button>
            <button
              onClick={() => { setLastGesture('Two Fingers'); showToast('Gesture: Two Fingers (Scroll)'); }}
              className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-300 cursor-pointer"
            >
              Two Fingers
            </button>
          </div>
        </div>

        {/* Zoom Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search size={20} /> Zoom Control
            </h2>
            <span className={`text-sm font-semibold ${zoomEnabled ? 'text-green-400' : 'text-gray-500'}`}>
              {zoomEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xl font-mono truncate text-gray-300">{lastZoomAction}</p>
            <button
              onClick={() => handleAction(zoomEnabled ? 'zoom_disable' : 'zoom_enable')}
              className={`py-2 px-3 mt-2 rounded-lg text-sm font-semibold transition-all cursor-pointer active:scale-95 ${
                zoomEnabled ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {zoomEnabled ? 'Disable Zoom' : 'Enable Zoom'}
            </button>
          </div>
        </div>

        {/* System Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor size={20} /> System State
            </h2>
            <span className={`text-sm font-bold ${status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAction(status === 'paused' ? 'resume' : 'start')}
              className="flex-1 py-2.5 px-3 bg-green-600 hover:bg-green-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-green-900/20"
              title={status === 'paused' ? 'Resume' : 'Start'}
            >
              <Play size={18} />
              <span>{status === 'paused' ? 'Resume' : 'Start'}</span>
            </button>
            <button
              onClick={() => handleAction('pause')}
              className="flex-1 py-2.5 px-3 bg-yellow-600 hover:bg-yellow-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-yellow-900/20"
              title="Pause"
            >
              <Pause size={18} />
              <span>Pause</span>
            </button>
            <button
              onClick={() => handleAction('stop')}
              className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-red-900/20"
              title="Stop"
            >
              <Square size={18} />
              <span>Stop</span>
            </button>
          </div>
        </div>
      </div>

      {/* Voice Control Panel */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mic className={voiceListening ? 'text-purple-400 animate-pulse' : 'text-gray-500'} />
            Voice Control
          </h2>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
            voiceState === 'listening' ? 'bg-purple-900/50 text-purple-400 animate-pulse' :
            voiceState === 'processing' ? 'bg-blue-900/50 text-blue-400' :
            voiceState === 'executing' ? 'bg-green-900/50 text-green-400' :
            'bg-gray-800 text-gray-400'
          }`}>
            {voiceListening ? 'Microphone Active (Listening...)' : 'Microphone Off'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* History */}
          <div className="bg-gray-950 rounded-lg p-4 h-64 overflow-y-auto border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Command History
            </h3>
            {voiceHistory.length === 0 ? (
              <p className="text-gray-600 italic">Say a command like "Open Google" or "Scroll down"...</p>
            ) : (
              <div className="flex flex-col gap-3">
                {voiceHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-md border ${
                      item.success ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-gray-200">"{item.text}"</p>
                      <span className="text-xs text-gray-500">{item.time}</span>
                    </div>
                    {item.reply && (
                      <p className="text-xs text-blue-300 italic mb-1">
                        Assistant: "{item.reply}"
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {item.actions && item.actions.map((act: any, i: number) => (
                        <div key={i} className="flex gap-2 items-center bg-gray-900/50 px-2 py-1 rounded border border-gray-800">
                          <span className={`text-xs ${item.success ? 'text-green-300' : 'text-red-300'}`}>
                            {act.intent}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Reference */}
          <div className="flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                Try Saying These Commands Aloud
              </h3>
              <ul className="text-sm text-gray-300 space-y-2 mb-4">
                <li>• <button onClick={() => handleVoiceInput("open google")} className="text-blue-400 underline cursor-pointer hover:text-blue-300">"Open Google"</button> (Opens search)</li>
                <li>• <button onClick={() => handleVoiceInput("scroll down")} className="text-blue-400 underline cursor-pointer hover:text-blue-300">"Scroll down"</button> (Scrolls window)</li>
                <li>• <button onClick={() => handleVoiceInput("zoom in")} className="text-blue-400 underline cursor-pointer hover:text-blue-300">"Zoom in"</button> (Enables zoom)</li>
                <li>• <button onClick={() => handleVoiceInput("stop")} className="text-blue-400 underline cursor-pointer hover:text-blue-300">"Stop"</button> (Emergency Stop)</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-center border border-gray-700/50">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                {voiceListening ? <Mic className="text-green-400 animate-pulse" size={16} /> : <MicOff className="text-gray-500" size={16} />}
                {voiceListening ? 'Microphone is live' : 'Click Start to listen'}
              </span>
              <button
                onClick={() => handleAction('stop')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm cursor-pointer"
              >
                Mute Microphone
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Assistant / TTS Panel */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Volume2 className={ttsStatus === 'speaking' ? 'text-green-400 animate-pulse' : 'text-gray-500'} />
            Assistant Voice Responses
          </h2>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              ttsStatus === 'speaking' ? 'bg-green-900/50 text-green-400' :
              ttsStatus === 'queued' ? 'bg-blue-900/50 text-blue-400' :
              ttsStatus === 'error' ? 'bg-red-900/50 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {ttsStatus}
            </span>
            <button
              onClick={handleToggleMute}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                ttsMuted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {ttsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{ttsMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Voice Selection
              </label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-gray-200"
                value={ttsSelectedVoice}
                onChange={e => {
                  setTtsSelectedVoice(e.target.value);
                  showToast(`Selected voice: ${e.target.value}`);
                }}
              >
                {ttsVoices.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Speed ({ttsRate})
              </label>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={ttsRate}
                onChange={e => setTtsRate(parseInt(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Volume ({Math.round(ttsVolume * 100)}%)
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={ttsVolume}
                onChange={e => setTtsVolume(parseFloat(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleTestVoice}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg transition-all text-sm cursor-pointer shadow-md shadow-blue-900/20"
              >
                Test Voice
              </button>
              <button
                onClick={handleStopSpeaking}
                className="flex-1 py-2 px-4 bg-red-600/20 hover:bg-red-600/40 active:scale-95 text-red-400 font-semibold rounded-lg transition-all text-sm cursor-pointer border border-red-500/20"
              >
                Stop Speaking
              </button>
            </div>
          </div>

          <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Assistant Says:
            </h3>
            <p className="text-xl font-medium text-gray-200 italic flex-1 whitespace-pre-wrap">
              {ttsLastText || 'Waiting for voice interaction...'}
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Stop Bottom Card */}
      <div className="bg-gray-900 p-6 rounded-xl border border-red-900/50">
        <h2 className="text-xl font-bold text-red-500 flex items-center gap-2 mb-4">
          <AlertTriangle /> Emergency Stop
        </h2>
        <button
          onClick={() => handleAction('stop')}
          className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-[0.99] rounded-lg text-xl font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xl shadow-red-900/40"
        >
          STOP ALL CONTROLS
        </button>
      </div>
    </div>
  );
}
