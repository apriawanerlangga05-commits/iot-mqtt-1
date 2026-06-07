import React, { useEffect, useRef } from 'react';
import { LogEntry, LogType } from '../types';
import { Trash2, Download, Terminal } from 'lucide-react';

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs, onClear }) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleExport = () => {
    if (logs.length === 0) return;
    const content = logs
      .map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.text}`)
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iot_dashboard_log_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTypeStyle = (type: LogType) => {
    switch (type) {
      case 'incoming':
        return 'text-emerald-400 font-medium'; // hijau
      case 'publish':
        return 'text-[#00C9FF] font-medium text-shadow'; // biru cyan
      case 'error':
        return 'text-rose-500 font-bold'; // merah
      case 'system':
      default:
        return 'text-slate-400 font-normal'; // abu-abu
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col h-80 shadow-lg">
      <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="text-[#00C9FF] w-4 h-4" />
          <h2 className="text-sm font-orbitron tracking-wider text-slate-300">
            LOG AKTIVITAS SISTEM
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={logs.length === 0}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Export Log ke berkas .txt"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor .txt
          </button>
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-red-950/20 hover:bg-red-900/30 text-rose-400 hover:text-rose-300 border border-thin border-rose-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Bersihkan semua histori log"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Log
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 font-mono text-xs scrollbar">
        {logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 font-rajdhani text-center p-4">
            <span className="block italic">Log kosong. Koneksikan broker dan kendalikan relay atau sensor untuk melihat aktivitas di sini.</span>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="px-2 py-1 rounded hover:bg-slate-950/40 transition-colors flex items-start gap-2 bg-slate-950/15"
            >
              <span className="text-slate-500 select-none flex-shrink-0">
                [{log.timestamp}]
              </span>
              <span className={`flex-1 break-all ${getTypeStyle(log.type)}`}>
                {log.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
