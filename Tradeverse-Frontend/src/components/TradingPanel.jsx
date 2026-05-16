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
    // Mobile: chart shrinks to 360 px so the buy/sell controls stay visible
    // above the fold. Desktop keeps the 620 px chart-dominant layout.
    <div
      className={`p-4 rounded-xl border shadow-sm flex flex-col gap-4 w-full min-h-[360px] md:h-[620px] ${
        isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"
      }`}
    >
      <div className="flex-1 min-h-[280px] overflow-hidden rounded-lg border border-slate-700">
        <TradingChart symbol={activeSymbol} isDarkMode={isDarkMode} />
      </div>

      {/* Buy/Sell card — `flex-wrap` so on a phone the controls drop below
          the price block instead of overflowing horizontally. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-y-3 p-4 rounded-lg border ${
          isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="flex flex-col">
          <span
            className={`text-sm font-bold uppercase tracking-wider ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Live Price
          </span>
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

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <label className={`font-bold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
              Shares:
            </label>
            <input
              type="number"
              min="1"
              value={tradeQuantity}
              onChange={(e) => setTradeQuantity(e.target.value)}
              className={`border rounded-md px-3 py-2 w-20 text-center text-lg font-semibold focus:outline-none focus:border-blue-500 ${
                isDarkMode
                  ? "bg-slate-700 border-slate-600 text-gray-100"
                  : "bg-white border-gray-300 text-gray-800"
              }`}
            />
          </div>
          <div className="flex gap-2 flex-1 sm:flex-none">
            <button
              onClick={onSell}
              disabled={livePrice === null || livePrice === "ERROR"}
              className="flex-1 sm:flex-none bg-red-500 text-white px-5 py-2 rounded-lg font-bold hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SELL
            </button>
            <button
              onClick={onBuy}
              disabled={livePrice === null || livePrice === "ERROR"}
              className="flex-1 sm:flex-none bg-green-600 text-white px-6 py-2 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🛒 BUY {activeSymbol}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
