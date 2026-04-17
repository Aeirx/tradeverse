import TradingChart from "./TradingChart";

export default function TradingPanel({
  isDarkMode,
  activeSymbol,
  livePrice,
  tradeQuantity,
  setTradeQuantity,
  onBuy,
  onSell,
}) {
  return (
    <div className={`p-4 rounded-xl border shadow-sm flex flex-col gap-4 h-[620px] w-full ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
      <div className="flex-1 overflow-hidden rounded-lg border border-slate-700">
        <TradingChart symbol={activeSymbol} isDarkMode={isDarkMode} />
      </div>

      <div className={`flex items-center justify-between p-4 rounded-lg border ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
        <div className="flex flex-col">
          <span className={`text-sm font-bold uppercase tracking-wider ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>Live Price</span>
          <span className={`text-2xl font-black ${isDarkMode ? "text-gray-100" : "text-gray-800"}`}>
            {livePrice === "ERROR" ? (
              <span className="text-red-500">API Error</span>
            ) : livePrice !== null ? (
              `$${Number(livePrice).toFixed(2)}`
            ) : (
              "Fetching..."
            )}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className={`font-bold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Shares:</label>
            <input
              type="number"
              min="1"
              value={tradeQuantity}
              onChange={(e) => setTradeQuantity(e.target.value)}
              className={`border rounded-md px-3 py-2 w-24 text-center text-lg font-semibold focus:outline-none focus:border-blue-500 ${isDarkMode ? "bg-slate-700 border-slate-600 text-gray-100" : "bg-white border-gray-300 text-gray-800"}`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSell}
              disabled={livePrice === null || livePrice === "ERROR"}
              className="bg-red-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SELL
            </button>
            <button
              onClick={onBuy}
              disabled={livePrice === null || livePrice === "ERROR"}
              className="bg-green-600 text-white px-8 py-2 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🛒 BUY {activeSymbol}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
