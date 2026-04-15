import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  TrendingUp,
  Activity,
  Server,
  Settings,
  Zap,
  Menu,
  X,
  Search,
} from "lucide-react";
import axios from "axios";
import TradingChart from "../components/TradingChart";

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

export default function Dashboard() {
  const navigate = useNavigate();

  // --- AI ALGORITHM WEIGHTS (State) ---
  const [sentimentWeight, setSentimentWeight] = useState(0.5);
  const [rsiWeight, setRsiWeight] = useState(0.3);
  const [maWeight, setMaWeight] = useState(0.2);

  // --- DYNAMIC LOG STATE ---
  const [logs, setLogs] = useState([
    "> System initialized...",
    "> Secure JWT Token verified.",
    "> Awaiting algorithm execution command...",
  ]);
  const [activeSymbol, setActiveSymbol] = useState("TSLA");
  const [searchInput, setSearchInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- WALLET & TRADING STATE ---
  const [balance, setBalance] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [livePrice, setLivePrice] = useState(null);

  // --- FETCH BALANCE ON LOAD ---
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const token = localStorage.getItem("tradeverse_token");
        const response = await axios.get(
          "http://localhost:8000/api/v1/users/balance",
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setBalance(response.data.walletBalance);
        setPortfolio(response.data.portfolio);
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setBalance(0);
      }
    };

    fetchWalletBalance();
  }, []);

  // --- FETCH LIVE PRICE WHEN SYMBOL CHANGES ---
  useEffect(() => {
    const fetchLivePrice = async () => {
      try {
        setLivePrice(null); // Reset to "Fetching..." state
        const token = localStorage.getItem("tradeverse_token");
        const response = await axios.get(
          `http://localhost:8000/api/v1/trades/price/${activeSymbol}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setLivePrice(response.data.price);
      } catch (error) {
        console.error("Failed to fetch live price", error);
        setLivePrice("ERROR"); // <-- NEW: Safely catch the backend crash!
      }
    };

    if (activeSymbol) {
      fetchLivePrice();
    }
  }, [activeSymbol]);

  const handleLogout = () => {
    localStorage.removeItem("tradeverse_token");
    navigate("/");
  };

  // --- THE DYNAMIC EXECUTION FUNCTION (Now Autonomous!) ---
  const handleRunAlgorithm = async () => {
    setLogs((prev) => [
      ...prev,
      `> Initiating sequence for ${activeSymbol}...`,
    ]);
    setLogs((prev) => [
      ...prev,
      `> Weights: Sentiment(${sentimentWeight}), RSI(${rsiWeight}), MA(${maWeight})`,
    ]);

    try {
      // 1. Ask Python for the Brain's decision
      const response = await axios.post("http://localhost:8001/api/predict", {
        symbol: activeSymbol,
        weights: {
          sentiment: sentimentWeight,
          rsi: rsiWeight,
          ma: maWeight,
        },
      });

      // Grabs the exact signal from your algo_engine.py (e.g., "🟢 BUY")
      const signal = response.data.signal.toUpperCase();
      const confidence = response.data.confidence;

      setLogs((prev) => [...prev, `> AI Analysis Complete.`]);
      setLogs((prev) => [
        ...prev,
        `> SIGNAL: ${signal} (Confidence: ${confidence}%)`,
      ]);

      // 2. THE AUTONOMOUS BOT TRIGGER
      if (signal.includes("BUY")) {
        setLogs((prev) => [
          ...prev,
          `> 🤖 BOT OVERRIDE: Automatically executing BUY order...`,
        ]);
        await handleBuyStock(); // The bot pulls the trigger!
      } else if (signal.includes("SELL")) {
        setLogs((prev) => [
          ...prev,
          `> 🤖 BOT OVERRIDE: Automatically executing SELL order...`,
        ]);
        await handleSellStock(); // The bot pulls the trigger!
      } else {
        setLogs((prev) => [
          ...prev,
          `> 🤖 BOT STANDING BY: No favorable trade setup found.`,
        ]);
      }
    } catch (error) {
      setLogs((prev) => [...prev, `> ERROR: Connection to AI Engine failed.`]);
      console.error(error);
    }
  };

  // --- THE SECURE BROKER (EXECUTE BUY) ---
  const handleBuyStock = async () => {
    try {
      setLogs((prev) => [
        ...prev,
        `> Executing BUY order for ${tradeQuantity} shares of ${activeSymbol}...`,
      ]);
      const token = localStorage.getItem("tradeverse_token");

      const response = await axios.post(
        "http://localhost:8000/api/v1/trades/buy",
        {
          symbol: activeSymbol,
          quantity: tradeQuantity,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setBalance(response.data.newBalance);
      setLogs((prev) => [...prev, `> SUCCESS: ${response.data.message}`]);

      const refresh = await axios.get(
        "http://localhost:8000/api/v1/users/balance",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setPortfolio(refresh.data.portfolio);
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        `> ORDER REJECTED: ${error.response?.data?.error || "Network error."}`,
      ]);
      console.error(error);
    }
  };

  // --- THE SECURE BROKER (EXECUTE SELL) ---
  const handleSellStock = async () => {
    try {
      setLogs((prev) => [
        ...prev,
        `> Executing SELL order for ${tradeQuantity} shares of ${activeSymbol}...`,
      ]);
      const token = localStorage.getItem("tradeverse_token");

      const response = await axios.post(
        "http://localhost:8000/api/v1/trades/sell",
        {
          symbol: activeSymbol,
          quantity: tradeQuantity,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setLogs((prev) => [...prev, `> SUCCESS: ${response.data.message}`]);

      const refresh = await axios.get(
        "http://localhost:8000/api/v1/users/balance",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setBalance(refresh.data.walletBalance);
      setPortfolio(refresh.data.portfolio);
    } catch (error) {
      setLogs((prev) => [
        ...prev,
        `> ORDER REJECTED: ${error.response?.data?.error || "Network error."}`,
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden">
      {/* SIDEBAR OVERLAY */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SLIDE-OUT SIDEBAR */}
      <div 
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <span className="font-bold text-lg text-gray-800">Market Explorer</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchInput) {
                setActiveSymbol(searchInput.toUpperCase());
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
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 uppercase transition-all"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Go
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Popular Assets</h3>
          {POPULAR_STOCKS.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => {
                setActiveSymbol(stock.symbol);
                setSearchInput(""); 
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${activeSymbol === stock.symbol ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
            >
              <div className="flex flex-col items-start">
                <span className={`font-bold ${activeSymbol === stock.symbol ? 'text-blue-700' : 'text-gray-800'}`}>{stock.symbol}</span>
                <span className="text-xs text-gray-500">{stock.name}</span>
              </div>
              {activeSymbol === stock.symbol && (
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex flex-wrap justify-between items-center z-10 gap-y-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <h1 className="text-xl font-bold text-gray-800">Tradeverse AI</h1>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 bg-green-50 px-4 py-2 rounded-lg border border-green-200 shadow-sm ml-4">
          <span className="text-sm font-semibold text-green-700 uppercase tracking-wider">
            Buying Power
          </span>
          <span className="font-bold text-lg text-green-800">
            {balance !== null ? `$${balance.toLocaleString()}` : "Loading..."}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Disconnect
        </button>
      </nav>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <h2 className="font-semibold">Live Market Status</h2>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              Tracking {activeSymbol}...
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <Server className="h-5 w-5 text-purple-500" />
              <h2 className="font-semibold">AI Vector Memory</h2>
            </div>
            <p className="text-2xl font-bold text-gray-800">Connected</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <TrendingUp className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold">Current Signal</h2>
            </div>
            <p className="text-2xl font-bold text-gray-400">
              Awaiting execution...
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm col-span-1">
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
              <Settings className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-bold text-gray-800">
                Algorithm Weights
              </h2>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium text-gray-700">
                    News Sentiment (Pinecone)
                  </label>
                  <span className="text-green-600 font-bold">
                    {Math.round(sentimentWeight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sentimentWeight}
                  onChange={(e) =>
                    setSentimentWeight(parseFloat(e.target.value))
                  }
                  className="w-full accent-green-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium text-gray-700">
                    RSI Technical
                  </label>
                  <span className="text-blue-600 font-bold">
                    {Math.round(rsiWeight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={rsiWeight}
                  onChange={(e) => setRsiWeight(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <label className="font-medium text-gray-700">
                    Moving Average
                  </label>
                  <span className="text-purple-600 font-bold">
                    {Math.round(maWeight * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={maWeight}
                  onChange={(e) => setMaWeight(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>

            <button
              onClick={handleRunAlgorithm}
              className="w-full mt-8 bg-gray-900 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors shadow-md"
            >
              <Zap className="h-5 w-5 text-yellow-400" />
              Execute Strategy
            </button>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm col-span-1 lg:col-span-2">
            <h2 className="font-bold text-xl text-gray-800 mb-4">
              My Holdings
            </h2>
            {portfolio.length === 0 ? (
              <p className="text-gray-500 italic">
                Your vault is empty. Execute a trade to begin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 text-sm">
                      <th className="pb-2">Asset</th>
                      <th className="pb-2">Shares</th>
                      <th className="pb-2">Avg Buy Price</th>
                      <th className="pb-2">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.map((stock, index) => {
                      // Look for the exact Mongoose names
                      const displaySymbol = stock.stockSymbol;
                      const displayShares = stock.quantity;
                      const displayPrice =
                        stock.averagePrice || livePrice || 150;

                      // Hide the old ghost rows from our previous tests
                      if (!displaySymbol) return null;

                      return (
                        <tr
                          key={index}
                          className="border-b border-gray-50 hover:bg-gray-50"
                        >
                          <td className="py-3 font-bold text-blue-600">
                            {displaySymbol}
                          </td>
                          <td className="py-3 font-semibold">
                            {displayShares}
                          </td>
                          <td className="py-3 text-gray-600">
                            ${Number(displayPrice).toFixed(2)}
                          </td>
                          <td className="py-3 font-bold text-green-600">
                            $
                            {(
                              Number(displayShares) * Number(displayPrice)
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl shadow-inner mb-6 flex flex-col h-64">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-4">
            <Server className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-100">
              Live Execution Log
            </h2>
          </div>

          <div className="flex-1 font-mono text-sm text-green-400 overflow-y-auto space-y-2">
            {logs.map((log, index) => (
              <p
                key={index}
                className={
                  log.includes("ERROR")
                    ? "text-red-400"
                    : log.includes("SIGNAL")
                      ? "text-yellow-400 font-bold"
                      : ""
                }
              >
                {log}
              </p>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-4 h-[600px] w-full">
          <div className="flex-1 overflow-hidden rounded-lg border border-gray-200">
            <TradingChart symbol={activeSymbol} />
          </div>

          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-500 uppercase">
                Live Price
              </span>
              <span className="text-2xl font-black text-gray-800">
                {/* NEW: Safely display errors without crashing! */}
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
                <label className="font-bold text-gray-700">Shares:</label>
                <input
                  type="number"
                  min="1"
                  value={tradeQuantity}
                  onChange={(e) => setTradeQuantity(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-24 text-center text-lg font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2">
                {/* NEW: Disable buttons if the API crashes! */}
                <button
                  onClick={handleSellStock}
                  disabled={livePrice === null || livePrice === "ERROR"}
                  className="bg-red-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  SELL
                </button>
                <button
                  onClick={handleBuyStock}
                  disabled={livePrice === null || livePrice === "ERROR"}
                  className="bg-green-600 text-white px-8 py-2 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🛒 BUY {activeSymbol}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
