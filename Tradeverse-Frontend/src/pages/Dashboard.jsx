import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  TrendingUp,
  Activity,
  Server,
  Settings,
  Zap,
} from "lucide-react";
import axios from "axios"; // Added Axios to talk to Python!
import TradingChart from "../components/TradingChart";

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

  const handleLogout = () => {
    localStorage.removeItem("tradeverse_token");
    navigate("/");
  };

  // --- THE NEW DYNAMIC EXECUTION FUNCTION ---
  const handleRunAlgorithm = async () => {
    setLogs((prev) => [...prev, `> Initiating sequence for TSLA...`]);
    setLogs((prev) => [
      ...prev,
      `> Weights: Sentiment(${sentimentWeight}), RSI(${rsiWeight}), MA(${maWeight})`,
    ]);

    try {
      const response = await axios.post("http://localhost:8001/api/predict", {
        symbol: "TSLA",
        weights: {
          sentiment: sentimentWeight,
          rsi: rsiWeight,
          ma: maWeight,
        },
      });

      const signal = response.data.signal;
      const confidence = response.data.confidence;

      setLogs((prev) => [...prev, `> AI Analysis Complete.`]);
      setLogs((prev) => [
        ...prev,
        `> SIGNAL: ${signal} (Confidence: ${confidence}%)`,
      ]);
    } catch (error) {
      setLogs((prev) => [...prev, `> ERROR: Connection to AI Engine failed.`]);
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* --- TOP NAVIGATION BAR --- */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-500" />
          <h1 className="text-xl font-bold text-gray-800">Tradeverse AI</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-500 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Disconnect
        </button>
      </nav>

      {/* --- MAIN DASHBOARD CONTENT --- */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <h2 className="font-semibold">Live Market Status</h2>
            </div>
            <p className="text-2xl font-bold text-gray-800">Tracking TSLA...</p>
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

        {/* --- INTERACTIVE CONTROL PANEL --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left Side: The Sliders */}
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

          {/* Right Side: THE DYNAMIC Execution Log */}
          <div className="bg-gray-900 p-6 rounded-xl shadow-inner col-span-1 lg:col-span-2 flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-4">
              <Server className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-bold text-gray-100">
                Live Execution Log
              </h2>
            </div>

            {/* THE NEW DYNAMIC CODE IS RIGHT HERE */}
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
        </div>

        {/* --- THE TRADINGVIEW CHART BOX --- */}
        <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm h-[500px] w-full overflow-hidden">
          <TradingChart />
        </div>
      </main>
    </div>
  );
}
