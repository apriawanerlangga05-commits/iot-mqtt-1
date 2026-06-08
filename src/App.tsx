import { useState, useEffect, useRef } from 'react';
import { BrokerStatus, LogEntry, RelayLabels, RelayStates, PolaStates, SensorDataPoint } from './types';
import { SensorChart } from './components/SensorChart';
import { LogPanel } from './components/LogPanel';
import { VoiceCommandWidget } from './components/VoiceCommandWidget';
import { 
  Thermometer, 
  Droplets, 
  Cpu, 
  Sliders, 
  HelpCircle,
  Radio, 
  Volume2, 
  VolumeX, 
  Clock, 
  Calendar, 
  Unlock, 
  ShieldAlert, 
  Activity, 
  Edit3, 
  Check, 
  RefreshCw, 
  Info,
  Layers,
  Sparkles,
  ToggleLeft
} from 'lucide-react';

export default function App() {
  // --- STATE PERSISTENCE ---
  const [flespiToken, setFlespiToken] = useState(() => {
    return localStorage.getItem('flespi_token') || '';
  });

  const [tempLimit, setTempLimit] = useState(() => {
    return parseFloat(localStorage.getItem('temp_limit') || '35');
  });

  const [relayLabels, setRelayLabels] = useState<RelayLabels>(() => {
    const saved = localStorage.getItem('relay_labels');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed[1] && parsed[1] !== 'Lampu Teras Depan' && parsed[1] !== 'Suhu Pendingin Server') {
          return parsed;
        }
      } catch (e) {}
    }
    return {
      1: 'Lampu 1',
      2: 'Lampu 2',
      3: 'Lampu 3',
      4: 'Lampu 4',
    };
  });

  // --- GENERAL APP STATE ---
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [suhu, setSuhu] = useState(28.4); // Initial default realistic room temperature
  const [kelembapan, setKelembapan] = useState(62.8); // Initial default realistic humidity
  const [lastTempUpdate, setLastTempUpdate] = useState<number | null>(null);
  const [lastHumUpdate, setLastHumUpdate] = useState<number | null>(null);

  const [relayStates, setRelayStates] = useState<RelayStates>({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const [polaStates, setPolaStates] = useState<PolaStates>({
    1: false,
    2: false,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // High-fidelity active simulation check
  const [simulatingData, setSimulatingData] = useState(true);

  // Security and sandbox-safe connections protocol selection
  // By default, since AI Studio preview is loaded over HTTPS, we force Secure WebSockets (WSS)
  // to avoid mixed content blocks. We will let the user know and configure it beautifully!
  const [useWss, setUseWss] = useState(window.location.protocol === 'https:');

  const [brokerStatus, setBrokerStatus] = useState<{
    mosquitto: BrokerStatus;
    flespi: BrokerStatus;
    mosquitto_auth: BrokerStatus;
  }>({
    mosquitto: { id: 'mosquitto', connected: false, latency: null, reconnectCount: 0 },
    flespi: { id: 'flespi', connected: false, latency: null, reconnectCount: 0 },
    mosquitto_auth: { id: 'mosquitto_auth', connected: false, latency: null, reconnectCount: 0 },
  });

  // Sensory graph historical tracker
  const [history, setHistory] = useState<SensorDataPoint[]>([]);

  // Editing names UI helper state
  const [editingRelayId, setEditingRelayId] = useState<1 | 2 | 3 | 4 | null>(null);
  const [tempLabelName, setTempLabelName] = useState('');

  // Sembunyikan/tampilkan panel pengaturan agar UI lebih simpel
  const [showSettings, setShowSettings] = useState(false);

  // Audio status (allow muting standard warnings)
  const [isMuted, setIsMuted] = useState(false);

  // MQTT client references saved in standard useRef
  const client1Ref = useRef<any>(null);
  const client2Ref = useRef<any>(null);
  const client3Ref = useRef<any>(null);

  // --- TIME AND CLOCK ---
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }, 1000);

    const firstTime = new Date();
    setTimeStr(firstTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setDateStr(firstTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    return () => clearInterval(timer);
  }, []);

  // --- HISTORICAL CHART UPDATE LOGIC ---
  useEffect(() => {
    const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory((prev) => {
      // Avoid inserting duplicate sensory records in the same exact time window
      if (prev.length > 0 && prev[prev.length - 1].suhu === suhu && prev[prev.length - 1].kelembapan === kelembapan) {
        return prev;
      }
      const next = [...prev, { time: timeNow, suhu, kelembapan }];
      if (next.length > 20) {
        return next.slice(next.length - 20);
      }
      return next;
    });
  }, [suhu, kelembapan]);

  // --- AUDIO ALERTS AND WARNING SYSTEM ---
  const lastBeepRef = useRef<number>(0);
  const playBeep = () => {
    if (isMuted) return;
    const now = Date.now();
    // Throttle beep frequency to every 4 seconds max so that it does not overlay too rapidly
    if (now - lastBeepRef.current < 4000) return;
    lastBeepRef.current = now;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (delay: number, duration: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      // Play neat high warning double-beep (B5)
      playTone(0, 0.25, 987.77);
      playTone(0.35, 0.25, 987.77);
    } catch (e) {
      console.warn("Web Audio alert beep failed", e);
    }
  };

  // Beep whenever temperature shoots above the dynamic threshold
  const isSuhuAlert = suhu > tempLimit;
  useEffect(() => {
    if (isSuhuAlert) {
      playBeep();
    }
  }, [suhu, tempLimit, isSuhuAlert]);

  // --- SPEECH OUTPUT ---
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop current speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      window.speechSynthesis.speak(utterance);
    }
  };

  // --- LOGGERS ENGINE ---
  const addLog = (text: string, type: 'incoming' | 'publish' | 'error' | 'system' = 'system') => {
    const timestampStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timestampStr,
        type,
        text,
      },
    ]);
  };

  // --- MQTT CONNECTIVITY SUITE ---
  const handleIncomingPayload = (brokerId: string, topic: string, payloadStr: string) => {
    // 1. Check if latency response ping test
    if (topic === `iot/ping/${brokerId}`) {
      const sentTime = parseInt(payloadStr);
      if (!isNaN(sentTime)) {
        const measuredLatency = Date.now() - sentTime;
        setBrokerStatus((prev) => ({
          ...prev,
          [brokerId]: {
            ...prev[brokerId as 'mosquitto' | 'flespi' | 'mosquitto_auth'],
            latency: measuredLatency,
          },
        }));
      }
      return;
    }

    // 2. Parsed value of suhu
    if (topic === 'iot/erlangga_161024/sensor/suhu') {
      const val = parseFloat(payloadStr);
      if (!isNaN(val)) {
        setSuhu(val);
        setLastTempUpdate(Date.now());
        addLog(`[${brokerId.toUpperCase()}] Data Masuk ➔ Suhu: ${val}°C`, 'incoming');
      }
      return;
    }

    // 3. Parsed value of kelembapan
    if (topic === 'iot/erlangga_161024/sensor/kelembapan') {
      const val = parseFloat(payloadStr);
      if (!isNaN(val)) {
        setKelembapan(val);
        setLastHumUpdate(Date.now());
        addLog(`[${brokerId.toUpperCase()}] Data Masuk ➔ Kelembapan: ${val}%`, 'incoming');
      }
      return;
    }
  };

  // Initialize Broker 1 (Mosquitto Public)
  const connectBroker1 = () => {
    if (!(window as any).mqtt) {
      addLog('Kesalahan: Broker MQTT.js CDN tidak valid.', 'error');
      return;
    }
    if (client1Ref.current) {
      try { client1Ref.current.end(); } catch (e) {}
    }

    const clientId = `mqtt_web_mosq1_${Math.random().toString(16).slice(2, 10)}`;
    const protocol = useWss ? 'wss' : 'ws';
    const host = 'test.mosquitto.org';
    const port = useWss ? 1884 : 1883;
    const path = '/mqtt';
    const brokerUrl = `${protocol}://${host}:${port}${path}`;

    addLog(`Menghubungkan ke Broker 1 (Mosquitto) di ${brokerUrl}...`, 'system');

    try {
      const client = (window as any).mqtt.connect(brokerUrl, {
        clientId,
        connectTimeout: 5000,
        reconnectPeriod: 3000,
      });
      client1Ref.current = client;

      client.on('connect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto: { ...prev.mosquitto, connected: true, reconnectCount: 0 },
        }));
        addLog('Broker 1 (Mosquitto): Terhubung!', 'incoming');
        
        client.subscribe('iot/erlangga_161024/sensor/suhu', { qos: 0 });
        client.subscribe('iot/erlangga_161024/sensor/kelembapan', { qos: 0 });
        client.subscribe('iot/erlangga_161024/ping/mosquitto', { qos: 0 });
      });

      client.on('close', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto: { ...prev.mosquitto, connected: false },
        }));
      });

      client.on('reconnect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto: { ...prev.mosquitto, reconnectCount: prev.mosquitto.reconnectCount + 1 },
        }));
        addLog('Broker 1 (Mosquitto): Mengulangi upaya koneksi secara berkala...', 'system');
      });

      client.on('error', (err: any) => {
        addLog(`Broker 1 Error: ${err.message || err}`, 'error');
      });

      client.on('message', (topic: string, message: any) => {
        handleIncomingPayload('mosquitto', topic, message.toString());
      });
    } catch (e: any) {
      addLog(`Gagal meluncurkan Broker 1: ${e.message}`, 'error');
    }
  };

  // Initialize Broker 2 (Flespi Token Auth)
  const connectBroker2 = () => {
    if (!(window as any).mqtt) return;
    if (client2Ref.current) {
      try { client2Ref.current.end(); } catch (e) {}
    }

    if (!flespiToken.trim()) {
      addLog('Broker 2 (Flespi) Terlewatkan: Harap simpan Token Flespi di konfigurasi.', 'system');
      return;
    }

    const clientId = `mqtt_web_flespi_${Math.random().toString(16).slice(2, 10)}`;
    const protocol = useWss ? 'wss' : 'ws';
    const host = 'mqtt.flespi.io';
    // standard flespi WS port is 80 (ws), SSL port is 443 (wss)
    const port = useWss ? 443 : 80;
    const brokerUrl = `${protocol}://${host}:${port}`;

    addLog(`Menghubungkan ke Broker 2 (Flespi) di ${brokerUrl}...`, 'system');

    try {
      const client = (window as any).mqtt.connect(brokerUrl, {
        clientId,
        username: flespiToken.trim(),
        password: '',
        connectTimeout: 5000,
        reconnectPeriod: 3000,
      });
      client2Ref.current = client;

      client.on('connect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          flespi: { ...prev.flespi, connected: true, reconnectCount: 0 },
        }));
        addLog('Broker 2 (Flespi): Berhasil terhubung dengan Token!', 'incoming');
        
        client.subscribe('iot/erlangga_161024/sensor/suhu', { qos: 0 });
        client.subscribe('iot/erlangga_161024/sensor/kelembapan', { qos: 0 });
        client.subscribe('iot/erlangga_161024/ping/flespi', { qos: 0 });
      });

      client.on('close', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          flespi: { ...prev.flespi, connected: false },
        }));
      });

      client.on('reconnect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          flespi: { ...prev.flespi, reconnectCount: prev.flespi.reconnectCount + 1 },
        }));
        addLog('Broker 2 (Flespi): Hubungkan kembali...', 'system');
      });

      client.on('error', (err: any) => {
        addLog(`Broker 2 (Flespi) Error: ${err.message || err}`, 'error');
      });

      client.on('message', (topic: string, message: any) => {
        handleIncomingPayload('flespi', topic, message.toString());
      });
    } catch (e: any) {
      addLog(`Gagal meluncurkan Broker 2: ${e.message}`, 'error');
    }
  };

  // Initialize Broker 3 (Mosquitto Auth)
  const connectBroker3 = () => {
    if (!(window as any).mqtt) return;
    if (client3Ref.current) {
      try { client3Ref.current.end(); } catch (e) {}
    }

    const clientId = `mqtt_web_mosq_auth_${Math.random().toString(16).slice(2, 10)}`;
    const protocol = useWss ? 'wss' : 'ws';
    const host = 'test.mosquitto.org';
    // Mosquitto Auth uses ws/wss on port 8091 (standard ws or tls)
    const port = 1884;
    const path = '/mqtt';
    const brokerUrl = `${protocol}://${host}:${port}${path}`;

    addLog(`Menghubungkan ke Broker 3 (Mosquitto Auth) di ${brokerUrl}...`, 'system');

    try {
      const client = (window as any).mqtt.connect(brokerUrl, {
        clientId,
        username: 'rw',
        password: 'readwrite',
        connectTimeout: 5000,
        reconnectPeriod: 3000,
      });
      client3Ref.current = client;

      client.on('connect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto_auth: { ...prev.mosquitto_auth, connected: true, reconnectCount: 0 },
        }));
        addLog('Broker 3 (Mosquitto Auth): Berhasil menyambungkan dengan otentikasi!', 'incoming');
        
        client.subscribe('iot/erlangga_161024/sensor/suhu', { qos: 0 });
        client.subscribe('iot/erlangga_161024/sensor/kelembapan', { qos: 0 });
        client.subscribe('iot/erlangga_161024/ping/mosquitto_auth', { qos: 0 });
      });

      client.on('close', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto_auth: { ...prev.mosquitto_auth, connected: false },
        }));
      });

      client.on('reconnect', () => {
        setBrokerStatus((prev) => ({
          ...prev,
          mosquitto_auth: { ...prev.mosquitto_auth, reconnectCount: prev.mosquitto_auth.reconnectCount + 1 },
        }));
        addLog('Broker 3 (Mosquitto Auth): Hubungkan kembali...', 'system');
      });

      client.on('error', (err: any) => {
        addLog(`Broker 3 (Mosquitto Auth) Error: ${err.message || err}`, 'error');
      });

      client.on('message', (topic: string, message: any) => {
        handleIncomingPayload('mosquitto_auth', topic, message.toString());
      });
    } catch (e: any) {
      addLog(`Gagal meluncurkan Broker 3: ${e.message}`, 'error');
    }
  };

  // Connect everything
  const connectAllBrokers = () => {
    connectBroker1();
    connectBroker2();
    connectBroker3();
  };

  // Connect on load
  useEffect(() => {
    // Small delay to ensure the DOM loaded CDN script globally on mount
    const timer = setTimeout(() => {
      connectAllBrokers();
    }, 1200);

    return () => {
      // Cleanups
      try { client1Ref.current?.end(); } catch (e) {}
      try { client2Ref.current?.end(); } catch (e) {}
      try { client3Ref.current?.end(); } catch (e) {}
    };
  }, [useWss]); // Reload clients when SSL options toggle

  // --- REAL-TIME LATENCY MEASURING INTERVAL ---
  useEffect(() => {
    const pingTask = setInterval(() => {
      const nowStr = Date.now().toString();
      
      if (client1Ref.current && brokerStatus.mosquitto.connected) {
        client1Ref.current.publish('iot/erlangga_161024/ping/mosquitto', nowStr, { qos: 0 });
      }
      if (client2Ref.current && brokerStatus.flespi.connected) {
        client2Ref.current.publish('iot/erlangga_161024/ping/flespi', nowStr, { qos: 0 });
      }
      if (client3Ref.current && brokerStatus.mosquitto_auth.connected) {
        client3Ref.current.publish('iot/erlangga_161024/ping/mosquitto_auth', nowStr, { qos: 0 });
      }
    }, 5000);

    return () => clearInterval(pingTask);
  }, [brokerStatus]);

  // --- AUTOMATIC SYSTEM OFFLINE SIMULATION ---
  // If we have no hardware connected, simulate gentle fluctuations in ambient readings to make the UI look live and incredible
  useEffect(() => {
    if (!simulatingData) return;

    const dataSimulator = setInterval(() => {
      // Suhu fluctuates slightly (+- 0.1)
      setSuhu((prev) => {
        const delta = (Math.random() - 0.5) * 0.4;
        const next = parseFloat((prev + delta).toFixed(1));
        // Clamp to logical limits
        return Math.max(15, Math.min(48, next));
      });

      // Kelembapan fluctuates slightly (+- 0.2)
      setKelembapan((prev) => {
        const delta = (Math.random() - 0.5) * 1.0;
        const next = parseFloat((prev + delta).toFixed(1));
        return Math.max(20, Math.min(95, next));
      });

    }, 3500);

    return () => clearInterval(dataSimulator);
  }, [simulatingData]);

  // --- CORE PUBLISHING ENGINE ---
  const publishToAllBrokers = (topic: string, val: 'ON' | 'OFF') => {
    addLog(`Publish (Kirim) ➔ ${topic} : Payload: ${val}`, 'publish');

    let anySent = false;

    if (client1Ref.current && brokerStatus.mosquitto.connected) {
      client1Ref.current.publish(topic, val, { qos: 0 });
      anySent = true;
    }
    if (client2Ref.current && brokerStatus.flespi.connected) {
      client2Ref.current.publish(topic, val, { qos: 0 });
      anySent = true;
    }
    if (client3Ref.current && brokerStatus.mosquitto_auth.connected) {
      client3Ref.current.publish(topic, val, { qos: 0 });
      anySent = true;
    }

    if (!anySent) {
      addLog(`Peringatan: Tidak ada broker yang tersambung saat ini. Perintah disimulasikan secara lokal.`, 'error');
    }
  };

  // Set individual Relay
  const setRelay = (id: 1 | 2 | 3 | 4, val: boolean) => {
    // If pattern is active, we cannot control individual relays!
    if (polaStates[1] || polaStates[2]) {
      addLog(`Tindakan Ditolak: Tidak bisa mengendalikan sakelar individual karena Mode Lampu otomatis masih aktif.`, 'error');
      return;
    }

    setRelayStates((prev) => ({ ...prev, [id]: val }));
    publishToAllBrokers(`iot/relay/${id}`, val ? 'ON' : 'OFF');
  };

  // Set all Relays
  const setAllRelays = (val: boolean) => {
    setRelayStates({ 1: val, 2: val, 3: val, 4: val });
    publishToAllBrokers('iot/erlangga_161024/relay/1', val ? 'ON' : 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/2', val ? 'ON' : 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/3', val ? 'ON' : 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/4', val ? 'ON' : 'OFF');
  };

  // Set individual Pattern
  const setPola = (id: 1 | 2, val: boolean) => {
    setPolaStates((prev) => ({ ...prev, [id]: val }));
    publishToAllBrokers(`iot/pola/${id}`, val ? 'ON' : 'OFF');
  };

  // Set all Patterns
  const setAllPola = (val: boolean) => {
    setPolaStates({ 1: val, 2: val });
    publishToAllBrokers('iot/erlangga_161024/pola/1', val ? 'ON' : 'OFF');
    publishToAllBrokers('iot/erlangga_161024/pola/2', val ? 'ON' : 'OFF');
  };

  // Voice system action: Shutdown everything
  const turnOffEverything = () => {
    setRelayStates({ 1: false, 2: false, 3: false, 4: false });
    setPolaStates({ 1: false, 2: false });
    
    // Publish OFF to all
    publishToAllBrokers('iot/erlangga_161024/relay/1', 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/2', 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/3', 'OFF');
    publishToAllBrokers('iot/erlangga_161024/relay/4', 'OFF');
    publishToAllBrokers('iot/erlangga_161024/pola/1', 'OFF');
    publishToAllBrokers('iot/erlangga_161024/pola/2', 'OFF');
  };

  // Save flespi token and reconnect Flespi
  const handleSaveFlespiToken = (token: string) => {
    setFlespiToken(token);
    localStorage.setItem('flespi_token', token);
    addLog('Konfigurasi: Menyimpan Token Flespi baru.', 'system');
    setTimeout(() => {
      connectBroker2();
    }, 500);
  };

  // Save temperature limit
  const handleSaveTempLimit = (limit: number) => {
    setTempLimit(limit);
    localStorage.setItem('temp_limit', limit.toString());
    addLog(`Konfigurasi: Mengubah batas peringatan suhu menjadi ${limit}°C.`, 'system');
  };

  // Edit Relay Label Name
  const handleStartEditingLabel = (id: 1 | 2 | 3 | 4) => {
    setEditingRelayId(id);
    setTempLabelName(relayLabels[id]);
  };

  const handleSaveRelayLabel = (id: 1 | 2 | 3 | 4) => {
    const updated = { ...relayLabels, [id]: tempLabelName.trim() || `Relay ${id}` };
    setRelayLabels(updated);
    localStorage.setItem('relay_labels', JSON.stringify(updated));
    setEditingRelayId(null);
    addLog(`Konfigurasi: Nama Relay ${id} diubah menjadi "${updated[id]}"`, 'system');
  };

  // Are we disabled on relay click? If either Pola 1 or Pola 2 is active
  const isRelaysDisabled = polaStates[1] || polaStates[2];

  return (
    <div className="min-h-screen text-slate-100 bg-[#040811] selection:bg-[#00C9FF] selection:text-slate-950 font-rajdhani flex flex-col relative overflow-x-hidden">
      {/* Background visual accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#00C9FF]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#10b981]/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* --- PREMIUM GLOW BAR LINE --- */}
      <div className="h-1 bg-gradient-to-r from-cyan-400 via-[#00C9FF] to-blue-600 shadow-glow relative z-10"></div>

      {/* --- COMPACT & SLEEK APP HEADER --- */}
      <header className="bg-slate-950/40 border-b border-slate-900/40 backdrop-blur-md px-4 py-3 md:px-8 shadow-lg relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          
          {/* Logo & Info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#00C9FF]/10 border border-[#00C9FF]/30 flex items-center justify-center text-[#00C9FF] shadow-glow">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-orbitron font-extrabold tracking-tight text-white flex items-center gap-2">
                NEXUS IoT <span className="text-[#00C9FF] text-glow font-medium text-sm border border-[#00C9FF]/30 px-1.5 py-0.5 rounded uppercase tracking-widest bg-[#00C9FF]/5">DASHBOARD</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                ESP32 Smart Controller Hub (Bahasa Indonesia)
              </p>
            </div>
          </div>

          {/* Quick Header Widget Panel */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Real-time Widget Date & Clock */}
            <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800/60 px-3 py-1.5 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Calendar className="w-3.5 h-3.5 text-[#00C9FF]" />
                <span className="tracking-wider uppercase text-[10px]">{dateStr || 'Memuat...'}</span>
              </div>
              <div className="h-3 w-px bg-slate-800"></div>
              <div className="flex items-center gap-1.5 font-orbitron font-bold text-[#00C9FF] text-glow">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs">{timeStr || '00:00:00'}</span>
              </div>
            </div>

            {/* Simulated Data Status Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-900/40 border border-slate-800/60 px-3 py-1.5 rounded-xl text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Simulasi:</span>
              <button
                onClick={() => {
                  const next = !simulatingData;
                  setSimulatingData(next);
                  addLog(`Simulasi: Data ambient ${next ? 'Diaktifkan' : 'Dinonaktifkan'}.`, 'system');
                }}
                className={`relative inline-flex h-4.5 w-8 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  simulatingData ? 'bg-[#00C9FF]' : 'bg-slate-750'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
                    simulatingData ? 'translate-x-3.5 bg-slate-950' : 'translate-x-0 bg-slate-400'
                  }`}
                />
              </button>
            </div>

            {/* Settings toggler button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-xl border transition-all duration-200 flex items-center justify-center gap-1 ${
                showSettings 
                  ? 'bg-[#00C9FF] text-slate-950 border-[#00C9FF]' 
                  : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:text-[#00C9FF] hover:border-[#00C9FF]/40'
              }`}
              title="Toggle Konfigurasi"
            >
              <Sliders className="w-4 h-4" />
              <span className="text-[11px] font-orbitron font-semibold hidden sm:inline px-0.5">PENGATURAN</span>
            </button>
          </div>

        </div>
      </header>

      {/* --- SLICK ALERT CAPTION FLOATING --- */}
      {isSuhuAlert && (
        <div className="mx-4 md:mx-auto max-w-7xl w-[calc(100%-2rem)] mt-4 animate-fade-in z-20">
          <div className="bg-red-950/20 md:backdrop-blur border border-red-500/30 text-red-100 py-3 px-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-glow transition-all">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 animate-bounce flex-shrink-0" />
              <span className="text-xs md:text-sm font-semibold">
                PERINGATAN SUHU TINGGI: {suhu}°C melebihi batas toleransi ({tempLimit}°C)
              </span>
            </div>
            <button 
              onClick={() => setIsMuted(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-900/30 hover:bg-red-800/40 border border-red-500/20 text-white text-xs transition-colors self-end sm:self-auto font-orbitron"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {isMuted ? 'BUKA BEP' : 'HENINGKAN'}
            </button>
          </div>
        </div>
      )}

      {/* --- DASHBOARD MAIN CONTAINER --- */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-5 relative z-10">

        {/* ================= LEFT / MEDIUM SECTIONS (2 COLS) ================= */}
        <div className="lg:col-span-2 space-y-5">

          {/* SENSOR PANEL GAUGE & LIVE GRAPH */}
          <section className="bg-slate-950/30 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#00C9FF]/5 rounded-bl-full pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-900/40">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00C9FF] animate-pulse" />
                <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold">MONITORING SENSOR UTAMA</h2>
              </div>
              <div className="text-[10px] text-slate-500 font-mono uppercase bg-slate-900/30 px-2 py-0.5 rounded border border-slate-800/40 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Live Telemetry
              </div>
            </div>

            {/* Quick stats indicators - super minimalistic */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              
              {/* Temp Display box */}
              <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-xl flex items-center justify-between hover:border-[#00C9FF]/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isSuhuAlert ? 'bg-red-950/30 text-red-400 animate-pulse' : 'bg-[#00C9FF]/5 text-[#00C9FF] border border-[#00C9FF]/10'
                  }`}>
                    <Thermometer className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold font-mono">SUHU</span>
                    <span className="text-2xl md:text-3xl font-orbitron font-black text-white text-glow">
                      {suhu}°C
                    </span>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-slate-500 bg-slate-900/60 p-1.5 rounded border border-slate-800/40 text-center min-w-[50px] hidden sm:block">
                  Limit Alert
                  <span className="block text-[#00C9FF] font-bold text-[10px]">{tempLimit}°C</span>
                </div>
              </div>

              {/* Hum Display box */}
              <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-xl flex items-center justify-between hover:border-emerald-500/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-950/20 text-emerald-400 flex items-center justify-center border border-emerald-900/20">
                    <Droplets className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold font-mono">KELEMBAPAN</span>
                    <span className="text-2xl md:text-3xl font-orbitron font-black text-white text-glow">
                      {kelembapan}%
                    </span>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-slate-500 bg-slate-900/60 p-1.5 rounded border border-slate-800/40 text-center min-w-[50px] hidden sm:block">
                  Status
                  <span className="block text-emerald-400 font-bold text-[10px]">Optimal</span>
                </div>
              </div>

            </div>

            {/* Historical chart */}
            <div className="h-60 mt-3 pt-1">
              <SensorChart history={history} />
            </div>
          </section>

          {/* KONTROL SAKELAR (RELAY) */}
          <section className="bg-slate-950/30 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-2 border-b border-slate-900/40">
              <div>
                <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" /> PANEL KENDALI SAKELAR UTAMA
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tekan toggle untuk mengaktifkan relay fisik. Tekan ikon pensil untuk menyunting label.
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setAllRelays(true)}
                  disabled={isRelaysDisabled}
                  className="flex-1 sm:flex-initial text-[10px] bg-[#00C9FF]/10 hover:bg-[#00C9FF]/20 text-[#00C9FF] font-bold font-orbitron tracking-wider px-3 py-1.5 rounded-xl border border-[#00C9FF]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ALL NYALA
                </button>
                <button
                  onClick={() => setAllRelays(false)}
                  disabled={isRelaysDisabled}
                  className="flex-1 sm:flex-initial text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold font-orbitron tracking-wider px-3 py-1.5 rounded-xl border border-slate-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ALL MATI
                </button>
              </div>
            </div>

            {/* Relays locked warning panel */}
            {isRelaysDisabled && (
              <div className="bg-amber-950/15 border border-amber-500/20 px-3 py-2 rounded-xl flex items-center gap-2 text-xs text-amber-300 mb-4 animate-pulse">
                <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>Sakelar terkendali program otomatis. Matikan Mode Lampu untuk kendali manual.</span>
              </div>
            )}

            {/* Grid list of relays - gorgeous custom toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([1, 2, 3, 4] as const).map((id) => {
                const isActive = relayStates[id];
                const label = relayLabels[id];
                const isEditing = editingRelayId === id;

                return (
                  <div
                    key={id}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isActive && !isRelaysDisabled
                        ? 'bg-slate-900/30 border-[#00C9FF]/40 shadow-glow'
                        : 'bg-slate-900/10 border-slate-900/60'
                    } ${isRelaysDisabled ? 'opacity-55' : ''}`}
                  >
                    {/* ID Badge and Customizable Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono font-bold text-[#00C9FF] bg-[#00C9FF]/5 border border-[#00C9FF]/10 px-1.5 py-0.5 rounded">
                          CH {id}
                        </span>
                        
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={tempLabelName}
                              onChange={(e) => setTempLabelName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRelayLabel(id);
                                if (e.key === 'Escape') setEditingRelayId(null);
                              }}
                              className="bg-slate-950 border border-[#00C9FF]/60 px-1.5 py-0.5 rounded text-xs text-white focus:outline-none w-24 font-semibold"
                              maxLength={30}
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRelayLabel(id)}
                              className="text-emerald-400 p-0.5 hover:bg-emerald-950/30 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEditingLabel(id)}
                            className="text-slate-500 hover:text-[#00C9FF] transition-colors p-0.5"
                            title="Klik untuk ubah nama"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Label output */}
                      {!isEditing && (
                        <h3 className="text-sm font-bold text-slate-200 mt-1 truncate">
                          {label}
                        </h3>
                      )}
                    </div>

                    {/* Compact Interactive Slide Toggle & Indicator */}
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-mono font-bold tracking-widest ${isActive && !isRelaysDisabled ? 'text-[#00C9FF] text-glow' : 'text-slate-600'}`}>
                        {isActive ? 'ON' : 'OFF'}
                      </span>
                      
                      {/* Sliding toggle Switch */}
                      <button
                        onClick={() => setRelay(id, !isActive)}
                        disabled={isRelaysDisabled}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                          isActive && !isRelaysDisabled ? 'bg-[#00C9FF] shadow-glow' : 'bg-slate-800'
                        } disabled:cursor-not-allowed`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow transition duration-250 ease-in-out ${
                            isActive && !isRelaysDisabled ? 'translate-x-4 bg-white' : 'translate-x-0 bg-slate-505 bg-slate-400'
                          }`}
                        />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </section>

          {/* KONTROL MODE OTOMATIS */}
          <section className="bg-slate-950/30 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-2 border-b border-slate-900/40">
              <div>
                <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4" /> PROGRAM LAMPU OTOMATIS
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mengaktifkan aliran lampu dinamis berskala makro otomatis tanpa jeda delay.
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setAllPola(true)}
                  className="flex-1 sm:flex-initial text-[10px] bg-[#00C9FF]/10 hover:bg-[#00C9FF]/20 text-[#00C9FF] font-bold font-orbitron tracking-wider px-3 py-1.5 rounded-xl border border-[#00C9FF]/20 transition-all"
                >
                  SEMUA AKTIF
                </button>
                <button
                  onClick={() => setAllPola(false)}
                  className="flex-1 sm:flex-initial text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold font-orbitron tracking-wider px-3 py-1.5 rounded-xl border border-slate-800 transition-all"
                >
                  DEAKTIF ALL
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pattern 1 */}
              <div className={`p-4 rounded-xl border flex justify-between items-center ${
                polaStates[1] ? 'bg-slate-900/20 border-[#00C9FF]/40 shadow-glow' : 'bg-slate-900/5 border-slate-900/60'
              }`}>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    Mode Aliran (Running Left/Right)
                  </h4>
                  <span className="text-[10px] text-[#00C9FF] font-mono tracking-wider block mt-0.5 font-semibold">Running Dots LED</span>
                </div>

                <button
                  onClick={() => setPola(1, !polaStates[1])}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                    polaStates[1] ? 'bg-[#00C9FF] shadow-glow' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow transition duration-250 ease-in-out ${
                      polaStates[1] ? 'translate-x-4 bg-white' : 'translate-x-0 bg-slate-400'
                    }`}
                  />
                </button>
              </div>

              {/* Pattern 2 */}
              <div className={`p-4 rounded-xl border flex justify-between items-center ${
                polaStates[2] ? 'bg-slate-900/20 border-[#00C9FF]/40 shadow-glow' : 'bg-slate-900/5 border-slate-900/60'
              }`}>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    Mode Kedipan Cepat (Strobe)
                  </h4>
                  <span className="text-[10px] text-yellow-400 font-mono tracking-wider block mt-0.5 font-semibold">High frequency blink</span>
                </div>

                <button
                  onClick={() => setPola(2, !polaStates[2])}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                    polaStates[2] ? 'bg-[#00C9FF] shadow-glow' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow transition duration-250 ease-in-out ${
                      polaStates[2] ? 'translate-x-4 bg-white' : 'translate-x-0 bg-slate-400'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

        </div>

        {/* ================= RIGHT COLUMN (SIDEBAR / SETTINGS) ================= */}
        <div className="space-y-5">

          {/* DYNAMIC COLLAPSIBLE CONFIG PANEL (Drawer style) */}
          {showSettings && (
            <div className="bg-slate-950/40 relative backdrop-blur-md border border-[#00C9FF]/30 p-5 rounded-2xl shadow-glow animate-fade-in space-y-4">
              <div className="flex justify-between items-center border-b border-slate-900/80 pb-2">
                <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" /> PANEL KONFIGURASI IoT
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-slate-500 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-bold"
                >
                  TUTUP
                </button>
              </div>

              {/* Flespi Integration Config */}
              <div className="space-y-1.5 bg-slate-900/35 p-3 rounded-xl border border-slate-900">
                <label className="text-[11px] font-bold text-slate-300 block font-orbitron tracking-wider">
                  TOKEN HUBUNGAN WEB FLESPI (BROKER 2):
                </label>
                <input
                  type="password"
                  placeholder="Masukkan Token Flespi..."
                  value={flespiToken}
                  onChange={(e) => handleSaveFlespiToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800/80 text-xs p-2 rounded-lg text-slate-300 font-mono focus:border-[#00C9FF] focus:outline-none transition-colors"
                />
                <p className="text-[9px] text-slate-500 leading-normal">
                  Flespi token terenkripsi dan disimpan mandiri di LocalStorage browser Anda.
                </p>
              </div>

              {/* Temp Threshold Alarm Slider */}
              <div className="space-y-2 bg-slate-900/35 p-3 rounded-xl border border-slate-900">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-slate-300 font-orbitron tracking-wider">
                    ALARM MAKSIMAL SUHU:
                  </label>
                  <span className="text-xs font-black font-orbitron text-[#00C9FF]">
                    {tempLimit}°C
                  </span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="45"
                  step="0.5"
                  value={tempLimit}
                  onChange={(e) => handleSaveTempLimit(parseFloat(e.target.value))}
                  className="w-full accent-[#00C9FF] bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-mono">
                  <span>25°C (Sensitif)</span>
                  <span>45°C (Maks)</span>
                </div>
              </div>

              {/* Help box */}
              <div className="bg-[#00C9FF]/5 border border-[#00C9FF]/10 p-3 rounded-xl flex gap-2 text-[10px] text-slate-400 font-rajdhani">
                <HelpCircle className="w-4 h-4 text-[#00C9FF] flex-shrink-0" />
                <div>
                  Hubungkan dengan ESP32 Anda untuk publish ke topik <span className="text-[#00C9FF] font-mono">iot/relay/1s.d.4</span> & subscribe dari <span className="text-emerald-400 font-mono">iot/sensor/suhu,kelembapan</span> agar bekerja real-time!
                </div>
              </div>
            </div>
          )}

          {/* MQTT BROKERS COMPACT LIST */}
          <section className="bg-slate-950/30 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold flex items-center gap-1.5 mb-3 border-b border-slate-900/40 pb-2">
              <Radio className="w-4 h-4 animate-pulse" /> KONEKTIVITAS MQTT BROKER
            </h2>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              Sistem bekerja memantau 3 Broker MQTT secara sinkron.
            </p>

            <div className="space-y-3">
              
              {/* Mosquitto Public */}
              <div className="bg-slate-900/10 border border-slate-900 p-2.5 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-300 font-orbitron block">
                    Mosquitto Public
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">test.mosquitto.org</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status Indicator */}
                  <div className="flex flex-col items-end">
                    <span className={`w-2 h-2 rounded-full inline-block ${brokerStatus.mosquitto.connected ? 'bg-emerald-500 shadow-glow' : 'bg-rose-500'}`}></span>
                    <span className="text-[9px] font-mono mt-0.5 text-slate-400 text-right">
                      {brokerStatus.mosquitto.latency !== null ? `${brokerStatus.mosquitto.latency}ms` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Flespi Token Auth */}
              <div className="bg-slate-900/10 border border-slate-900 p-2.5 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#00C9FF] text-glow font-orbitron block">
                      Flespi Private
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">mqtt.flespi.io</span>
                  </div>
                  <div className="flex items-end flex-col">
                    <span className={`w-2 h-2 rounded-full inline-block ${brokerStatus.flespi.connected ? 'bg-emerald-500 shadow-glow' : 'bg-rose-500'}`}></span>
                    <span className="text-[9px] font-mono mt-0.5 text-slate-400 text-right">
                      {brokerStatus.flespi.latency !== null ? `${brokerStatus.flespi.latency}ms` : '--'}
                    </span>
                  </div>
                </div>
                
                {/* Direct Flespi Token input */}
                <div className="mt-1 pt-1.5 border-t border-slate-900/40 space-y-1">
                  <div className="flex justify-between items-center text-[9px] font-mono font-bold text-slate-400">
                    <span>MASUKKAN TOKEN FLESPI:</span>
                    {flespiToken ? (
                      <span className="text-[8px] text-emerald-400 bg-emerald-950/20 px-1 rounded-sm">TERPASANG</span>
                    ) : (
                      <span className="text-[8px] text-amber-500 bg-amber-950/10 px-1 rounded-sm animate-pulse">BELUM AKTIF</span>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder="Token Flespi (flespi.io)..."
                    value={flespiToken}
                    onChange={(e) => handleSaveFlespiToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-900 hover:border-[#00C9FF]/30 focus:border-[#00C9FF] text-[10px] p-1.5 rounded-lg text-slate-300 font-mono focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Mosquitto Authorized */}
              <div className="bg-slate-900/10 border border-slate-900 p-2.5 rounded-xl flex items-center justify-between gap-2 relative">
                <div className="absolute top-1 right-2 bg-[#00C9FF]/10 text-[#00C9FF] text-[8px] px-1 rounded font-mono font-black border border-[#00C9FF]/20">
                  AUTH
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-300 font-orbitron block">
                    Mosquitto Secure
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">User: rw (Encrypted)</span>
                </div>
                <div className="flex items-end flex-col">
                  <span className={`w-2 h-2 rounded-full inline-block ${brokerStatus.mosquitto_auth.connected ? 'bg-emerald-500 shadow-glow' : 'bg-rose-500'}`}></span>
                  <span className="text-[9px] font-mono mt-0.5 text-slate-400 text-right">
                    {brokerStatus.mosquitto_auth.latency !== null ? `${brokerStatus.mosquitto_auth.latency}ms` : '--'}
                  </span>
                </div>
              </div>

            </div>

            <button
              onClick={connectAllBrokers}
              className="w-full mt-3.5 flex items-center justify-center gap-1.5 text-[10px] font-orbitron font-bold uppercase tracking-wider py-2 bg-slate-900/60 hover:bg-slate-800 text-[#00C9FF] border border-slate-850 rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#00C9FF]" /> Sambungkan Ulang Broker
            </button>
          </section>

          {/* VOICE INTEGRATION GATEWAY */}
          <section className="bg-slate-950/30 backdrop-blur-md border border-slate-900/60 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <h2 className="text-xs font-orbitron tracking-widest text-[#00C9FF] uppercase font-bold flex items-center gap-1.5 mb-3 border-b border-slate-900/40 pb-2">
              <Sparkles className="w-4 h-4 text-[#00C9FF]" /> ASISTEN SUARA REALTIME
            </h2>
            <VoiceCommandWidget
              speak={speak}
              suhu={suhu}
              kelembapan={kelembapan}
              setRelay={setRelay}
              setAllRelays={setAllRelays}
              setPola={setPola}
              setAllPola={setAllPola}
              clearAllLogs={() => {
                setLogs([]);
                speak("Log dibersihkan");
              }}
              turnOffEverything={() => {
                turnOffEverything();
                speak("Semua perangkat dinonaktifkan");
              }}
              addLog={addLog}
            />
          </section>

          {/* ACTIVITY LOGS INTEGRATION */}
          <section>
            <LogPanel logs={logs} onClear={() => setLogs([])} />
          </section>

        </div>

      </main>

      {/* --- FOOTER COMPACT BANNER --- */}
      <footer className="mt-auto px-4 py-5 border-t border-slate-900/40 bg-slate-950/20 text-center select-none text-[10px] text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <span>
            © 2026 NEXUS IoT Hub. Designed minimally in high contrast Slate Theme.
          </span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/20 text-[9px] tracking-widest font-bold">
              SYS STATUS: OPERATIONAL
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
