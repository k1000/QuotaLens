export const dashboardPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QuotaLens</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111217; color: #f5f5f7; }
      body { max-width: 960px; margin: 0 auto; padding: 3rem 1.25rem; }
      header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 2rem; }
      h1 { margin: 0; font-size: 2rem; } p { color: #a9abb8; } button { background: #b8f44a; color: #172000; border: 0; border-radius: .5rem; padding: .6rem .9rem; font-weight: 700; cursor: pointer; }
      #providers { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
      .card { border: 1px solid #292c35; border-radius: .75rem; background: #191b22; padding: 1rem; }
      h2 { margin: 0 0 .4rem; font-size: 1.1rem; }
      .status { color: #a9abb8; font-size: .9rem; }
      .connected { color: #b8f44a; }
      .unauthorized, .error { color: #ff8b8b; }
      .unsupported { color: #a9abb8; }
      ul { margin: .75rem 0 0; padding-left: 1.25rem; color: #d4d5db; }
      .warning { color: #ffd27d; font-size: .9rem; } #message { min-height: 1.5rem; }
    </style>
  </head>
  <body>
    <header>
      <div><h1>QuotaLens</h1><p>AI accounts, quotas, and renewals.</p></div>
      <button id="refresh">Refresh</button>
    </header>
    <p id="message">Loading live Pi provider configuration…</p>
    <main id="providers"></main>
    <script type="module">
      const providersElement = document.querySelector("#providers");
      const messageElement = document.querySelector("#message");
      const refreshButton = document.querySelector("#refresh");

      function text(element, value) { element.textContent = value; return element; }
      function append(parent, tag, value, className) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        text(element, value);
        parent.append(element);
        return element;
      }

      function formatQuotaValue(quota, value) {
        return value + (quota.unit === "percent" ? "%" : " " + quota.unit);
      }

      function formatQuota(quota) {
        const pieces = [quota.label];
        if (typeof quota.used === "number") pieces.push("used " + formatQuotaValue(quota, quota.used));
        if (typeof quota.remaining === "number") pieces.push("remaining " + formatQuotaValue(quota, quota.remaining));
        if (typeof quota.limit === "number") pieces.push("limit " + formatQuotaValue(quota, quota.limit));
        if (quota.resetAt) pieces.push("resets " + quota.resetAt);
        return pieces.join(" — ");
      }

      async function renderSnapshot(card, provider) {
        const status = append(card, "p", "Snapshot: loading…", "status");
        try {
          const response = await fetch("/api/providers/" + encodeURIComponent(provider.id) + "/snapshot");
          if (!response.ok) throw new Error("Snapshot unavailable");
          const { snapshot } = await response.json();
          status.className = "status " + snapshot.connection;
          status.textContent = "Snapshot: " + snapshot.connection + " at " + snapshot.observedAt;

          if (snapshot.quotas?.length) {
            const quotas = document.createElement("ul");
            for (const quota of snapshot.quotas) append(quotas, "li", formatQuota(quota));
            card.append(quotas);
          }

          for (const warning of snapshot.warnings ?? []) append(card, "p", warning, "warning");
        } catch (error) {
          status.className = "status error";
          status.textContent = error instanceof Error ? error.message : "Snapshot unavailable";
        }
      }

      async function load() {
        refreshButton.disabled = true;
        messageElement.textContent = "Reading live Pi provider configuration…";
        providersElement.replaceChildren();

        try {
          const response = await fetch("/api/providers");
          if (!response.ok) throw new Error("Provider registry is unavailable");
          const { providers } = await response.json();

          await Promise.all(providers.map(async (provider) => {
            const card = document.createElement("article");
            card.className = "card";
            append(card, "h2", provider.id);
            append(card, "p", provider.models.length + " configured models", "status");
            providersElement.append(card);
            await renderSnapshot(card, provider);
          }));

          messageElement.textContent = providers.length + " configured providers. Live snapshots are rendered when account API connectors are available.";
        } catch (error) {
          messageElement.textContent = error instanceof Error ? error.message : "Unable to load providers.";
        } finally {
          refreshButton.disabled = false;
        }
      }

      refreshButton.addEventListener("click", load);
      load();
    </script>
  </body>
</html>`;
