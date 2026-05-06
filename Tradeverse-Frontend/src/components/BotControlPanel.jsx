import { Bot } from "lucide-react";
import { ALL_TARGETS } from "../constants/markets";

export default function BotControlPanel({
  isBotActive,
  setIsBotActive,
  botTargets,
  toggleBotTarget,
  maxCapital,
  setMaxCapital,
  stopLoss,
  setStopLoss,
  takeProfit,
  setTakeProfit,
}) {
  return (
    <div className="mb-6">
      <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 p-6 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)] relative overflow-hidden">
        {isBotActive && (
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl blur opacity-25 animate-pulse" />
        )}
        <div className="relative z-10">
          {/* Bot Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bot className={`h-6 w-6 ${isBotActive ? "text-cyan-400 animate-pulse" : "text-gray-400"}`} />
              Auto-Pilot Bot
            </h2>
            <button
              onClick={() => setIsBotActive(!isBotActive)}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${isBotActive ? "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.6)]" : "bg-gray-700"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ${isBotActive ? "translate-x-8" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Terminal Status */}
          <div className="mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Terminal Status</p>
            <div className={`text-sm font-mono px-3 py-2 rounded-lg inline-block ${isBotActive ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-gray-800 text-gray-500 border border-gray-700"}`}>
              {isBotActive ? "[RUNNING]" : "[STANDBY]"}
            </div>
          </div>

          {/* Target Intel */}
          <div className="mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Target Intel</p>
            <div className="flex flex-wrap gap-2">
              {ALL_TARGETS.map((sym) => (
                <button
                  key={sym}
                  onClick={() => toggleBotTarget(sym)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    botTargets.includes(sym)
                      ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Bot Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Max Capital Allocation</span>
                <span className="text-cyan-400 font-bold">${maxCapital}</span>
              </div>
              <input type="range" min="100" max="10000" step="100" value={maxCapital}
                onChange={(e) => setMaxCapital(Number(e.target.value))}
                className="w-full accent-cyan-500" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Hard Stop Loss (%)</span>
                <span className="text-red-400 font-bold">{stopLoss}%</span>
              </div>
              <input type="range" min="1" max="50" step="1" value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-full accent-red-500" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Take Profit (%)</span>
                <span className="text-green-400 font-bold">{takeProfit}%</span>
              </div>
              <input type="range" min="1" max="500" step="1" value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
                className="w-full accent-green-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
