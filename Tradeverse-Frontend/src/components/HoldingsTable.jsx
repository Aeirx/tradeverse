export default function HoldingsTable({
  isDarkMode,
  portfolio,
  portfolioLivePrices,
  aggregateValue,
}) {
  return (
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
  );
}
