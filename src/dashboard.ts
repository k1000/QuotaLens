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
      h2 { margin: 0 0 .4rem; font-size: 1.1rem; } .status { color: #a9abb8; font-size: .9rem; } ul { margin: .75rem 0 0; padding-left: 1.25rem; color: #d4d5db; }
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

      async function load() {
        refreshButton.disabled = true;
        messageElement.textContent = "Reading live Pi provider configuration…";
        providersElement.replaceChildren();

        try {
          const response = await fetch("/api/providers");
          if (!response.ok) throw new Error("Provider registry is unavailable");
          const { providers } = await response.json();

          for (const provider of providers) {
            const card = document.createElement("article");
            card.className = "card";
            append(card, "h2", provider.id);
            append(card, "p", "Account API connector: pending", "status");
            const models = document.createElement("ul");
            for (const model of provider.models) append(models, "li", model.name);
            card.append(models);
            providersElement.append(card);
          }

          messageElement.textContent = providers.length + " configured providers. Quota data appears as connectors are added.";
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
