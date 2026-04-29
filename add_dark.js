const fs = require('fs');
const path = 'c:\\Project\\tradeverse-frontend\\src\\pages\\Dashboard.jsx';
let code = fs.readFileSync(path, 'utf8');

// Icons - Safely inject Moon and Sun into the lucide-react import
code = code.replace(/import \{([^}]+)\} from "lucide-react";/, (match, p1) => {
    if (!p1.includes("Moon")) {
        return `import {${p1}, Moon, Sun} from "lucide-react";`;
    }
    return match;
});

// State
if (!code.includes('isDarkMode')) {
    code = code.replace(
      'const [livePrice, setLivePrice] = useState(null);',
      'const [livePrice, setLivePrice] = useState(null);\n  const [isDarkMode, setIsDarkMode] = useState(true);'
    );
}

// Global styling sweeps (Ensure we don't double up via duplicate parsing)
code = code.replaceAll('dark:bg-gray-800', '');
code = code.replaceAll('dark:border-gray-700', '');
code = code.replaceAll('dark:text-gray-100', '');
code = code.replaceAll('dark:text-gray-300', '');
code = code.replaceAll('dark:text-gray-400', '');

code = code.replaceAll('bg-white', 'bg-white dark:bg-gray-800');
code = code.replaceAll('border-gray-100', 'border-gray-100 dark:border-gray-700');
code = code.replaceAll('border-gray-200', 'border-gray-200 dark:border-gray-700');
code = code.replaceAll('bg-gray-50', 'bg-gray-50 dark:bg-gray-800');
code = code.replaceAll('hover:bg-gray-50 ', 'hover:bg-gray-50 '); // Prevent double spaces
code = code.replaceAll('hover:bg-gray-50', 'hover:bg-gray-50 dark:hover:bg-gray-700');
code = code.replaceAll('text-gray-800', 'text-gray-800 dark:text-gray-100');
code = code.replaceAll('text-gray-700', 'text-gray-700 dark:text-gray-300');
code = code.replaceAll('text-gray-600', 'text-gray-600 dark:text-gray-400');
code = code.replaceAll('text-gray-500', 'text-gray-500 dark:text-gray-400');
code = code.replaceAll('bg-green-50', 'bg-green-50 dark:bg-green-900/30');
code = code.replaceAll('border-green-200', 'border-green-200 dark:border-green-800/50');
code = code.replaceAll('bg-gray-900 dark:bg-gray-800', 'bg-gray-900'); // Revert the specific bot panel

// Root div
const rootTarget = '<div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex flex-col relative overflow-hidden">';
const rootInject = '<div className={`min-h-screen flex flex-col relative overflow-hidden ${isDarkMode ? "dark bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"}`}>';

if (code.includes(rootTarget)) {
    code = code.replace(rootTarget, rootInject);
} else {
    // try exact original if script is rerun
    code = code.replace('<div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden">', rootInject);
}

// Nav Bar Toggle (Using a robust replace chunk)
const navToggleTarget = `<button
          onClick={handleLogout}`;
const navToggleInject = `<button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="flex items-center justify-center p-2 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors mr-4 focus:outline-none"
        >
          {isDarkMode ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
        </button>
        <button
          onClick={handleLogout}`;
          
if (!code.includes('<Sun className=')) {
    code = code.replace(navToggleTarget, navToggleInject);
}

fs.writeFileSync(path, code);
console.log("Dark Mode Injected via JS compiler.");
