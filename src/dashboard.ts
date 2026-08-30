export const dashboardPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>QuotaLens</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: #111217;
        color: #f5f5f7;
        --surface: #191b22;
        --border: #292c35;
        --muted: #a9abb8;
        --accent: #b8f44a;
        --warning: #ffd27d;
        --danger: #ff8b8b;
      }
      body { max-width: 1040px; margin: 0 auto; padding: clamp(1.5rem, 4vw, 3rem) 1.25rem; }
      header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -.04em; }
      header p, .muted { color: var(--muted); }
      button { min-height: 2.75rem; background: var(--accent); color: #172000; border: 0; border-radius: .6rem; padding: .6rem 1rem; font: inherit; font-weight: 750; cursor: pointer; }
      button:focus-visible { outline: 3px solid white; outline-offset: 3px; }
      button:disabled { cursor: wait; opacity: .65; }
      #message { min-height: 1.5rem; margin-bottom: 1rem; color: var(--muted); }
      .overview { margin-bottom: 1.5rem; padding: 1rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface); }
      .overview h2 { font-size: .8rem; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; }
      #active-providers { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
      .provider-pill { border-radius: 999px; padding: .35rem .65rem; background: #252931; color: var(--accent); font-size: .9rem; font-weight: 650; }
      .provider-pill span { color: var(--muted); font-weight: 500; }
      #providers { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .card { display: flex; flex-direction: column; gap: .75rem; min-height: 12rem; border: 1px solid var(--border); border-radius: .8rem; background: var(--surface); padding: 1rem; }
      .card-header { display: flex; justify-content: space-between; align-items: start; gap: .75rem; }
      .card h2 { font-size: 1.15rem; }
      .connection { flex: none; border-radius: 999px; padding: .22rem .5rem; font-size: .75rem; font-weight: 700; text-transform: capitalize; }
      .connected { color: #1b2600; background: var(--accent); }
      .unauthorized, .error { color: #341010; background: var(--danger); }
      .unsupported { color: #dadce3; background: #343741; }
      .quota-list { display: grid; gap: .75rem; }
      .quota { display: grid; gap: .35rem; }
      .quota-header, .quota-footer { display: flex; justify-content: space-between; gap: .75rem; font-size: .9rem; }
      .quota-header { color: #e6e7ec; font-weight: 650; }
      .quota-header span:last-child, .quota-footer { color: var(--muted); font-weight: 500; }
      .track { height: .45rem; overflow: hidden; border-radius: 999px; background: #323640; }
      .fill { height: 100%; border-radius: inherit; background: var(--accent); transition: width .2s ease; }
      .fill.warning { background: var(--warning); }
      .fill.danger { background: var(--danger); }
      .balance { color: #e6e7ec; font-size: .95rem; }
      .warning { color: var(--warning); font-size: .85rem; line-height: 1.35; }
      .empty { color: var(--muted); font-size: .9rem; }
    </style>
  </head>
  <body>
    <header>
      <div><h1>QuotaLens</h1><p>AI account availability, at a glance.</p></div>
      <button id="refresh" type="button">Refresh</button>
    </header>
    <p id="message" aria-live="polite">Loading configured providers…</p>
    <section class="overview" aria-labelledby="active-heading">
      <h2 id="active-heading">Active providers</h2>
      <div id="active-providers"><span class="muted">Checking account connections…</span></div>
    </section>
    <main id="providers" aria-label="Configured provider accounts"></main>
    <script type="module">
      const providersElement = document.querySelector("#providers");
      const activeProvidersElement = document.querySelector("#active-providers");
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
      function providerName(id) {
        return ({ zai: "Z.AI", qwen: "Alibaba / Qwen", "kimi-code-api": "Kimi Code", moonshot: "Moonshot", deepseek: "DeepSeek" })[id] || id;
      }
      function isLocal(provider) {
        try {
          const hostname = new URL(provider.baseUrl).hostname;
          return hostname === "localhost" || hostname === "127.0.0.1";
        } catch { return false; }
      }
      function number(value) { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value); }
      function resetText(value) {
        const reset = new Date(value);
        if (Number.isNaN(reset.getTime())) return "Reset time unavailable";
        const minutes = Math.round((reset.getTime() - Date.now()) / 60000);
        if (minutes <= 0) return "Resetting now";
        if (minutes < 60) return "Resets in " + minutes + "m";
        if (minutes < 1440) return "Resets in " + Math.round(minutes / 60) + "h";
        return "Resets in " + Math.round(minutes / 1440) + "d";
      }
      function quotaLabel(quota) {
        const label = quota.label.replace(/^Z\\.AI\\s+/i, "");
        if (label === "tokens 5h") return "5-hour window";
        if (label === "tokens 7d") return "Weekly window";
        if (label.startsWith("time")) return "Monthly tools";
        return label;
      }
      function usedPercent(quota) {
        if (typeof quota.used === "number" && typeof quota.limit === "number" && quota.limit > 0) return Math.max(0, Math.min(100, quota.used / quota.limit * 100));
        if (typeof quota.remaining === "number" && typeof quota.limit === "number" && quota.limit > 0) return Math.max(0, Math.min(100, 100 - quota.remaining / quota.limit * 100));
        return undefined;
      }
      function renderQuota(parent, quota) {
        const percent = usedPercent(quota);
        const item = document.createElement("section");
        item.className = "quota";
        const heading = document.createElement("div");
        heading.className = "quota-header";
        append(heading, "span", quotaLabel(quota));
        append(heading, "span", typeof quota.remaining === "number" && quota.unit === "percent" ? number(quota.remaining) + "% left" : "");
        item.append(heading);

        if (typeof percent === "number") {
          const track = document.createElement("div");
          track.className = "track";
          track.setAttribute("role", "progressbar");
          track.setAttribute("aria-label", quotaLabel(quota));
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", "100");
          track.setAttribute("aria-valuenow", String(Math.round(percent)));
          const fill = document.createElement("div");
          fill.className = "fill" + (percent >= 90 ? " danger" : percent >= 70 ? " warning" : "");
          fill.style.width = percent + "%";
          track.append(fill);
          item.append(track);
        }

        const footer = document.createElement("div");
        footer.className = "quota-footer";
        const usage = typeof quota.used === "number" ? number(quota.used) + (quota.unit === "percent" ? "% used" : " used") : "";
        append(footer, "span", usage);
        append(footer, "span", quota.resetAt ? resetText(quota.resetAt) : "");
        item.append(footer);
        parent.append(item);
      }
      function renderSnapshot(card, record) {
        const { provider, snapshot } = record;
        const header = document.createElement("div");
        header.className = "card-header";
        append(header, "h2", providerName(provider.id));
        append(header, "span", snapshot.connection, "connection " + snapshot.connection);
        card.append(header);

        if (snapshot.quotas?.length) {
          const quotas = document.createElement("div");
          quotas.className = "quota-list";
          for (const quota of snapshot.quotas) {
            if (quota.unit === "currency") append(quotas, "p", quota.label + ": " + number(quota.remaining ?? quota.used ?? 0), "balance");
            else renderQuota(quotas, quota);
          }
          card.append(quotas);
        } else {
          append(card, "p", snapshot.connection === "unsupported" ? "Account data is not available through an API yet." : "No account data returned.", "empty");
        }
        for (const warning of snapshot.warnings || []) append(card, "p", warning, "warning");
      }
      function renderActive(records) {
        activeProvidersElement.replaceChildren();
        const active = records.filter((record) => record.snapshot.connection === "connected");
        if (!active.length) {
          append(activeProvidersElement, "span", "No connected account APIs", "muted");
          return;
        }
        for (const record of active) {
          const pill = document.createElement("span");
          pill.className = "provider-pill";
          text(pill, providerName(record.provider.id) + " ");
          const detail = document.createElement("span");
          detail.textContent = record.snapshot.quotas.length ? record.snapshot.quotas.length + " limits" : "connected";
          pill.append(detail);
          activeProvidersElement.append(pill);
        }
      }
      async function load() {
        refreshButton.disabled = true;
        messageElement.textContent = "Refreshing provider status…";
        providersElement.replaceChildren();
        try {
          const response = await fetch("/api/providers");
          if (!response.ok) throw new Error("Provider registry is unavailable");
          const { providers } = await response.json();
          const remoteProviders = providers.filter((provider) => !isLocal(provider));
          const records = await Promise.all(remoteProviders.map(async (provider) => {
            try {
              const snapshotResponse = await fetch("/api/providers/" + encodeURIComponent(provider.id) + "/snapshot");
              if (!snapshotResponse.ok) throw new Error("Snapshot unavailable");
              return { provider, snapshot: (await snapshotResponse.json()).snapshot };
            } catch {
              return { provider, snapshot: { connection: "error", quotas: [], warnings: ["Snapshot unavailable."] } };
            }
          }));
          const visibleRecords = records.filter((record) => record.snapshot.connection !== "unsupported");
          visibleRecords.sort((left, right) => (left.snapshot.connection === "connected" ? -1 : 0) - (right.snapshot.connection === "connected" ? -1 : 0));
          renderActive(visibleRecords);
          for (const record of visibleRecords) {
            const card = document.createElement("article");
            card.className = "card";
            renderSnapshot(card, record);
            providersElement.append(card);
          }
          messageElement.textContent = visibleRecords.length + " provider accounts shown.";
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
