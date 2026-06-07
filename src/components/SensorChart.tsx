import React, { useEffect, useRef } from 'react';
import { SensorDataPoint } from '../types';

interface SensorChartProps {
  history: SensorDataPoint[];
}

export const SensorChart: React.FC<SensorChartProps> = ({ history }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Set internal canvas resolution to match physical pixels
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background (maintaining transparency to blend with glass card background)
    ctx.clearRect(0, 0, width, height);

    // Draw Grid lines
    ctx.strokeStyle = 'rgba(0, 201, 255, 0.08)';
    ctx.lineWidth = 1;

    // Vertical grid lines
    const gridCols = 8;
    for (let i = 1; i < gridCols; i++) {
      const x = (width / gridCols) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal grid lines
    const gridRows = 5;
    for (let i = 1; i < gridRows; i++) {
      const y = (height / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // No data display
    if (history.length < 2) {
      ctx.fillStyle = 'rgba(0, 201, 255, 0.4)';
      ctx.font = '14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Menunggu data sensor masuk...', width / 2, height / 2);
      return;
    }

    // Min and Max values for scale
    let minTemp = 10;
    let maxTemp = 50;
    let minHum = 0;
    let maxHum = 100;

    // Dynamically adjust scale based on values
    const temps = history.map((h) => h.suhu);
    const hums = history.map((h) => h.kelembapan);
    
    const actualMinTemp = Math.min(...temps);
    const actualMaxTemp = Math.max(...temps);
    if (actualMaxTemp - actualMinTemp > 1) {
      minTemp = Math.max(0, Math.floor(actualMinTemp - 2));
      maxTemp = Math.ceil(actualMaxTemp + 2);
    }
    
    const actualMinHum = Math.min(...hums);
    const actualMaxHum = Math.max(...hums);
    if (actualMaxHum - actualMinHum > 1) {
      minHum = Math.max(0, Math.floor(actualMinHum - 5));
      maxHum = Math.min(100, Math.ceil(actualMaxHum + 5));
    }

    const paddingX = 40;
    const paddingY = 20;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingY * 2;

    // Draw secondary axes guides
    ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
    ctx.font = '10px Orbitron, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxTemp}°C`, paddingX - 8, paddingY + 4);
    ctx.fillText(`${minTemp}°C`, paddingX - 8, height - paddingY);

    ctx.textAlign = 'left';
    ctx.fillText(`${maxHum}%`, width - paddingX + 8, paddingY + 4);
    ctx.fillText(`${minHum}%`, width - paddingX + 8, height - paddingY);

    // X coordinates maps to index
    const getX = (index: number) => {
      return paddingX + (index / (history.length - 1)) * chartWidth;
    };

    // Y coordinates maps to temperature
    const getTempY = (val: number) => {
      const ratio = (val - minTemp) / (maxTemp - minTemp);
      return height - paddingY - ratio * chartHeight;
    };

    // Y coordinates maps to humidity
    const getHumY = (val: number) => {
      const ratio = (val - minHum) / (maxHum - minHum);
      return height - paddingY - ratio * chartHeight;
    };

    // 1. Draw Humidity Line first (underneath)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981'; // Green accent
    ctx.lineWidth = 2;
    history.forEach((point, idx) => {
      const x = getX(idx);
      const y = getHumY(point.kelembapan);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under Humidity Curve with subtle green gradient
    ctx.lineTo(getX(history.length - 1), height - paddingY);
    ctx.lineTo(getX(0), height - paddingY);
    ctx.closePath();
    const humGrad = ctx.createLinearGradient(0, paddingY, 0, height - paddingY);
    humGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    humGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = humGrad;
    ctx.fill();

    // 2. Draw Temperature Line (glowing Biru Cyan #00C9FF)
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00C9FF';
    ctx.beginPath();
    ctx.strokeStyle = '#00C9FF'; // Biru Cyan
    ctx.lineWidth = 3;
    history.forEach((point, idx) => {
      const x = getX(idx);
      const y = getTempY(point.suhu);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // Fill under Temp Curve with cyber cyan gradient
    ctx.lineTo(getX(history.length - 1), height - paddingY);
    ctx.lineTo(getX(0), height - paddingY);
    ctx.closePath();
    const tempGrad = ctx.createLinearGradient(0, paddingY, 0, height - paddingY);
    tempGrad.addColorStop(0, 'rgba(0, 201, 255, 0.2)');
    tempGrad.addColorStop(1, 'rgba(0, 201, 255, 0)');
    ctx.fillStyle = tempGrad;
    ctx.fill();

    // Draw little dots on the last point
    const lastIdx = history.length - 1;
    const lastPoint = history[lastIdx];

    // Temp last point dot
    ctx.beginPath();
    ctx.arc(getX(lastIdx), getTempY(lastPoint.suhu), 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#00C9FF';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00C9FF';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hum last point dot
    ctx.beginPath();
    ctx.arc(getX(lastIdx), getHumY(lastPoint.kelembapan), 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#10b981';
    ctx.fill();

    // Timestamps at the bottom (First, Middle, Last)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
    ctx.font = '10px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(history[0].time, paddingX, height - 4);

    ctx.textAlign = 'center';
    const midIdx = Math.floor(history.length / 2);
    ctx.fillText(history[midIdx].time, getX(midIdx), height - 4);

    ctx.textAlign = 'right';
    ctx.fillText(history[lastIdx].time, width - paddingX, height - 4);

  }, [history]);

  return (
    <div className="relative w-full h-full rounded-md overflow-hidden border border-slate-800/80">
      <canvas
        ref={canvasRef}
        className="w-full h-64 block"
      />
      {/* Legend */}
      <div className="absolute top-2 right-4 flex items-center gap-4 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 text-xs font-rajdhani">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00C9FF] inline-block shadow-glow"></span>
          <span className="text-slate-300">Suhu (°C)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block"></span>
          <span className="text-slate-300">Kelembapan (%)</span>
        </div>
      </div>
    </div>
  );
};
