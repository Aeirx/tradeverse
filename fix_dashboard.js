 const fs = require('fs');
const dashboardPath = 'c:\\Project\\tradeverse-frontend\\src\\pages\\Dashboard.jsx';
const chartPath = 'c:\\Project\\tradeverse-frontend\\src\\components\\TradingChart.jsx';

let dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

// 1. Fix the top bar toggle (inserting it immediately before the LogOut button)
const logOutRegex = /<\s*button[\s\S]*?onClick=\{handleLogout\}[\s\S]*?<\s*LogOut[\s\S]*?Disconnect\s*<\/\s*button\s*>/;
if (logOutRegex.test(dashboardCode) && !dashboardCode.includes('<Sun className=')) {
    const match = dashboardCode.match(logOutRegex)[0];
    const injection = `        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDarkMode((prev) => !prev)}
            className="flex items-center justify-center p-2 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none"
          >
            {isDarkMode ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-indigo-500" />}
          </button>
${match.replace(/^/gm, '  ')}
        </div>`;
    dashboardCode = dashboardCode.replace(logOutRegex, injection);
}

// 2. Pass isDarkMode to TradingChart
dashboardCode = dashboardCode.replace(/<TradingChart\s+symbol=\{activeSymbol\}\s*\/>/g, '<TradingChart symbol={activeSymbol} isDarkMode={isDarkMode} />');

// 3. Improve the general dark mode aesthetic (User says "theme look off").
// By default, bg-gray-900 with bg-gray-800 is dull. 
// A much more premium "wow" trade dashboard color is deep slate/zinc!
dashboardCode = dashboardCode.replaceAll("bg-gray-900", "bg-slate-950");
dashboardCode = dashboardCode.replaceAll("bg-gray-800", "bg-slate-900");

fs.writeFileSync(dashboardPath, dashboardCode);

// 4. Fix TradingChart.jsx
let chartCode = fs.readFileSync(chartPath, 'utf8');

chartCode = chartCode.replace(
    'export default function TradingChart({ symbol }) {',
    'export default function TradingChart({ symbol, isDarkMode }) {'
);

chartCode = chartCode.replace(
    /"theme":\s*"light"/g,
    `"theme": \${isDarkMode ? '"dark"' : '"light"'}`
);

// We must remove the static white background so it inherits correctly in both modes, or set it explicitly
chartCode = chartCode.replace(
    /"backgroundColor":\s*"rgba\(255,\s*255,\s*255,\s*1\)"/g,
    `"backgroundColor": \${isDarkMode ? '"rgba(2, 6, 23, 1)"' : '"rgba(255, 255, 255, 1)"'}`
);

// Add isDarkMode to dependency array
chartCode = chartCode.replace(
    '}, [symbol]);',
    '}, [symbol, isDarkMode]);'
);

fs.writeFileSync(chartPath, chartCode);
console.log("Fixes applied successfully.");
