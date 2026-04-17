import { TrendingUp, X, Search } from "lucide-react";

const POPULAR_STOCKS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "INTC", name: "Intel Corp." },
  { symbol: "COIN", name: "Coinbase Global" },
  { symbol: "SPY", name: "S&P 500 ETF Trust" },
];

export default function MarketSidebar({
  isDarkMode,
  isSidebarOpen,
  setIsSidebarOpen,
  activeSymbol,
  setActiveSymbol,
  searchInput,
  setSearchInput,
}) {
  return (
    <>
      {/* SIDEBAR OVERLAY */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SLIDE-OUT SIDEBAR */}
      <div
        className={`fixed top-0 left-0 h-full w-80 z-50 flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${isDarkMode ? "bg-slate-900 text-gray-100" : "bg-white text-gray-800"}`}
      >
        <div
          className={`p-5 flex justify-between items-center border-b ${
            isDarkMode ? "border-slate-700" : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <span className="font-bold text-lg">Market Explorer</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`p-4 border-b ${
            isDarkMode ? "border-slate-700" : "border-gray-200"
          }`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchInput) {
                setActiveSymbol(searchInput.toUpperCase());
                setSearchInput("");
                setIsSidebarOpen(false);
              }
            }}
            className="flex gap-2"
          >
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search Ticker..."
                className={`w-full border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 uppercase transition-all ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-600 text-gray-100 placeholder:text-slate-400"
                    : "bg-white border-gray-300 text-gray-800"
                }`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              Go
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">
            Popular Assets
          </h3>
          {POPULAR_STOCKS.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => {
                setActiveSymbol(stock.symbol);
                setSearchInput("");
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                activeSymbol === stock.symbol
                  ? "bg-blue-600 text-white"
                  : isDarkMode
                  ? "hover:bg-slate-800 text-gray-300"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <div className="flex flex-col items-start">
                <span className="font-bold">{stock.symbol}</span>
                <span
                  className={`text-xs ${
                    activeSymbol === stock.symbol
                      ? "text-blue-100"
                      : "text-gray-400"
                  }`}
                >
                  {stock.name}
                </span>
              </div>
              {activeSymbol === stock.symbol && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
