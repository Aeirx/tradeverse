import { Settings, Zap } from "lucide-react";

export default function AlgoWeightControls({
  isDarkMode,
  sentimentWeight,
  setSentimentWeight,
  rsiWeight,
  setRsiWeight,
  maWeight,
  setMaWeight,
  onExecute,
}) {
  const weights = [
    { label: "News Sentiment (Pinecone)", value: sentimentWeight, setter: setSentimentWeight, color: "text-green-500", accent: "accent-green-500" },
    { label: "RSI Technical", value: rsiWeight, setter: setRsiWeight, color: "text-blue-500", accent: "accent-blue-500" },
    { label: "Moving Average", value: maWeight, setter: setMaWeight, color: "text-purple-500", accent: "accent-purple-500" },
  ];

  return (
    <div className={`p-6 rounded-xl border shadow-sm col-span-1 ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
      <div className={`flex items-center gap-2 mb-6 border-b pb-4 ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
        <Settings className={`h-5 w-5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`} />
        <h2 className="text-lg font-bold">Algorithm Weights</h2>
      </div>
      <div className="space-y-6">
        {weights.map((w) => (
          <div key={w.label}>
            <div className="flex justify-between text-sm mb-2">
              <label className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>{w.label}</label>
              <span className={`font-bold ${w.color}`}>{Math.round(w.value * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05" value={w.value}
              onChange={(e) => w.setter(parseFloat(e.target.value))}
              className={`w-full ${w.accent}`}
            />
          </div>
        ))}
      </div>
      <button
        onClick={onExecute}
        className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
      >
        <Zap className="h-5 w-5 text-yellow-400" /> Execute Strategy
      </button>
    </div>
  );
}
