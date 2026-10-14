import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { loadRuntime } from "./config";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="boot">
    <h1>WAKE</h1>
    <p role="status">Opening the cemetery…</p>
  </main>,
);
loadRuntime()
  .then((runtime) =>
    root.render(
      <WagmiProvider config={runtime.config}>
        <QueryClientProvider client={new QueryClient()}>
          <App runtime={runtime} />
        </QueryClientProvider>
      </WagmiProvider>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="boot">
        <h1>The gates are closed.</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "Unable to load the deployment."}
        </p>
        <button onClick={() => location.reload()}>Reload the cemetery</button>
      </main>,
    ),
  );
