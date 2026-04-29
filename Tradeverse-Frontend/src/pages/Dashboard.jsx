import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, TrendingUp, Activity, Server, Menu, Moon, Sun } from "lucide-react";
import axios from "axios";

// --- EXTRACTED COMPONENTS ---
import MarketSidebar from "../components/MarketSidebar";
import AlgoWeightControls from "../components/AlgoWeightControls";
import HoldingsTable from "../components/HoldingsTable";
import BotControlPanel from "../components/BotControlPanel";
import ExecutionLog from "../components/ExecutionLog";
import TradingPanel from "../components/TradingPanel";

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
  const portfolioRef = useRef(portfolio);

  // Keep portfolioRef in sync with portfolio state
  useEffect(() => { portfolioRef.current = portfolio; }, [portfolio]);

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
              const holding = (portfolioRef.current || []).find((s) => s.stockSymbol === symbol);
              if (!holding || holding.quantity <= 0) {
                addLog(`> ⏭️ ${symbol}: SELL signal — no shares held, skipping.`);
              } else {
                const sellQty = holding.quantity;
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
              }
            } else {
              addLog(`> ⏸ ${symbol}: HOLD — signal below confidence threshold.`);
            }
          } catch (err) {
            const status = err?.response?.status;
            const serverMsg = err?.response?.data?.error;
            if (status === 400) {
              addLog(`> 🚧 ${symbol}: ${serverMsg || "Trade rejected by broker."}`);
            } else if (status === 500) {
              addLog(`> 🔥 ${symbol}: Server error — ${serverMsg || "Internal error, try again."}`);
            } else {
              addLog(`> ⚠️ ${symbol}: Network/connection error — ${err.message}`);
            }
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
    // Also switch the active trading panel to show this symbol
    setActiveSymbol(sym);
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
      setBalance(response.data.data.walletBalance);
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

      {/* SIDEBAR */}
      <MarketSidebar
        isDarkMode={isDarkMode}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeSymbol={activeSymbol}
        setActiveSymbol={setActiveSymbol}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
      />

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

        {/* ALGO WEIGHTS + HOLDINGS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <AlgoWeightControls
            isDarkMode={isDarkMode}
            sentimentWeight={sentimentWeight}
            setSentimentWeight={setSentimentWeight}
            rsiWeight={rsiWeight}
            setRsiWeight={setRsiWeight}
            maWeight={maWeight}
            setMaWeight={setMaWeight}
            onExecute={handleRunAlgorithm}
          />
          <HoldingsTable
            isDarkMode={isDarkMode}
            portfolio={portfolio}
            portfolioLivePrices={portfolioLivePrices}
            aggregateValue={aggregateValue}
          />
        </div>

        {/* AUTO-PILOT BOT */}
        <BotControlPanel
          isBotActive={isBotActive}
          setIsBotActive={setIsBotActive}
          botTargets={botTargets}
          toggleBotTarget={toggleBotTarget}
          maxCapital={maxCapital}
          setMaxCapital={setMaxCapital}
          stopLoss={stopLoss}
          setStopLoss={setStopLoss}
          takeProfit={takeProfit}
          setTakeProfit={setTakeProfit}
        />

        {/* EXECUTION LOG */}
        <ExecutionLog logs={logs} />

        {/* TRADING CHART + BUY/SELL */}
        <TradingPanel
          isDarkMode={isDarkMode}
          activeSymbol={activeSymbol}
          livePrice={livePrice}
          tradeQuantity={tradeQuantity}
          setTradeQuantity={setTradeQuantity}
          onBuy={handleBuyStock}
          onSell={handleSellStock}
        />

      </main>
    </div>
  );
}
