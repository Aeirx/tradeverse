import { useState, useEffect, useRef } from "react";
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
  Bot,
  Moon,
  Sun,
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

const ALL_TARGETS = ["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "META", "GOOGL", "AMD", "COIN"];

export default function Dashboard() {
  const navigate = useNavigate();

  // --- UI STATE ---
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("TSLA");
  const [searchInput, setSearchInput] = useState("");

  // --- AI ALGORITHM WEIGHTS ---
  const [sentimentWeight, setSentimentWeight] = useState(0.5);
  const [rsiWeight, setRsiWeight] = useState(0.3);
  const [maWeight, setMaWeight] = useState(0.2);

  // --- EXECUTION LOG ---
  const [logs, setLogs] = useState([
    "> System initialized...",
    "> Secure JWT Token verified.",
    "> Awaiting algorithm execution command...",
  ]);
  const logEndRef = useRef(null);

  // --- WALLET & TRADING STATE ---
  const [balance, setBalance] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [portfolioLivePrices, setPortfolioLivePrices] = useState({});
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [livePrice, setLivePrice] = useState(null);

  // --- AUTO-PILOT BOT STATE ---
  const [isBotActive, setIsBotActive] = useState(false);
  const [botTargets, setBotTargets] = useState(["TSLA"]);
  const [stopLoss, setStopLoss] = useState(5);
  const [takeProfit, setTakeProfit] = useState(15);
  const [maxCapital, setMaxCapital] = useState(1000);
  const botIntervalRef = useRef(null);

  // --- AUTO-SCROLL LOG ---
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg) => setLogs((prev) => [...prev, msg]);

  // --- FETCH BALANCE ON LOAD ---
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const token = localStorage.getItem("tradeverse_token");
        const response = await axios.get("http://localhost:8000/api/v1/users/balance", {
          headers: { Authorization: `Bearer ${token}` },
        });
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
        setLivePrice(null);
        const token = localStorage.getItem("tradeverse_token");
        const response = await axios.get(
          `http://localhost:8000/api/v1/trades/price/${activeSymbol}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setLivePrice(response.data.price);
      } catch (error) {
        console.error("Failed to fetch live price", error);
        setLivePrice("ERROR");
      }
    };
    if (activeSymbol) fetchLivePrice();
  }, [activeSymbol]);

  // --- FETCH PORTFOLIO LIVE PRICES ---
  useEffect(() => {
    const fetchPortfolioPrices = async () => {
      if (!portfolio || portfolio.length === 0) return;
      const token = localStorage.getItem("tradeverse_token");
      try {
        const promises = portfolio.map(async (stock) => {
          if (!stock.stockSymbol) return null;
          const res = await axios.get(
            `http://localhost:8000/api/v1/trades/price/${stock.stockSymbol}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return { symbol: stock.stockSymbol, price: res.data.price };
        });
        const results = await Promise.all(promises);
        const newPrices = {};
        results.forEach((item) => {
          if (item) newPrices[item.symbol] = item.price;
        });
        setPortfolioLivePrices(newPrices);
      } catch (e) {
        console.error("Failed fetching portfolio live prices", e);
      }
    };
    fetchPortfolioPrices();
  }, [portfolio]);

  // --- AUTO-PILOT BOT LOOP ---
  useEffect(() => {
    if (isBotActive) {
      setTimeout(() => addLog("> 🤖 AUTO-PILOT ACTIVATED. Scanning targets..."), 0);
      const runBotCycle = async () => {
        const targets = botTargets.length > 0 ? botTargets : ALL_TARGETS;
        for (const symbol of targets) {
          addLog(`> 🔍 Scanning ${symbol}...`);
          try {
            const token = localStorage.getItem("tradeverse_token");
            const aiRes = await axios.post("http://localhost:8001/api/predict", {
              symbol,
              weights: { sentiment: sentimentWeight, rsi: rsiWeight, ma: maWeight },
            });
            const signal = aiRes.data.signal?.toUpperCase() || "";
            const confidence = aiRes.data.confidence || 0;
            addLog(`> 📊 ${symbol}: ${signal} (${confidence.toFixed(1)}% confidence)`);

            // FIX #5: Fetch live price first, calculate quantity from maxCapital
            if (signal.includes("BUY") && confidence > 65) {
              const priceRes = await axios.get(
                `http://localhost:8000/api/v1/trades/price/${symbol}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const lp = priceRes.data.price;
              const qty = Math.max(1, Math.floor(maxCapital / lp));
              addLog(`> 🟢 BOT EXECUTING BUY: ${qty} share(s) of ${symbol} @ $${Number(lp).toFixed(2)} (capital: $${maxCapital})`);
              await axios.post(
                "http://localhost:8000/api/v1/trades/buy",
                { symbol, quantity: qty },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              addLog(`> ✅ BUY ORDER FILLED: ${qty} share(s) of ${symbol}`);
              const refresh = await axios.get("http://localhost:8000/api/v1/users/balance", {
                headers: { Authorization: `Bearer ${token}` },
              });
              setBalance(refresh.data.walletBalance);
              setPortfolio(refresh.data.portfolio);
            } else if (signal.includes("SELL") && confidence > 65) {
              // For SELL: find how many shares we own, sell all of them
              const holding = (portfolio || []).find((s) => s.stockSymbol === symbol);
              const sellQty = holding ? Math.max(1, holding.quantity) : 1;
              addLog(`> 🔴 BOT EXECUTING SELL: ${sellQty} share(s) of ${symbol}`);
              await axios.post(
                "http://localhost:8000/api/v1/trades/sell",
                { symbol, quantity: sellQty },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              addLog(`> ✅ SELL ORDER FILLED: ${sellQty} share(s) of ${symbol}`);
              const refresh = await axios.get("http://localhost:8000/api/v1/users/balance", {
                headers: { Authorization: `Bearer ${token}` },
              });
              setBalance(refresh.data.walletBalance);
              setPortfolio(refresh.data.portfolio);
            } else {
              addLog(`> ⏸ ${symbol}: HOLD — signal below confidence threshold.`);
            }
          } catch (err) {
            addLog(`> ⚠️ Error scanning ${symbol}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      };
      runBotCycle();
      botIntervalRef.current = setInterval(runBotCycle, 60000);
    } else {
      if (botIntervalRef.current) {
        clearInterval(botIntervalRef.current);
        botIntervalRef.current = null;
        addLog("> ⏹ AUTO-PILOT DEACTIVATED.");
      }
    }
    return () => {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBotActive, botTargets]);

  const toggleBotTarget = (sym) => {
    setBotTargets((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  // --- LOGOUT ---
  const handleLogout = () => {
    localStorage.removeItem("tradeverse_token");
    navigate("/");
  };

  // --- MANUAL ALGORITHM EXECUTION ---
  const handleRunAlgorithm = async () => {
    addLog(`> Initiating sequence for ${activeSymbol}...`);
    addLog(`> Weights: Sentiment(${sentimentWeight}), RSI(${rsiWeight}), MA(${maWeight})`);
    try {
      const response = await axios.post("http://localhost:8001/api/predict", {
        symbol: activeSymbol,
        weights: { sentiment: sentimentWeight, rsi: rsiWeight, ma: maWeight },
      });
      const signal = response.data.signal.toUpperCase();
      const confidence = response.data.confidence;
      addLog(`> AI Analysis Complete.`);
      addLog(`> SIGNAL: ${signal} (Confidence: ${confidence}%)`);

      if (signal.includes("BUY")) {
        addLog(`> 🤖 BOT OVERRIDE: Automatically executing BUY order...`);
        await handleBuyStock();
      } else if (signal.includes("SELL")) {
        addLog(`> 🤖 BOT OVERRIDE: Automatically executing SELL order...`);
        await handleSellStock();
      } else {
        addLog(`> 🤖 BOT STANDING BY: No favorable trade setup found.`);
      }
    } catch (error) {
      addLog(`> ERROR: Connection to AI Engine failed.`);
      console.error(error);
    }
  };

  // --- BUY ---
  const handleBuyStock = async () => {
    try {
      addLog(`> Executing BUY order for ${tradeQuantity} shares of ${activeSymbol}...`);
      const token = localStorage.getItem("tradeverse_token");
      const response = await axios.post(
        "http://localhost:8000/api/v1/trades/buy",
        { symbol: activeSymbol, quantity: tradeQuantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBalance(response.data.newBalance);
      addLog(`> SUCCESS: ${response.data.message}`);
      const refresh = await axios.get("http://localhost:8000/api/v1/users/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPortfolio(refresh.data.portfolio);
    } catch (error) {
      addLog(`> ORDER REJECTED: ${error.response?.data?.error || "Network error."}`);
    }
  };

  // --- SELL ---
  const handleSellStock = async () => {
    try {
      addLog(`> Executing SELL order for ${tradeQuantity} shares of ${activeSymbol}...`);
      const token = localStorage.getItem("tradeverse_token");
      const response = await axios.post(
        "http://localhost:8000/api/v1/trades/sell",
        { symbol: activeSymbol, quantity: tradeQuantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      addLog(`> SUCCESS: ${response.data.message}`);
      const refresh = await axios.get("http://localhost:8000/api/v1/users/balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBalance(refresh.data.walletBalance);
      setPortfolio(refresh.data.portfolio);
    } catch (error) {
      addLog(`> ORDER REJECTED: ${error.response?.data?.error || "Network error."}`);
    }
  };

  // --- PORTFOLIO CALCULATIONS ---
  const aggregateValue = portfolio.reduce((total, stock) => {
    const lp = portfolioLivePrices[stock.stockSymbol];
    if (lp && stock.quantity) return total + Number(lp) * Number(stock.quantity);
    return total;
  }, 0);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className={`min-h-screen flex flex-col relative overflow-hidden transition-colors duration-300 ${isDarkMode ? "dark bg-slate-950 text-gray-100" : "bg-gray-50 text-gray-800"}`}>

      {/* SIDEBAR OVERLAY */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SLIDE-OUT SIDEBAR */}
      <div className={`fixed top-0 left-0 h-full w-80 z-50 flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} ${isDarkMode ? "bg-slate-900 text-gray-100" : "bg-white text-gray-800"}`}>
        <div className={`p-5 flex justify-between items-center border-b ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-500" />
            <span className="font-bold text-lg">Market Explorer</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`p-4 border-b ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
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
                className={`w-full border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 uppercase transition-all ${isDarkMode ? "bg-slate-800 border-slate-600 text-gray-100 placeholder:text-slate-400" : "bg-white border-gray-300 text-gray-800"}`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
              Go
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Popular Assets</h3>
          {POPULAR_STOCKS.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => { setActiveSymbol(stock.symbol); setSearchInput(""); setIsSidebarOpen(false); }}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                activeSymbol === stock.symbol
                  ? "bg-blue-600 text-white"
                  : isDarkMode ? "hover:bg-slate-800 text-gray-300" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <div className="flex flex-col items-start">
                <span className="font-bold">{stock.symbol}</span>
                <span className={`text-xs ${activeSymbol === stock.symbol ? "text-blue-100" : "text-gray-400"}`}>{stock.name}</span>
              </div>
              {activeSymbol === stock.symbol && <div className="h-2 w-2 rounded-full bg-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* TOP NAV */}
      <nav className={`px-6 py-4 flex flex-wrap justify-between items-center z-10 gap-y-4 border-b ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"}`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`p-2 -ml-2 rounded-lg transition-colors ${isDarkMode ? "text-gray-400 hover:text-gray-100 hover:bg-slate-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className={`flex items-center gap-2 border-l pl-4 ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
            <TrendingUp className="h-6 w-6 text-green-500" />
            <h1 className="text-xl font-bold">Tradeverse AI</h1>
          </div>
        </div>

        <div className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-lg border shadow-sm ml-4 ${isDarkMode ? "bg-green-900/30 border-green-800/50" : "bg-green-50 border-green-200"}`}>
          <span className="text-sm font-semibold text-green-600 uppercase tracking-wider">Buying Power</span>
          <span className={`font-bold text-lg ${isDarkMode ? "text-green-400" : "text-green-800"}`}>
            {balance !== null ? `$${Number(balance).toLocaleString()}` : "Loading..."}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* DARK MODE TOGGLE */}
          <button
            onClick={() => setIsDarkMode((prev) => !prev)}
            className={`flex items-center justify-center p-2 rounded-full border transition-colors focus:outline-none ${isDarkMode ? "bg-slate-700 border-slate-600 text-yellow-400 hover:bg-slate-600" : "bg-gray-100 border-gray-200 text-indigo-500 hover:bg-gray-200"}`}
          >
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-red-500 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            <LogOut className="h-4 w-4" /> Disconnect
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {/* STATUS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {[
            { icon: <Activity className="h-5 w-5 text-blue-500" />, label: "Live Market Status", value: `Tracking ${activeSymbol}...` },
            { icon: <Server className="h-5 w-5 text-purple-500" />, label: "AI Vector Memory", value: "Connected" },
            { icon: <TrendingUp className="h-5 w-5 text-gray-400" />, label: "Current Signal", value: "Awaiting execution..." },
          ].map((card, i) => (
            <div key={i} className={`p-6 rounded-xl border shadow-sm ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
              <div className={`flex items-center gap-3 mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {card.icon}
                <h2 className="font-semibold">{card.label}</h2>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? "text-gray-100" : "text-gray-800"}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* MAIN GRID: ALGO WEIGHTS + HOLDINGS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* ALGO WEIGHTS */}
          <div className={`p-6 rounded-xl border shadow-sm col-span-1 ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
            <div className={`flex items-center gap-2 mb-6 border-b pb-4 ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
              <Settings className={`h-5 w-5 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`} />
              <h2 className="text-lg font-bold">Algorithm Weights</h2>
            </div>
            <div className="space-y-6">
              {[
                { label: "News Sentiment (Pinecone)", value: sentimentWeight, setter: setSentimentWeight, color: "text-green-500", accent: "accent-green-500" },
                { label: "RSI Technical", value: rsiWeight, setter: setRsiWeight, color: "text-blue-500", accent: "accent-blue-500" },
                { label: "Moving Average", value: maWeight, setter: setMaWeight, color: "text-purple-500", accent: "accent-purple-500" },
              ].map((w) => (
                <div key={w.label}>
                  <div className="flex justify-between text-sm mb-2">
                    <label className={`font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>{w.label}</label>
                    <span className={`font-bold ${w.color}`}>{Math.round(w.value * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={w.value}
                    onChange={(e) => w.setter(parseFloat(e.target.value))}
                    className={`w-full ${w.accent}`} />
                </div>
              ))}
            </div>
            <button
              onClick={handleRunAlgorithm}
              className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <Zap className="h-5 w-5 text-yellow-400" /> Execute Strategy
            </button>
          </div>

          {/* MY HOLDINGS */}
          <div className={`p-6 rounded-xl border shadow-sm col-span-1 lg:col-span-2 ${isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
            <h2 className="font-bold text-xl mb-4">My Holdings</h2>
            {portfolio.length === 0 ? (
              <p className={`italic ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                Your vault is empty. Execute a trade to begin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className={`border-b text-xs uppercase tracking-wider ${isDarkMode ? "border-slate-700 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <th className="pb-3">Asset</th>
                      <th className="pb-3">Shares</th>
                      <th className="pb-3">Total Spent</th>
                      <th className="pb-3">Live Value</th>
                      <th className="pb-3">Net Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.map((stock, index) => {
                      if (!stock.stockSymbol) return null;
                      const shares = Number(stock.quantity || 0);
                      const avgPrice = Number(stock.averagePrice || 0);
                      const totalSpent = shares * avgPrice;
                      const lp = portfolioLivePrices[stock.stockSymbol];
                      const liveValue = lp ? shares * Number(lp) : null;
                      const pnl = liveValue !== null ? liveValue - totalSpent : null;
                      const pnlPct = totalSpent > 0 && pnl !== null ? (pnl / totalSpent) * 100 : null;
                      const isProfitable = pnl !== null && pnl >= 0;

                      return (
                        <tr key={index} className={`border-b transition-colors ${isDarkMode ? "border-slate-800 hover:bg-slate-800" : "border-gray-50 hover:bg-gray-50"}`}>
                          <td className="py-3 font-bold text-blue-500">{stock.stockSymbol}</td>
                          <td className={`py-3 font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>{shares}</td>
                          <td className={`py-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                            ${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-3 font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                            {liveValue !== null
                              ? `$${liveValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-gray-400 text-xs">Loading...</span>}
                          </td>
                          <td className={`py-3 font-bold ${isProfitable ? "text-green-500" : "text-red-500"}`}>
                            {pnl !== null ? (
                              <>
                                {isProfitable ? "+" : ""}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span className="ml-1 text-xs opacity-80">
                                  ({isProfitable ? "+" : ""}{pnlPct.toFixed(2)}%)
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={`border-t-2 ${isDarkMode ? "border-slate-600" : "border-gray-300"}`}>
                      <td colSpan={3} className={`pt-3 font-bold text-xs uppercase tracking-wider ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Aggregate Valuation
                      </td>
                      <td colSpan={2} className="pt-3 font-black text-lg text-indigo-500">
                        ${aggregateValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* AUTO-PILOT BOT */}
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

        {/* EXECUTION LOG */}
        <div className="bg-slate-950 p-6 rounded-xl shadow-inner mb-6 flex flex-col h-64">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-4">
            <Server className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-100">Live Execution Log</h2>
          </div>
          <div className="flex-1 font-mono text-sm text-green-400 overflow-y-auto space-y-1">
            {logs.map((log, index) => (
              <p
                key={index}
                className={
                  log.includes("ERROR") || log.includes("REJECTED")
                    ? "text-red-400"
                    : log.includes("SIGNAL") || log.includes("📊")
                    ? "text-yellow-400 font-bold"
                    : log.includes("✅") || log.includes("SUCCESS")
                    ? "text-green-300"
                    : "text-green-400"
                }
              >
                {log}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* TRADING CHART + BUY/SELL */}
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
