import { useRef, useEffect } from "react";
import { Server } from "lucide-react";

export default function ExecutionLog({ logs }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
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
  );
}
