import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LogType } from '../types';

interface VoiceCommandWidgetProps {
  speak: (text: string) => void;
  suhu: number;
  kelembapan: number;
  setRelay: (id: 1 | 2 | 3 | 4, val: boolean) => void;
  setAllRelays: (val: boolean) => void;
  setPola: (id: 1 | 2, val: boolean) => void;
  setAllPola: (val: boolean) => void;
  clearAllLogs: () => void;
  turnOffEverything: () => void;
  addLog: (text: string, type: LogType) => void;
}

export const VoiceCommandWidget: React.FC<VoiceCommandWidgetProps> = ({
  speak,
  suhu,
  kelembapan,
  setRelay,
  setAllRelays,
  setPola,
  setAllPola,
  clearAllLogs,
  turnOffEverything,
  addLog,
}) => {
  const [isListeningState, setIsListeningState] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>('');
  const [micStatus, setMicStatus] = useState<'unauthorized' | 'requesting' | 'active'>('unauthorized');
  const [showBlockedBanner, setShowBlockedBanner] = useState(false);

  const [isInIframe, setIsInIframe] = useState(false);

  // References to keep SpeechRecognition sync accurate without re-render cycles
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const permissionGrantedRef = useRef(false);

  // Check if inside iframe
  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Initialize Speech Recognition once
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('Web Speech API tidak didukung di browser ini. Perintah suara tidak dapat digunakan.', 'error');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'id-ID';

    rec.onstart = () => {
      setMicStatus('active');
    };

    rec.onerror = (event: any) => {
      const err = event.error;
      // JANGAN pernah log error aborted ke panel log aktivitas
      if (err === 'aborted') {
        return;
      }

      if (err === 'not-allowed' || err === 'audio-capture') {
        permissionGrantedRef.current = false;
        isListeningRef.current = false;
        setIsListeningState(false);
        setMicStatus('unauthorized');
        setShowBlockedBanner(true);
        addLog(`Izin mikrofon diblokir ${err === 'not-allowed' ? '(Not Allowed)' : '(Audio Capture)'}. Sensor suara dinonaktifkan.`, 'error');
        // Stop recognition to be absolutely safe
        try {
          rec.abort();
        } catch (e) {}
      } else {
        addLog(`Error Web Speech: ${err}. Menghentikan perintah suara.`, 'error');
        isListeningRef.current = false;
        setIsListeningState(false);
        setMicStatus('unauthorized');
      }
    };

    rec.onend = () => {
      // Restart HANYA jika listening dan permission granted aktif
      if (isListeningRef.current && permissionGrantedRef.current) {
        try {
          rec.start();
        } catch (e) {
          console.error("Mengalami masalah me-restart SpeechRecognition", e);
        }
      } else {
        setIsListeningState(false);
        isListeningRef.current = false;
        if (permissionGrantedRef.current) {
          setMicStatus('unauthorized'); // Allowed but resting
        } else {
          setMicStatus('unauthorized');
        }
      }
    };

    rec.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript;
      if (!transcript) return;

      const sentence = transcript.toLowerCase().trim();
      setLastCommand(transcript);
      addLog(`Mendengar perintah suara: "${transcript}"`, 'incoming');

      // PROCESS INDONESIAN VOICE COMMANDS FUZZY MATCHES
      
      // 1. ALL RELAYS ON
      const triggerAllRelayOn = [
        "semua relay nyala", "hidupkan semua relay", "nyalakan semua relay", 
        "semua relay on", "aktifkan semua relay", "relay semua nyala", 
        "semua relay hidup", "hidupkan seluruh relay", "nyalakan seluruh relay", 
        "aktifkan seluruh relay", "seluruh relay nyala", "semua relay aktif", 
        "relay on semua", "on semua relay", "semua on", "nyalain semua relay", 
        "on kan semua relay"
      ];
      if (triggerAllRelayOn.some(keyword => sentence.includes(keyword))) {
        setAllRelays(true);
        speak("Semua relay dinyalakan");
        addLog("Tindakan Suara: Menyalakan semua relay", "system");
        return;
      }

      // 2. ALL RELAYS OFF
      const triggerAllRelayOff = [
        "semua relay mati", "matikan semua relay", "semua relay off", 
        "nonaktifkan semua relay", "relay semua mati", "semua relay padam", 
        "matikan seluruh relay", "nonaktifkan seluruh relay", "seluruh relay mati", 
        "semua relay nonaktif", "padamkan semua relay", "relay off semua", 
        "off semua relay", "semua off", "matiin semua relay", "off kan semua relay"
      ];
      if (triggerAllRelayOff.some(keyword => sentence.includes(keyword))) {
        setAllRelays(false);
        speak("Semua relay dimatikan");
        addLog("Tindakan Suara: Mematikan semua relay", "system");
        return;
      }

      // 3. INDIVIDUAL RELAYS ON & OFF
      // RELAY 1 ON
      const r1On = [
        "relay satu nyala", "hidupkan relay satu", "relay satu on", "relay 1 nyala", "relay 1 on", "aktifkan relay satu", "nyalakan relay satu", "relay pertama nyala",
        "lampu satu nyala", "hidupkan lampu satu", "lampu satu on", "lampu 1 nyala", "lampu 1 on", "aktifkan lampu satu", "nyalakan lampu satu", "nyalakan lampu 1", "hidupkan lampu 1",
        "sakelar satu nyala", "nyalakan sakelar satu", "sakelar 1 nyala", "sakelar 1 on", "hidupkan sakelar satu", "hidupkan sakelar 1"
      ];
      if (r1On.some(keyword => sentence.includes(keyword))) {
        setRelay(1, true);
        speak("Lampu satu dinyalakan");
        addLog("Tindakan Suara: Menyalakan Lampu 1 (Relay 1)", "system");
        return;
      }
      // RELAY 1 OFF
      const r1Off = [
        "relay satu mati", "matikan relay satu", "relay satu off", "relay 1 mati", "relay 1 off", "nonaktifkan relay satu", "padamkan relay satu", "relay pertama mati",
        "lampu satu mati", "matikan lampu satu", "lampu satu off", "lampu 1 mati", "lampu 1 off", "nonaktifkan lampu satu", "padamkan lampu satu", "matikan lampu 1",
        "sakelar satu mati", "matikan sakelar satu", "sakelar 1 mati", "sakelar 1 off", "nonaktifkan sakelar satu"
      ];
      if (r1Off.some(keyword => sentence.includes(keyword))) {
        setRelay(1, false);
        speak("Lampu satu dimatikan");
        addLog("Tindakan Suara: Mematikan Lampu 1 (Relay 1)", "system");
        return;
      }

      // RELAY 2 ON
      const r2On = [
        "relay dua nyala", "hidupkan relay dua", "relay dua on", "relay 2 nyala", "relay 2 on", "aktifkan relay dua", "nyalakan relay dua", "relay kedua nyala",
        "lampu dua nyala", "hidupkan lampu dua", "lampu dua on", "lampu 2 nyala", "lampu 2 on", "aktifkan lampu dua", "nyalakan lampu dua", "nyalakan lampu 2", "hidupkan lampu 2",
        "sakelar dua nyala", "nyalakan sakelar dua", "sakelar 2 nyala", "sakelar 2 on", "hidupkan sakelar dua", "hidupkan sakelar 2"
      ];
      if (r2On.some(keyword => sentence.includes(keyword))) {
        setRelay(2, true);
        speak("Lampu dua dinyalakan");
        addLog("Tindakan Suara: Menyalakan Lampu 2 (Relay 2)", "system");
        return;
      }
      // RELAY 2 OFF
      const r2Off = [
        "relay dua mati", "matikan relay dua", "relay dua off", "relay 2 mati", "relay 2 off", "nonaktifkan relay dua", "padamkan relay dua", "relay kedua mati",
        "lampu dua mati", "matikan lampu dua", "lampu dua off", "lampu 2 mati", "lampu 2 off", "nonaktifkan lampu dua", "padamkan lampu dua", "matikan lampu 2",
        "sakelar dua mati", "matikan sakelar dua", "sakelar 2 mati", "sakelar 2 off", "nonaktifkan sakelar dua"
      ];
      if (r2Off.some(keyword => sentence.includes(keyword))) {
        setRelay(2, false);
        speak("Lampu dua dimatikan");
        addLog("Tindakan Suara: Mematikan Lampu 2 (Relay 2)", "system");
        return;
      }

      // RELAY 3 ON
      const r3On = [
        "relay tiga nyala", "hidupkan relay tiga", "relay tiga on", "relay 3 nyala", "relay 3 on", "aktifkan relay tiga", "nyalakan relay tiga", "relay ketiga nyala",
        "lampu tiga nyala", "hidupkan lampu tiga", "lampu tiga on", "lampu 3 nyala", "lampu 3 on", "aktifkan lampu tiga", "nyalakan lampu tiga", "nyalakan lampu 3", "hidupkan lampu 3",
        "sakelar tiga nyala", "nyalakan sakelar tiga", "sakelar 3 nyala", "sakelar 3 on", "hidupkan sakelar tiga", "hidupkan sakelar 3"
      ];
      if (r3On.some(keyword => sentence.includes(keyword))) {
        setRelay(3, true);
        speak("Lampu tiga dinyalakan");
        addLog("Tindakan Suara: Menyalakan Lampu 3 (Relay 3)", "system");
        return;
      }
      // RELAY 3 OFF
      const r3Off = [
        "relay tiga mati", "matikan relay tiga", "relay tiga off", "relay 3 mati", "relay 3 off", "nonaktifkan relay tiga", "padamkan relay tiga", "relay ketiga mati",
        "lampu tiga mati", "matikan lampu tiga", "lampu tiga off", "lampu 3 mati", "lampu 3 off", "nonaktifkan lampu tiga", "padamkan lampu tiga", "matikan lampu 3",
        "sakelar tiga mati", "matikan sakelar tiga", "sakelar 3 mati", "sakelar 3 off", "nonaktifkan sakelar tiga"
      ];
      if (r3Off.some(keyword => sentence.includes(keyword))) {
        setRelay(3, false);
        speak("Lampu tiga dimatikan");
        addLog("Tindakan Suara: Mematikan Lampu 3 (Relay 3)", "system");
        return;
      }

      // RELAY 4 ON
      const r4On = [
        "relay empat nyala", "hidupkan relay empat", "relay empat on", "relay 4 nyala", "relay 4 on", "aktifkan relay empat", "nyalakan relay empat", "relay keempat nyala",
        "lampu empat nyala", "hidupkan lampu empat", "lampu empat on", "lampu 4 nyala", "lampu 4 on", "aktifkan lampu empat", "nyalakan lampu empat", "nyalakan lampu 4", "hidupkan lampu 4",
        "sakelar empat nyala", "nyalakan sakelar empat", "sakelar 4 nyala", "sakelar 4 on", "hidupkan sakelar empat", "hidupkan sakelar 4"
      ];
      if (r4On.some(keyword => sentence.includes(keyword))) {
        setRelay(4, true);
        speak("Lampu empat dinyalakan");
        addLog("Tindakan Suara: Menyalakan Lampu 4 (Relay 4)", "system");
        return;
      }
      // RELAY 4 OFF
      const r4Off = [
        "relay empat mati", "matikan relay empat", "relay empat off", "relay 4 mati", "relay 4 off", "nonaktifkan relay empat", "padamkan relay empat", "relay keempat mati",
        "lampu empat mati", "matikan lampu empat", "lampu empat off", "lampu 4 mati", "lampu 4 off", "nonaktifkan lampu empat", "padamkan lampu empat", "matikan lampu 4",
        "sakelar empat mati", "matikan sakelar empat", "sakelar 4 mati", "sakelar 4 off", "nonaktifkan sakelar empat"
      ];
      if (r4Off.some(keyword => sentence.includes(keyword))) {
        setRelay(4, false);
        speak("Lampu empat dimatikan");
        addLog("Tindakan Suara: Mematikan Lampu 4 (Relay 4)", "system");
        return;
      }

      // 4. ALL PATTERNS ON
      const triggerPolaAllOn = [
        "semua mode lampu nyala", "hidupkan semua mode lampu", "aktifkan semua mode lampu", 
        "nyalakan semua mode lampu", "semua mode lampu on", "semua mode lampu aktif", 
        "aktifkan seluruh mode lampu", "hidupkan seluruh mode lampu", "seluruh mode lampu nyala", 
        "mode lampu on semua", "on semua mode lampu", "nyalain semua mode lampu", 
        "hidupkan mode lampu semua", "mode lampu semua on", "on kan semua mode lampu",
        "semua pola nyala", "hidupkan semua pola", "aktifkan semua pola"
      ];
      if (triggerPolaAllOn.some(keyword => sentence.includes(keyword))) {
        setAllPola(true);
        speak("Semua mode lampu otomatis dinyalakan");
        addLog("Tindakan Suara: Menyalakan semua mode lampu otomatis", "system");
        return;
      }

      // 5. ALL PATTERNS OFF
      const triggerPolaAllOff = [
        "matikan semua mode lampu", "stop mode lampu", "semua mode lampu mati", 
        "nonaktifkan semua mode lampu", "semua mode lampu off", "matikan seluruh mode lampu", 
        "stop semua mode lampu", "nonaktifkan seluruh mode lampu", "seluruh mode lampu mati", 
        "padamkan semua mode lampu", "mode lampu off semua", "off semua mode lampu", 
        "matiin semua mode lampu", "matikan mode lampu semua", "hentikan semua mode lampu",
        "matikan semua pola", "stop pola"
      ];
      if (triggerPolaAllOff.some(keyword => sentence.includes(keyword))) {
        setAllPola(false);
        speak("Semua mode lampu otomatis dimatikan");
        addLog("Tindakan Suara: Mematikan semua mode lampu otomatis", "system");
        return;
      }

      // 6. PATTERN 1 ON & OFF
      const pola1On = [
        "hidupkan mode lampu satu", "mode lampu satu nyala", "aktifkan mode lampu satu", "mode 1 nyala", 
        "nyalakan mode lampu satu", "mode lampu satu on", "mode 1 on", "jalankan mode lampu satu",
        "hidupkan mode satu", "mode satu nyala", "aktifkan mode satu", "nyalakan mode satu",
        "hidupkan pola satu", "pola satu nyala"
      ];
      if (pola1On.some(keyword => sentence.includes(keyword))) {
        setPola(1, true);
        speak("Mode lampu satu dinyalakan, running dot aktif");
        addLog("Tindakan Suara: Mengaktifkan Mode Lampu 1 (Kiri ke Kanan)", "system");
        return;
      }
      const pola1Off = [
        "matikan mode lampu satu", "stop mode lampu satu", "mode lampu satu mati", "mode 1 mati", "mode 1 off", 
        "nonaktifkan mode lampu satu", "hentikan mode lampu satu", "matikan mode satu", "stop mode satu",
        "matikan pola satu", "pola satu mati"
      ];
      if (pola1Off.some(keyword => sentence.includes(keyword))) {
        setPola(1, false);
        speak("Mode lampu satu dimatikan");
        addLog("Tindakan Suara: Menonaktifkan Mode Lampu 1", "system");
        return;
      }

      // 7. PATTERN 2 ON & OFF
      const pola2On = [
        "hidupkan mode lampu dua", "mode lampu dua nyala", "aktifkan mode lampu dua", "mode 2 nyala", 
        "nyalakan mode lampu dua", "mode lampu dua on", "mode 2 on", "jalankan mode lampu dua",
        "hidupkan mode dua", "mode dua nyala", "aktifkan mode dua", "nyalakan mode dua",
        "hidupkan pola dua", "pola dua nyala"
      ];
      if (pola2On.some(keyword => sentence.includes(keyword))) {
        setPola(2, true);
        speak("Mode lampu dua dinyalakan, kedipan strobe aktif");
        addLog("Tindakan Suara: Mengaktifkan Mode Lampu 2 (Strobe)", "system");
        return;
      }
      const pola2Off = [
        "matikan mode lampu dua", "stop mode lampu dua", "mode lampu dua mati", "mode 2 mati", "mode 2 off", 
        "nonaktifkan mode lampu dua", "hentikan mode lampu dua", "matikan mode dua", "stop mode dua",
        "matikan pola dua", "pola dua mati"
      ];
      if (pola2Off.some(keyword => sentence.includes(keyword))) {
        setPola(2, false);
        speak("Mode lampu dua dimatikan");
        addLog("Tindakan Suara: Menonaktifkan Mode Lampu 2", "system");
        return;
      }

      // 8. QUERY SENSOR
      const sensorSuhuQuery = ["tampilkan suhu", "berapa suhu", "cek suhu", "baca suhu", "suhu sekarang", "suhu saat ini"];
      const sensorHumQuery = ["tampilkan kelembapan", "berapa kelembapan", "cek kelembapan", "kelembapan sekarang"];
      const sensorAllQuery = ["tampilkan sensor", "cek sensor", "baca sensor", "status sensor", "info sensor"];

      if (sensorAllQuery.some(keyword => sentence.includes(keyword))) {
        speak(`Suhu ${suhu} derajat, kelembapan ${kelembapan} persen`);
        addLog(`Tindakan Suara: Membaca semua data sensor (Suhu: ${suhu}°C, Kelembapan: ${kelembapan}%)`, "system");
        return;
      }
      
      if (sensorSuhuQuery.some(keyword => sentence.includes(keyword))) {
        speak(`Suhu saat ini ${suhu} derajat celcius`);
        addLog(`Tindakan Suara: Membaca sensor suhu (${suhu}°C)`, "system");
        return;
      }

      if (sensorHumQuery.some(keyword => sentence.includes(keyword))) {
        speak(`Kelembapan saat ini ${kelembapan} persen`);
        addLog(`Tindakan Suara: Membaca sensor kelembapan (${kelembapan}%)`, "system");
        return;
      }

      // 9. OTHER SYSTEM VOICE TRIGGERS
      const cleanLogsTrigger = ["bersihkan log", "hapus log", "clear log"];
      if (cleanLogsTrigger.some(keyword => sentence.includes(keyword))) {
        clearAllLogs();
        speak("Log dibersihkan");
        return;
      }

      const turnOffEverythingTrigger = ["semua mati", "matikan semua", "shutdown"];
      if (turnOffEverythingTrigger.some(keyword => sentence.includes(keyword))) {
        turnOffEverything();
        speak("Semua perangkat dimatikan");
        addLog("Tindakan Suara: Mematikan semua relay dan semua pola", "system");
        return;
      }

      // Command unrecognized by patterns but logged
      addLog(`Perintah suara tidak dikenali: "${transcript}"`, 'error');
    };

    recognitionRef.current = rec;
  }, [suhu, kelembapan, setRelay, setAllRelays, setPola, setAllPola, clearAllLogs, turnOffEverything, addLog, speak]);


  // Check microphone permissions on page load
  useEffect(() => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' as PermissionName })
          .then((result) => {
            if (result.state === 'granted') {
              permissionGrantedRef.current = true;
              setShowBlockedBanner(false);
            } else if (result.state === 'denied') {
              permissionGrantedRef.current = false;
              setShowBlockedBanner(true);
            }
            
            result.onchange = () => {
              if (result.state === 'granted') {
                permissionGrantedRef.current = true;
                setShowBlockedBanner(false);
              } else if (result.state === 'denied') {
                permissionGrantedRef.current = false;
                setShowBlockedBanner(true);
              }
            };
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn("Permissions query API not supported fully in this container framework.");
    }
  }, []);


  // MIC TOGGLE FUNCTION CONTRASTED TO PREVENT INFINITE RESTART LOOP
  const toggleMic = async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      addLog('Kesalahan: SpeechRecognition engine belum siap.', 'error');
      return;
    }

    if (isListeningRef.current) {
      recognition.stop();
      isListeningRef.current = false;
      setIsListeningState(false);
      setMicStatus('unauthorized');
      addLog('Asisten suara dinonaktifkan.', 'system');
      return;
    }

    setMicStatus('requesting');
    try {
      // Always request authorization first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionGrantedRef.current = true;
      isListeningRef.current = true;
      setIsListeningState(true);
      setShowBlockedBanner(false);
      recognition.start();
      addLog('Mikrofon diizinkan, voice command aktif. Silakan bicara...', 'system');
      speak("Asisten suara aktif");
    } catch (err) {
      permissionGrantedRef.current = false;
      isListeningRef.current = false;
      setIsListeningState(false);
      setMicStatus('unauthorized');
      setShowBlockedBanner(true);
      addLog('Izin mikrofon ditolak oleh pengguna atau sistem browser.', 'error');
    }
  };

  const getMicStatusText = () => {
    if (isListeningState && micStatus === 'active') {
      return { text: 'Mikrofon: Aktif', color: 'text-emerald-400 bg-emerald-950/30' };
    }
    if (micStatus === 'requesting') {
      return { text: 'Mikrofon: Meminta Izin...', color: 'text-amber-400 bg-amber-950/30 animate-pulse' };
    }
    return { text: 'Mikrofon: Belum Diizinkan', color: 'text-rose-400 bg-rose-950/30' };
  };

  const statusObj = getMicStatusText();

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Banner blocked warn */}
      {showBlockedBanner && (
        <div className="w-full bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg flex items-start gap-2.5 text-xs text-rose-300 font-rajdhani animate-fade-in shadow-glow">
          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0 animate-bounce" />
          <div>
            <span className="font-bold block">Mikrofon diblokir.</span>
            Klik ikon kunci/gembok di address bar browser Anda ➔ izinkan Akses Mikrofon ➔ Reload Halaman untuk memulihkan kontrol suara.
          </div>
        </div>
      )}

      {/* Info banner about iframe restrictions for media devices */}
      {isInIframe && (
        <div className="w-full bg-sky-950/30 border border-sky-500/30 p-3 rounded-lg flex items-start gap-2.5 text-[12px] text-sky-200 font-rajdhani animate-fade-in leading-relaxed">
          <Info className="w-4 h-4 text-[#00C9FF] mt-0.5 flex-shrink-0 animate-pulse" />
          <div>
            <span className="font-bold block text-[#00C9FF] uppercase font-orbitron tracking-wide text-[10px] mb-0.5">Info Penting Kendali Suara:</span>
            Aplikasi sedang terbuka di dalam <span className="font-semibold text-white">Preview AI Studio (Iframe)</span>. Kebijakan keamanan browser modern memblokir akses suara/mikrofon di dalam frame semacam ini.
            <span className="block mt-1.5 font-bold text-white">Solusi: Silakan klik tombol "Buka di Tab Baru" di pojok kanan atas layar preview Anda (atau buka URL aplikasi secara langsung). Di tab baru, Anda dapat mengaktifkan mikrofon secara penuh dan mengontrol sistem IoT dengan perintah suara Anda!</span>
          </div>
        </div>
      )}

      {/* Voice commands info list */}
      <div className="w-full bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl text-xs flex flex-col gap-2">
        <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5 mb-1.5">
          <Info className="text-[#00C9FF] w-3.5 h-3.5" />
          <span className="font-orbitron font-semibold tracking-wider text-slate-300">
            PANDUAN PERINTAH SUARA (INDONESIA)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-400 font-rajdhani leading-relaxed text-[13px]">
          <div>
            <span className="text-[#00C9FF] font-medium block">Kontrol Sakelar (Relay / Lampu):</span>
            <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
              <li>"Nyalakan semua relay" / "Semua relay on"</li>
              <li>"Nyalakan lampu satu" / "Lampu 1 nyala"</li>
              <li>"Matikan sakelar dua" / "Sakelar dua off"</li>
              <li>"Nyalakan lampu tiga" / "Lampu empat mati"</li>
            </ul>
          </div>
          <div>
            <span className="text-[#00C9FF] font-medium block">Kontrol Mode Lampu & Sensor:</span>
            <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
              <li>"Nyalakan semua mode lampu" / "Matikan semua mode lampu"</li>
              <li>"Nyalakan mode lampu satu" / "Mode satu nyala"</li>
              <li>"Cek suhu" / "Berapa kelembapan" / "Baca sensor"</li>
              <li>"Bersihkan log" / "Gunakan semua mati" / "Shutdown"</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Controller Section */}
      <div className="flex flex-col items-center justify-center py-4 relative">
        {/* Dynamic status pill */}
        <span className={`px-3 py-1 rounded-full text-xs font-orbitron tracking-wide border border-transparent/10 select-none mb-3 ${statusObj.color}`}>
          {statusObj.text}
        </span>

        {/* Floating large microphone ripple button */}
        <div className="relative">
          {/* Animated ripple circle background */}
          {isListeningState && (
            <>
              <div className="absolute inset-0 bg-[#00C9FF]/20 rounded-full animate-ping scale-150 duration-1000"></div>
              <div className="absolute inset-0 bg-[#00C9FF]/10 rounded-full animate-ping scale-125 duration-1500 delay-500"></div>
            </>
          )}

          <button
            onClick={toggleMic}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 active:scale-95 ${
              isListeningState
                ? 'bg-[#00C9FF] text-slate-950 shadow-glow-lg border-2 border-white/20'
                : 'bg-slate-850 text-slate-400 hover:text-[#00C9FF] hover:bg-slate-800 border border-slate-700/60'
            }`}
            title={isListeningState ? 'Klik untuk mematikan asisten suara' : 'Klik untuk menyalakan asisten suara'}
          >
            {isListeningState ? (
              <Mic className="w-8 h-8 animate-pulse text-slate-950" />
            ) : (
              <MicOff className="w-8 h-8" />
            )}
          </button>
        </div>

        {/* Live parsed words preview card */}
        {lastCommand && (
          <div className="mt-4 bg-slate-950/80 border border-slate-800/80 px-4 py-2 rounded-lg flex items-center gap-2 max-w-sm text-center shadow-md animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-slate-300 font-mono italic">
              " {lastCommand} "
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
