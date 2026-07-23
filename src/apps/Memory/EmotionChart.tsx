import { useState, useMemo } from 'react';
import { useOSStore } from '@/context/OSStore';
import { deriveMood, getEmotionColor } from '@/core/EmotionUtils';
import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type TimeRange = '7d' | '30d' | 'all';

export default function EmotionChart() {
  const { getCharacterState, activeCharacterId } = useOSStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{
    timestamp: number;
    valence: number;
    arousal: number;
    trigger: string;
  } | null>(null);

  const characterState = activeCharacterId ? getCharacterState(activeCharacterId) : undefined;
  const history = characterState?.emotionHistory || [];

  // 过滤时间范围
  const filteredHistory = useMemo(() => {
    if (timeRange === 'all') return history;
    const now = Date.now();
    const days = timeRange === '7d' ? 7 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return history.filter(h => h.timestamp >= cutoff);
  }, [history, timeRange]);

  // 如果没有数据
  if (filteredHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/30 px-4">
        <TrendingUp size={48} className="mb-4 opacity-40" />
        <p className="text-sm">暂无情感记录</p>
        <p className="text-xs text-white/20 mt-2">和角色聊天后，情感变化会自动记录</p>
      </div>
    );
  }

  // SVG 配置
  const width = 360;
  const height = 200;
  const padding = { top: 20, right: 40, bottom: 40, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 数据范围
  const minTime = Math.min(...filteredHistory.map(h => h.timestamp));
  const maxTime = Math.max(...filteredHistory.map(h => h.timestamp));
  const timeRange_ms = maxTime - minTime || 1;

  // 坐标转换
  const getX = (timestamp: number) => {
    return padding.left + ((timestamp - minTime) / timeRange_ms) * chartWidth;
  };
  const getYValence = (valence: number) => {
    // valence: -1 ~ 1 → chartHeight ~ 0
    return padding.top + chartHeight - ((valence + 1) / 2) * chartHeight;
  };
  const getYArousal = (arousal: number) => {
    // arousal: 0 ~ 1 → chartHeight ~ 0
    return padding.top + chartHeight - arousal * chartHeight;
  };

  // 生成路径
  const valencePath = filteredHistory.map((h, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return `${cmd} ${getX(h.timestamp)} ${getYValence(h.valence)}`;
  }).join(' ');

  const arousalPath = filteredHistory.map((h, i) => {
    const cmd = i === 0 ? 'M' : 'L';
    return `${cmd} ${getX(h.timestamp)} ${getYArousal(h.arousal)}`;
  }).join(' ');

  // 当前情感状态
  const latest = filteredHistory[filteredHistory.length - 1];
  const currentMood = deriveMood(latest.valence, latest.arousal);

  // 统计
  const avgValence = filteredHistory.reduce((s, h) => s + h.valence, 0) / filteredHistory.length;
  const avgArousal = filteredHistory.reduce((s, h) => s + h.arousal, 0) / filteredHistory.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 顶部统计 */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white/40 text-xs">当前情感</p>
            <p className="text-white/90 text-lg font-semibold">{currentMood}</p>
          </div>
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${getEmotionColor(latest.valence, latest.arousal)}22` }}
          >
            <span className="text-lg">
              {latest.valence > 0.3 ? '😊' : latest.valence < -0.3 ? '😔' : '😐'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={12} className="text-blue-400" />
              <span className="text-white/40 text-[10px]">平均效价</span>
            </div>
            <p className={`text-sm font-medium ${avgValence > 0 ? 'text-green-400' : avgValence < 0 ? 'text-red-400' : 'text-white/60'}`}>
              {avgValence > 0 ? '+' : ''}{avgValence.toFixed(2)}
            </p>
          </div>
          <div className="glass-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown size={12} className="text-orange-400" />
              <span className="text-white/40 text-[10px]">平均唤醒度</span>
            </div>
            <p className="text-sm font-medium text-orange-400">
              {avgArousal.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* 时间范围选择 */}
      <div className="flex items-center justify-center gap-2 px-4 py-3">
        {([
          { key: '7d' as TimeRange, label: '7天' },
          { key: '30d' as TimeRange, label: '30天' },
          { key: 'all' as TimeRange, label: '全部' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTimeRange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
              timeRange === key
                ? 'bg-white/10 text-white/90'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 图表 */}
      <div className="px-4 pb-4">
        <div className="glass-card p-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ maxHeight: '250px' }}
          >
            {/* 背景网格 */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={`h-${ratio}`}
                x1={padding.left}
                y1={padding.top + ratio * chartHeight}
                x2={width - padding.right}
                y2={padding.top + ratio * chartHeight}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            ))}

            {/* 中心线（valence = 0） */}
            <line
              x1={padding.left}
              y1={getYValence(0)}
              x2={width - padding.right}
              y2={getYValence(0)}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
              strokeDasharray="4,4"
            />

            {/* Valence 折线 */}
            <path
              d={valencePath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Arousal 折线 */}
            <path
              d={arousalPath}
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 数据点 */}
            {filteredHistory.map((h, i) => {
              const x = getX(h.timestamp);
              const yV = getYValence(h.valence);
              const yA = getYArousal(h.arousal);
              const isHovered = hoveredPoint?.timestamp === h.timestamp;

              return (
                <g key={i}>
                  {/* Valence 点 */}
                  <circle
                    cx={x}
                    cy={yV}
                    r={isHovered ? 5 : 3}
                    fill="#3b82f6"
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredPoint(h)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {/* Arousal 点 */}
                  <circle
                    cx={x}
                    cy={yA}
                    r={isHovered ? 5 : 3}
                    fill="#f97316"
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredPoint(h)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </g>
              );
            })}

            {/* Y 轴标签 - Valence */}
            <text x={padding.left - 8} y={getYValence(1) + 4} textAnchor="end" fill="#3b82f6" fontSize="8">+1</text>
            <text x={padding.left - 8} y={getYValence(0) + 4} textAnchor="end" fill="#3b82f6" fontSize="8">0</text>
            <text x={padding.left - 8} y={getYValence(-1) + 4} textAnchor="end" fill="#3b82f6" fontSize="8">-1</text>

            {/* Y 轴标签 - Arousal */}
            <text x={width - padding.right + 8} y={getYArousal(1) + 4} textAnchor="start" fill="#f97316" fontSize="8">1</text>
            <text x={width - padding.right + 8} y={getYArousal(0) + 4} textAnchor="start" fill="#f97316" fontSize="8">0</text>

            {/* X 轴时间标签 */}
            <text x={padding.left} y={height - 10} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">
              {new Date(minTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </text>
            <text x={width - padding.right} y={height - 10} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">
              {new Date(maxTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </text>
          </svg>

          {/* 图例 */}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-blue-400 rounded-full" />
              <span className="text-white/40 text-[10px]">效价 (valence)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-orange-400 rounded-full" />
              <span className="text-white/40 text-[10px]">唤醒度 (arousal)</span>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredPoint && (
          <div className="mt-3 glass-card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/40 text-xs">
                {new Date(hoveredPoint.timestamp).toLocaleString('zh-CN')}
              </span>
              <span 
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ 
                  backgroundColor: `${getEmotionColor(hoveredPoint.valence, hoveredPoint.arousal)}22`,
                  color: getEmotionColor(hoveredPoint.valence, hoveredPoint.arousal)
                }}
              >
                {deriveMood(hoveredPoint.valence, hoveredPoint.arousal)}
              </span>
            </div>
            <p className="text-white/60 text-sm">{hoveredPoint.trigger}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-blue-400 text-xs">效价: {hoveredPoint.valence.toFixed(2)}</span>
              <span className="text-orange-400 text-xs">唤醒度: {hoveredPoint.arousal.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* 记录列表 */}
        <div className="mt-4 space-y-2">
          <p className="text-white/30 text-xs px-1">最近记录</p>
          {filteredHistory.slice(-10).reverse().map((h, i) => (
            <div key={i} className="glass-card p-2.5 flex items-center gap-3">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getEmotionColor(h.valence, h.arousal) }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-xs truncate">{h.trigger}</p>
                <p className="text-white/30 text-[10px]">
                  {new Date(h.timestamp).toLocaleDateString('zh-CN')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-blue-400/60 text-[10px]">{h.valence > 0 ? '+' : ''}{h.valence.toFixed(1)}</span>
                <span className="text-orange-400/60 text-[10px]">{h.arousal.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

