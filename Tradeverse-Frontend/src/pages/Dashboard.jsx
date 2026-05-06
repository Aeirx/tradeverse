import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, TrendingUp, Activity, Server, Menu, Moon, Sun } from "lucide-react";

import { apiClient } from "../api/client";
import { useAuth } from "../context/useAuth";
import { useExecutionLog } from "../hooks/useExecutionLog";
import { useWallet } from "../hooks/useWallet";
import { useLivePrices } from "../hooks/useLivePrices";
import { useAiHealth } from "../hooks/useAiHealth";
import { useAlgoExecution } from "../hooks/useAlgoExecution";
import { useBot } from "../hooks/useBot";

import MarketSidebar from "../components/MarketSidebar";
import AlgoWeightControls from "../components/AlgoWeightControls";
import HoldingsTable from "../components/HoldingsTable";
import BotControlPanel from "../components/BotControlPanel";
import ExecutionLog from "../components/ExecutionLog";
import TradingPanel from "../components/TradingPanel";

export default function Dashboard() {
  const navigate = useNavigate();
  const { markUnauthenticated } = useAuth();

  // --- UI state ---
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("TSLA");
  const [searchInput, setSearchInput] = useState("");

  // --- Algorithm weights ---
  const [sentimentWeight, setSentimentWeight] = useState(0.5);
  const [rsiWeight, setRsiWeight] = useState(0.3);
  const [maWeight, setMaWeight] = useState(0.2);
  const weights = useMemo(
    () => ({ sentiment: sentimentWeight, rsi: rsiWeight, ma: maWeight }),
    [sentimentWeight, rsiWeight, maWeight]
  );

  // --- Manual trade quantity ---
  const [tradeQuantity, setTradeQuantity] = useState(1);

  // --- Bot config ---
  const [isBotActive, setIsBotActive] = useState(false);
  const [botTargets, setBotTargets] = useState(["TSLA"]);
  const [stopLoss, setStopLoss] = useState(5);
  const [takeProfit, setTakeProfit] = useState(15);
  const [maxCapital, setMaxCapital] = useState(1000);

  // --- Hook composition ---
  const { logs, addLog } = useExecutionLog();
  const { balance, portfolio, refresh: refreshWallet } = useWallet();
  const aiHealth = useAiHealth();

  // Live prices for: active symbol + every holding + every bot target
  const symbolSet = useMemo(() => {
    const set = new Set();
    if (activeSymbol) set.add(activeSymbol);
    for (const h of portfolio || []) if (h.stockSymbol) set.add(h.stockSymbol);
    for (const t of botTargets || []) set.add(t);
    return Array.from(set);
  }, [activeSymbol, portfolio, botTargets]);
  const { prices: livePrices } = useLivePrices(symbolSet);

  const { buy, sell, runAlgorithm, lastSignal, isRunning: isAlgoRunning } = useAlgoExecution({
    activeSymbol,
    weights,
    tradeQuantity,
    addLog,
    refreshWallet,
  });

  useBot({
    isActive: isBotActive,
    targets: botTargets,
    weights,
    maxCapital,
    stopLossPct: stopLoss,
    takeProfitPct: takeProfit,
    portfolio,
    livePrices,
    addLog,
    refreshWallet,
  });

  const toggleBotTarget = (sym) => {
    setBotTargets((prev) => (prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]));
    setActiveSymbol(sym);
  };

  const handleLogout = async () => {
    try {
      await apiClient.post("/api/v1/users/logout");
    } finally {
      markUnauthenticated();
      navigate("/");
    }
  };

  const aggregateValue = useMemo(
    () =>
      (portfolio || []).reduce((total, stock) => {
        const lp = livePrices[stock.stockSymbol];
        if (lp && stock.quantity) return total + Number(lp) * Number(stock.quantity);
        return total;
      }, 0),
    [portfolio, livePrices]
  );

  // --- Status card values (real state, not hardcoded — #26) ---
  const aiStatusLabel =
    aiHealth.status === "online" ? "Connected" : aiHealth.status === "checking" ? "Checking..." : "Offline";
  const currentSignalLabel = isAlgoRunning
    ? "Asking AI..."
    : lastSignal
      ? `${lastSignal.symbol} ${lastSignal.signal} (${lastSignal.confidence}%)`
      : "Awaiting execution...";

  const statusCards = [
    {
      icon: <Activity className="h-5 w-5 text-blue-500" />,
      label: "Live Market Status",
      value: `Tracking ${activeSymbol}...`,
    },
    {
      icon: <Server className={`h-5 w-5 ${aiHealth.status === "online" ? "text-green-500" : "text-red-500"}`} />,
      label: "Analysis Engine Status",
      value: aiStatusLabel,
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-gray-400" />,
      label: "Current Signal",
      value: currentSignalLabel,
    },
  ];

  const livePrice = livePrices[activeSymbol] ?? null;

  return (
    <div
      className={`min-h-screen flex flex-col relative overflow-hidden transition-colors duration-300 ${
        isDarkMode ? "dark bg-slate-950 text-gray-100" : "bg-gray-50 text-gray-800"
      }`}
    >
      <MarketSidebar
        isDarkMode={isDarkMode}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeSymbol={activeSymbol}
        setActiveSymbol={setActiveSymbol}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
      />

      <nav
        className={`px-6 py-4 flex flex-wrap justify-between items-center z-10 gap-y-4 border-b ${
          isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`p-2 -ml-2 rounded-lg transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:text-gray-100 hover:bg-slate-700"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className={`flex items-center gap-2 border-l pl-4 ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}>
            <TrendingUp className="h-6 w-6 text-green-500" />
            <h1 className="text-xl font-bold">Tradeverse AI</h1>
          </div>
        </div>

        <div
          className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-lg border shadow-sm ml-4 ${
            isDarkMode ? "bg-green-900/30 border-green-800/50" : "bg-green-50 border-green-200"
          }`}
        >
          <span className="text-sm font-semibold text-green-600 uppercase tracking-wider">Buying Power</span>
          <span className={`font-bold text-lg ${isDarkMode ? "text-green-400" : "text-green-800"}`}>
            {balance !== null ? `$${Number(balance).toLocaleString()}` : "Loading..."}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode((prev) => !prev)}
            className={`flex items-center justify-center p-2 rounded-full border transition-colors focus:outline-none ${
              isDarkMode
                ? "bg-slate-700 border-slate-600 text-yellow-400 hover:bg-slate-600"
                : "bg-gray-100 border-gray-200 text-indigo-500 hover:bg-gray-200"
            }`}
          >
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-red-500 ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <LogOut className="h-4 w-4" /> Disconnect
          </button>
        </div>
      </nav>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {statusCards.map((card, i) => (
            <div
              key={i}
              className={`p-6 rounded-xl border shadow-sm ${
                isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"
              }`}
            >
              <div className={`flex items-center gap-3 mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {card.icon}
                <h2 className="font-semibold">{card.label}</h2>
              </div>
              <p className={`text-2xl font-bold ${isDarkMode ? "text-gray-100" : "text-gray-800"}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Surface regime override + effective weights (#13) */}
        {lastSignal?.effectiveWeights && (
          <div
            className={`p-3 mb-6 rounded-lg text-xs font-mono border ${
              isDarkMode ? "bg-slate-900 border-slate-700 text-gray-300" : "bg-white border-gray-200 text-gray-700"
            }`}
          >
            <strong>Last AI run:</strong> regime <span className="text-blue-500">{lastSignal.regime}</span>{" "}
            • effective weights → Sentiment {lastSignal.effectiveWeights.sentiment} • MA {lastSignal.effectiveWeights.ma}{" "}
            • RSI {lastSignal.effectiveWeights.rsi} • risk {lastSignal.riskPct}%{" "}
            {lastSignal.elapsedMs != null && (
              <span className="opacity-60">• {(lastSignal.elapsedMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <AlgoWeightControls
            isDarkMode={isDarkMode}
            sentimentWeight={sentimentWeight}
            setSentimentWeight={setSentimentWeight}
            rsiWeight={rsiWeight}
            setRsiWeight={setRsiWeight}
            maWeight={maWeight}
            setMaWeight={setMaWeight}
            onExecute={runAlgorithm}
            isRunning={isAlgoRunning}
          />
          <HoldingsTable
            isDarkMode={isDarkMode}
            portfolio={portfolio}
            portfolioLivePrices={livePrices}
            aggregateValue={aggregateValue}
          />
        </div>

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

        <ExecutionLog logs={logs} />

        <TradingPanel
          isDarkMode={isDarkMode}
          activeSymbol={activeSymbol}
          livePrice={livePrice}
          tradeQuantity={tradeQuantity}
          setTradeQuantity={setTradeQuantity}
          onBuy={buy}
          onSell={sell}
        />
      </main>
    </div>
  );
}
