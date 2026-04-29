const fs = require('fs');

let content = fs.readFileSync('c:\\Project\\tradeverse-frontend\\src\\pages\\Dashboard.jsx', 'utf8');

// 1. Add Bot Icon
content = content.replace(
  'Search,\n} from "lucide-react";',
  'Search,\n  Bot,\n} from "lucide-react";'
);

// 2. Add State and Logic
const logicInjection = `
  // --- AUTONOMOUS BOT STATE ---
  const [isBotActive, setIsBotActive] = useState(false);
  const [botCapital, setBotCapital] = useState(1000);
  const [botStopLoss, setBotStopLoss] = useState(5);
  const [botPnl, setBotPnl] = useState(0);
  const [botWorkingSymbol, setBotWorkingSymbol] = useState(null);
  const [botScanIndex, setBotScanIndex] = useState(0);
  const [botStatusMessage, setBotStatusMessage] = useState("IDLE");
  const [botTick, setBotTick] = useState(0);

  // --- BOT TIMER ---
  useEffect(() => {
    if (!isBotActive) {
      setBotStatusMessage("STANDBY");
      return;
    }
    const t = setTimeout(() => setBotTick((prev) => prev + 1), 6000);
    return () => clearTimeout(t);
  }, [isBotActive, botTick]);

  // --- BOT EXECUTION LOOP ---
  useEffect(() => {
    if (isBotActive) {
      botExecuteCycle();
    }
  }, [botTick]);

  const botExecuteCycle = async () => {
    const botHolding = portfolio.find((s) => s.stockSymbol === botWorkingSymbol);

    if (botWorkingSymbol && !botHolding) {
      setBotWorkingSymbol(null);
      setLogs((prev) => [...prev, \`> 🤖 Bot target clear. Resuming market scan...\`]);
      return;
    }

    if (!botWorkingSymbol) {
      // SCANNING MODE
      const nextIndex = (botScanIndex + 1) % POPULAR_STOCKS.length;
      const nextSymbol = POPULAR_STOCKS[nextIndex].symbol;
      setBotScanIndex(nextIndex);
      setActiveSymbol(nextSymbol);
      setBotStatusMessage(\`SCANNING \${nextSymbol}...\`);
      setLogs((prev) => [...prev, \`> 🤖 Bot targeting \${nextSymbol}... analyzes market data.\`]);

      try {
        const response = await axios.post("http://localhost:8001/api/predict", {
          symbol: nextSymbol,
          weights: { sentiment: 0.7, rsi: 0.2, ma: 0.1 },
        });
        const signal = response.data.signal.toUpperCase();

        if (signal.includes("BUY")) {
          setLogs((prev) => [...prev, \`> 🤖 MAX PROFIT TARGET FOUND: \${nextSymbol}!\`]);
          const token = localStorage.getItem("tradeverse_token");
          const pRes = await axios.get(\`http://localhost:8000/api/v1/trades/price/\${nextSymbol}\`, { headers: { Authorization: \`Bearer \${token}\` } });
          const exactPrice = pRes.data.price;
          const sharesToBuy = Math.floor(botCapital / exactPrice);

          if (sharesToBuy > 0 && balance >= botCapital) {
            setLogs((prev) => [...prev, \`> 🤖 BOT EXECUTING FAST-BUY: \${sharesToBuy} shares @ $\${exactPrice}\`]);
            await axios.post("http://localhost:8000/api/v1/trades/buy", { symbol: nextSymbol, quantity: sharesToBuy }, { headers: { Authorization: \`Bearer \${token}\` } });
            setBotWorkingSymbol(nextSymbol);
            setBotStatusMessage(\`MANAGING POSITION: \${nextSymbol}\`);
            const rRes = await axios.get("http://localhost:8000/api/v1/users/balance", { headers: { Authorization: \`Bearer \${token}\` } });
            setBalance(rRes.data.walletBalance);
            setPortfolio(rRes.data.portfolio);
          } else {
            console.log("Bot hit buying limit");
          }
        }
      } catch (e) {
        console.error("Bot scan error", e);
      }
    } else {
      // MANAGING MODE
      if (botHolding) {
        const token = localStorage.getItem("tradeverse_token");
        try {
          const pRes = await axios.get(\`http://localhost:8000/api/v1/trades/price/\${botWorkingSymbol}\`, { headers: { Authorization: \`Bearer \${token}\` } });
          const exactPrice = pRes.data.price;
          const avgPrice = botHolding.averagePrice;
          const pnlPercent = ((exactPrice - avgPrice) / avgPrice) * 100;
          setBotPnl(pnlPercent);

          if (pnlPercent <= -botStopLoss) {
            setLogs((prev) => [...prev, \`> 🚨 BOT STOP LOSS HIT (\${pnlPercent.toFixed(2)}%). LIQUIDATING ALL \${botWorkingSymbol}!\`]);
            await axios.post("http://localhost:8000/api/v1/trades/sell", { symbol: botWorkingSymbol, quantity: botHolding.quantity }, { headers: { Authorization: \`Bearer \${token}\` } });
            setBotWorkingSymbol(null);
            setBotStatusMessage("COOLING DOWN");
          } else {
            const response = await axios.post("http://localhost:8001/api/predict", {
              symbol: botWorkingSymbol,
              weights: { sentiment: 0.7, rsi: 0.2, ma: 0.1 },
            });
            const signal = response.data.signal.toUpperCase();
            if (signal.includes("SELL")) {
              setLogs((prev) => [...prev, \`> 🤖 REVERSAL DETECTED. BOT EXECUTING STRATEGIC EXIT FOR \${botWorkingSymbol}.\`]);
              await axios.post("http://localhost:8000/api/v1/trades/sell", { symbol: botWorkingSymbol, quantity: botHolding.quantity }, { headers: { Authorization: \`Bearer \${token}\` } });
              setBotWorkingSymbol(null);
            } else {
              setLogs((prev) => [...prev, \`> 🤖 Position secure. Holding \${botWorkingSymbol} (PnL: \${pnlPercent.toFixed(2)}%).\`]);
            }
          }
          const rRes = await axios.get("http://localhost:8000/api/v1/users/balance", { headers: { Authorization: \`Bearer \${token}\` } });
          setBalance(rRes.data.walletBalance);
          setPortfolio(rRes.data.portfolio);
        } catch (e) {
          console.error("Bot management error", e);
        }
      }
    }
  };
`;

