import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Square,
  Pause,
  AlertTriangle,
  Monitor,
  Mic,
  Hand,
  Search,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Camera,
  Globe,
  Radio
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

  // In-browser standalone mode state
  const [browserMode, setBrowserMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Helper to construct WebSocket URL
  const getWsUrl = (httpUrl: string) => {
    const trimmed = httpUrl.replace(/\/+$/, '');
    if (trimmed.startsWith('https://')) {
      return trimmed.replace('https://', 'wss://') + '/ws/events';
    }
    return trimmed.replace('http://', 'ws://') + '/ws/events';
  };

  // Browser speech synthesis fallback
  const speakBrowserTts = (text: string) => {
    if (ttsMuted || !text) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, ttsRate / 175));
      utterance.volume = ttsVolume;
      setTtsStatus('speaking');
      setTtsLastText(text);
      utterance.onend = () => setTtsStatus('Idle');
      utterance.onerror = () => setTtsStatus('Idle');
      window.speechSynthesis.speak(utterance);
    }
  };

  // Start in-browser webcam & speech recognition
  const startBrowserMode = async () => {
    try {
      setBrowserMode(true);
      setStatus('running');
      setVoiceListening(true);
      setVoiceState('listening');

      // Request browser webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Initialize Web Speech API for voice recognition
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript.trim();
          handleBrowserVoiceCommand(transcript);
        };

        recognition.onerror = () => {
          // Restart on error
          try { recognition.start(); } catch (_) {}
        };

        recognition.onend = () => {
          // Restart if still in browser mode
          if (streamRef.current) {
            try { recognition.start(); } catch (_) {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      speakBrowserTts("IntentOS Browser Mode active. Camera and voice are ready.");
    } catch (err) {
      console.error('Browser media error:', err);
      alert('Camera or microphone permission was denied or not supported by this browser.');
    }
  };

  // Stop in-browser standalone mode
  const stopBrowserMode = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setBrowserMode(false);
    setStatus('stopped');
    setVoiceListening(false);
    setVoiceState('Idle');
  };

  // Handle in-browser voice commands
  const handleBrowserVoiceCommand = (text: string) => {
    const lower = text.toLowerCase();
    let reply = "Recognized your command.";
    let intent = "unknown";

    if (lower.includes('scroll down')) {
      intent = "scroll";
      reply = "Scrolling down.";
      window.scrollBy({ top: 300, behavior: 'smooth' });
    } else if (lower.includes('scroll up')) {
      intent = "scroll";
      reply = "Scrolling up.";
      window.scrollBy({ top: -300, behavior: 'smooth' });
    } else if (lower.includes('zoom in')) {
      intent = "zoom_in";
      setZoomEnabled(true);
      setLastZoomAction('Zoom In');
      reply = "Zooming in.";
    } else if (lower.includes('zoom out')) {
      intent = "zoom_out";
      setZoomEnabled(true);
      setLastZoomAction('Zoom Out');
      reply = "Zooming out.";
    } else if (lower.includes('stop')) {
      stopBrowserMode();
      reply = "Stopping all controls.";
    } else if (lower.includes('pause')) {
      setStatus('paused');
      reply = "Pausing control.";
    } else if (lower.includes('resume') || lower.includes('start')) {
      setStatus('running');
      reply = "Resuming control.";
    } else if (lower.includes('open google')) {
      intent = "browser_open";
      reply = "Opening Google in a new tab.";
      window.open('https://www.google.com', '_blank');
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

    speakBrowserTts(reply);
  };

  // Load browser speech synthesis voices
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const sysVoices = window.speechSynthesis.getVoices();
        if (sysVoices.length > 0 && ttsVoices.length === 0) {
          setTtsVoices(sysVoices.map(v => ({ id: v.name, name: v.name })));
          setTtsSelectedVoice(sysVoices[0].name);
        }
      }
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [ttsVoices.length]);

  // Main connection effect for backend
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
          setStatus(
            data.paused ? 'paused' :
            data.running ? 'running' : 'stopped'
          );
          if (data.voice_engine === 'ready') setVoiceListening(true);
          if (data.zoom_enabled !== undefined) {
            setZoomEnabled(data.zoom_enabled);
          }
        })
        .catch(() => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            if (active) setConnected(false);
          }
        });
    };

    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 4000);

    // Fetch TTS voices from backend
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

    // WebSocket connection
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWsUrl(backendUrl));
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
          if (data.type === 'voice_status') {
            if (data.payload.listening !== undefined) setVoiceListening(data.payload.listening);
            if (data.payload.state !== undefined) setVoiceState(data.payload.state);
          }
          if (data.type === 'zoom_status') {
            if (data.payload.enabled !== undefined) setZoomEnabled(data.payload.enabled);
            if (data.payload.action && data.payload.action !== 'None') {
              setLastZoomAction(data.payload.action);
            }
          }
          if (data.type === 'tts_status') {
            if (data.payload.state) setTtsStatus(data.payload.state);
            if (data.payload.text) setTtsLastText(data.payload.text);
          }
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      };
    } catch (_) {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (browserMode) {
          stopBrowserMode();
        } else {
          fetch(`${backendUrl}/api/control/stop`, { method: 'POST' }).catch(() => {});
          setStatus('stopped');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (ws) ws.close();
      wsRef.current = null;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [backendUrl, browserMode]);

  const handleAction = async (action: string) => {
    // If backend is connected, use backend
    if (connected) {
      try {
        await fetch(`${backendUrl}/api/control/${action}`, { method: 'POST' });
        if (action === 'start') setStatus('running');
        if (action === 'pause') setStatus('paused');
        if (action === 'resume') setStatus('running');
        if (action === 'stop') setStatus('stopped');
        if (action === 'zoom_enable') setZoomEnabled(true);
        if (action === 'zoom_disable') setZoomEnabled(false);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // If backend is offline, handle via browser standalone mode!
    if (action === 'start' || action === 'resume') {
      startBrowserMode();
    } else if (action === 'pause') {
      setStatus('paused');
      speakBrowserTts("Pausing control.");
    } else if (action === 'stop') {
      stopBrowserMode();
    } else if (action === 'zoom_enable') {
      setZoomEnabled(true);
      speakBrowserTts("Zoom enabled.");
    } else if (action === 'zoom_disable') {
      setZoomEnabled(false);
      speakBrowserTts("Zoom disabled.");
    }
  };

  const updateTtsSettings = (settings: Record<string, unknown>) => {
    if (connected) {
      fetch(`${backendUrl}/api/tts/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      }).catch(console.error);
    }
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setBackendUrl(clean);
      localStorage.setItem('intentos_backend_url', clean);
      setShowConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      {/* Header */}
      <header className="sticky top-0 z-50 mb-8 flex flex-col md:flex-row justify-between items-center bg-gray-950/90 backdrop-blur p-4 border-b border-gray-800">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            IntentOS
          </h1>
          <p className="text-gray-400 text-sm">
            Interact Naturally. Control Intelligently.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode Indicator */}
          {browserMode && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/80 border border-blue-600/50 rounded-lg text-xs font-semibold text-blue-300">
              <Camera size={14} className="text-blue-400 animate-pulse" />
              <span>Browser Camera & Voice Active</span>
            </div>
          )}

          {/* Backend Connection Status & Switcher */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm transition-colors"
            title="Click to configure backend URL or tunnel"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : (browserMode ? 'bg-blue-400' : 'bg-yellow-500')}`} />
            <span className="text-gray-300 text-xs md:text-sm">
              {connected ? 'Python Backend Online' : (browserMode ? 'Browser Mode' : 'Backend Standby')}
            </span>
            <Settings size={14} className="text-gray-400 ml-1" />
          </button>

          <button
            onClick={() => handleAction('stop')}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg uppercase tracking-wider transition-colors shadow-lg shadow-red-900/20 text-sm"
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
            <Radio size={16} className="text-blue-400" />
            Connect Backend (Local or Remote)
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm transition-colors"
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
                }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
              >
                Close
              </button>
            </div>
          </form>
          <div className="mt-3 p-3 bg-gray-950/60 rounded-lg text-xs text-gray-400 space-y-1">
            <p>• <strong>To connect across computers with zero security blocks:</strong> run <code className="text-blue-400 bg-gray-900 px-1 py-0.5 rounded">npx localtunnel --port 8000</code> in your terminal, then paste the generated HTTPS URL above.</p>
            <p>• <strong>To test without any backend installed:</strong> click the green <strong>Start (▶)</strong> button to run camera & voice directly in your browser.</p>
          </div>
        </div>
      )}

      {/* Webcam Feed Section */}
      {(status === 'running' || status === 'paused' || browserMode) && (
        <div className="mb-8 bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col items-center justify-center relative">
          {browserMode ? (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="rounded-lg shadow-lg max-h-96 object-cover transform -scale-x-100"
              />
              <div className="absolute top-3 left-3 bg-blue-600/80 backdrop-blur px-2.5 py-1 rounded text-xs font-semibold text-white flex items-center gap-1.5">
                <Camera size={13} /> Live Browser Camera
              </div>
            </div>
          ) : (
            <img
              src={`${backendUrl}/api/video_feed`}
              alt="Webcam Feed"
              className="rounded-lg shadow-lg max-h-96 object-cover"
              onError={e => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
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
            <span className="text-blue-400 text-sm">
              {status === 'running' ? 'Active' : 'Standby'}
            </span>
          </div>
          <p className="text-3xl font-mono">{lastGesture}</p>
        </div>

        {/* Zoom Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search size={20} /> Zoom
            </h2>
            <span className={`text-sm ${zoomEnabled ? 'text-green-400' : 'text-gray-500'}`}>
              {zoomEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xl font-mono truncate">{lastZoomAction}</p>
            <button
              onClick={() => handleAction(zoomEnabled ? 'zoom_disable' : 'zoom_enable')}
              className={`py-1 px-3 mt-2 rounded text-sm font-semibold transition-colors ${
                zoomEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'
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
              <Monitor size={20} /> System Control
            </h2>
            <span className={`text-sm ${status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAction(status === 'paused' ? 'resume' : 'start')}
              className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
              title={status === 'paused' ? 'Resume' : 'Start'}
            >
              <Play size={20} />
            </button>
            <button
              onClick={() => handleAction('pause')}
              className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
              title="Pause"
            >
              <Pause size={20} />
            </button>
            <button
              onClick={() => handleAction('stop')}
              className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              title="Stop"
            >
              <Square size={20} />
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
            voiceState === 'listening' ? 'bg-purple-900/50 text-purple-400' :
            voiceState === 'processing' ? 'bg-blue-900/50 text-blue-400' :
            voiceState === 'executing' ? 'bg-green-900/50 text-green-400' :
            voiceState === 'failed' ? 'bg-red-900/50 text-red-400' :
            'bg-gray-800 text-gray-400'
          }`}>
            {voiceState}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* History */}
          <div className="bg-gray-950 rounded-lg p-4 h-64 overflow-y-auto border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Command History
            </h3>
            {voiceHistory.length === 0 ? (
              <p className="text-gray-600 italic">No commands recognized yet.</p>
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
                          {act.params && Object.keys(act.params).length > 0 && (
                            <span className="text-xs text-gray-500 font-mono">
                              {JSON.stringify(act.params)}
                            </span>
                          )}
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
                Supported Voice Commands
              </h3>
              <ul className="text-sm text-gray-300 space-y-2 mb-4">
                <li>• <span className="text-blue-400">Navigation:</span> "Open Google", "Scroll down", "Scroll up"</li>
                <li>• <span className="text-blue-400">Zoom:</span> "Zoom in", "Zoom out"</li>
                <li>• <span className="text-blue-400">Controls:</span> "Pause", "Resume", "Stop"</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-center border border-gray-700/50">
              <span className="text-sm font-medium text-gray-300">
                {voiceListening ? 'Microphone is active' : 'Microphone is off'}
              </span>
              <button
                onClick={() => handleAction('stop')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm"
              >
                Force Stop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Assistant / TTS Panel */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Play className={ttsStatus === 'speaking' ? 'text-green-400 animate-pulse' : 'text-gray-500'} />
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
              onClick={() => {
                const newMuted = !ttsMuted;
                setTtsMuted(newMuted);
                updateTtsSettings({ muted: newMuted });
              }}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                ttsMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {ttsMuted ? 'Unmute' : 'Mute'}
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
                  updateTtsSettings({ voice_id: e.target.value });
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
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setTtsRate(val);
                  updateTtsSettings({ rate: val });
                }}
                className="w-full"
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
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setTtsVolume(val);
                  updateTtsSettings({ volume: val });
                }}
                className="w-full"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  const testPhrase = 'Hello, this is a voice test from IntentOS.';
                  if (connected) {
                    fetch(`${backendUrl}/api/tts/speak`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: testPhrase })
                    }).catch(console.error);
                  } else {
                    speakBrowserTts(testPhrase);
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-semibold rounded transition-colors text-sm"
              >
                Test Voice
              </button>
              <button
                onClick={() => {
                  if (connected) {
                    fetch(`${backendUrl}/api/tts/stop`, { method: 'POST' }).catch(console.error);
                  } else {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    setTtsStatus('Idle');
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm"
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
              {ttsLastText || 'Waiting for interaction...'}
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
          className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-colors"
        >
          STOP ALL CONTROLS
        </button>
      </div>
    </div>
  );
}
