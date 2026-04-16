import { useEffect, useRef } from "react";

export default function TradingChart({ symbol, isDarkMode }) {
  const container = useRef();

  useEffect(() => {
    // 1. Wipe the old chart out completely
    container.current.innerHTML = "";

    // 2. Build the new chart with the requested symbol
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
      {
        "autosize": true,
        "symbol": "NASDAQ:${symbol}",
        "interval": "D",
        "timezone": "Etc/UTC",
        "theme": ${isDarkMode ? '"dark"' : '"light"'},
        "style": "1",
        "locale": "en",
        "enable_publishing": false,
        "backgroundColor": ${isDarkMode ? '"rgba(2, 6, 23, 1)"' : '"rgba(255, 255, 255, 1)"'},
        "gridColor": "rgba(240, 243, 250, 0)",
        "hide_top_toolbar": false,
        "hide_legend": false,
        "save_image": false,
        "container_id": "tradingview_widget_${symbol}"
      }`;
    container.current.appendChild(script);
  }, [symbol, isDarkMode]); // <-- This tells React: "If symbol changes, run this again!"

  return (
    <div
      className="tradingview-widget-container"
      ref={container}
      style={{ height: "100%", width: "100%" }}
    ></div>
  );
}