content = content.replace(
  '// --- FETCH BALANCE ON LOAD ---',
  logicInjection + '\n\n  // --- FETCH BALANCE ON LOAD ---'
);

// 3. Inject the UI
const uiStart = \`<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="flex flex-col gap-6 col-span-1">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">\`;

const uiOriginalReplace = \`<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm col-span-1">\`;

content = content.replace(uiOriginalReplace, uiStart);

const uiInjection = \`
            </div>

            {/* AUTONOMOUS BOT PANEL */}
            <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 p-6 rounded-xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
              
              {/* Bot Glow Effects */}
              {isBotActive && (
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl blur opacity-30 animate-pulse"></div>
              )}
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Bot className={\`h-6 w-6 \${isBotActive ? 'text-cyan-400 animate-pulse' : 'text-gray-400'}\`} /> 
                    Auto-Pilot Bot
                  </h2>
                  
                  {/* ON/OFF TOGGLE */}
                  <button 
                    onClick={() => setIsBotActive(!isBotActive)}
                    className={\`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none \${isBotActive ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.6)]' : 'bg-gray-700'}\`}
                  >
                    <span 
                      className={\`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 \${isBotActive ? 'translate-x-8' : 'translate-x-1'}\`}
                    />
                  </button>
                </div>

                <div className="space-y-5">
                  {/* Status Screen */}
                  <div className="bg-black/40 border border-indigo-500/20 rounded-lg p-3 backdrop-blur-sm">
                    <p className="text-xs text-indigo-300 uppercase tracking-wider mb-1 font-semibold">Terminal Status</p>
                    <p className={\`font-mono text-sm \${isBotActive ? 'text-green-400' : 'text-gray-400'}\`}>
                      [{botStatusMessage}] 
                      {isBotActive && <span className="animate-blink">_</span>}
                    </p>
                    {botWorkingSymbol && (
                      <p className={\`font-mono mt-1 text-sm \${botPnl >= 0 ? 'text-green-400' : 'text-red-400'}\`}>
                        RUN PNL: {botPnl >= 0 ? '+' : ''}{botPnl.toFixed(2)}%
                      </p>
                    )}
                  </div>

                  {/* Settings */}
                  <div className={\`transition-opacity duration-300 \${isBotActive ? 'opacity-50 pointer-events-none' : 'opacity-100'}\`}>
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-indigo-200 mb-1">
                        <label>Max Capital Allocation</label>
                        <span>\${botCapital}</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="10000"
                        step="100"
                        value={botCapital}
                        onChange={(e) => setBotCapital(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs text-indigo-200 mb-1">
                        <label>Hard Stop Loss (%)</label>
                        <span className="text-red-400">{botStopLoss}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={botStopLoss}
                        onChange={(e) => setBotStopLoss(parseFloat(e.target.value))}
                        className="w-full accent-red-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
\`;

const buttonReplaceObj = \`Execute Strategy
            </button>\`;

content = content.replace(buttonReplaceObj, buttonReplaceObj + '\\n          ' + uiInjection);

fs.writeFileSync('c:\\Project\\tradeverse-frontend\\src\\pages\\Dashboard.jsx', content);
console.log('Update Success!');
