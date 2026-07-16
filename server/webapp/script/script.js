let autorunComponent = null;
let selectedBSSID = null;
let selectedSSID = null;
let interfacesCache = {};

let rssiGraphique,
  rateGraphique,
  latencyGraphique,
  BWGraphique,
  BTGraphique,
  wifiSSE;

function showTab(name, el) {
  document
    .querySelectorAll(".content")
    .forEach((c) => c.classList.remove("active"));
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));

  document.getElementById(name).classList.add("active");
  el.classList.add("active");

  if (name !== "scan_zone") {
    const bssidPanel = document.getElementById("bssid-panel");
    const wifiMonitor = document.getElementById("wifi-monitor");
    const ssid_table = document.getElementById("ssid-table");

    if (bssidPanel) bssidPanel.style.display = "none";
    if (wifiMonitor) wifiMonitor.style.display = "none";
    if (ssid_table) ssid_table.style.display = "none";
  }
}

function initialisationGraphique() {
  const Options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    scales: {
      x: { display: false },
      y: {
        ticks: { color: "#8b949e" },
        grid: { color: "#21262d", borderColor: "#21262d" },
      },
    },
    plugins: {
      legend: {
        labels: { color: "#c9d1d9" },
      },
      tooltip: {
        mode: "index",
        intersect: false,
      },
    },
  };

  rssiGraphique = new Chart(document.getElementById("rssiGraph"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "RSSI",
          data: [],
          borderColor: "#58a6ff",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
      ],
    },
    options: Options,
  });

  rateGraphique = new Chart(document.getElementById("rateGraph"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "RX",
          data: [],
          borderColor: "#3fb950",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
        {
          label: "TX",
          data: [],
          borderColor: "#d29922",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
      ],
    },
    options: Options,
  });

  latencyGraphique = new Chart(document.getElementById("latencyGraph"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Latence",
          data: [],
          borderColor: "#f85149",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
      ],
    },
    options: Options,
  });

  BWGraphique = new Chart(document.getElementById("BWGraph"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Estimated Tx Bandwidth",
          data: [],
          borderColor: "#f85149",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
        {
          label: "Estimated Rx Bandwidth",
          data: [],
          borderColor: "#00630B",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
      ],
    },
    options: Options,
  });

  BTGraphique = new Chart(document.getElementById("BTGraph"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Busy Time",
          data: [],
          borderColor: "#FFFFFF",
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          fill: false,
        },
      ],
    },
    options: Options,
  });
}

function updateStatus() {
  const sonde = getSelectedHost();
  if (!sonde) return;

  const infoBox = document.getElementById("wireless-info-box");

  document
    .querySelectorAll("span[id^='ws_']")
    .forEach((e) => (e.textContent = "-"));
  document.getElementById("ip_add_status").textContent = "-";
  document.getElementById("ip_gw_status").textContent = "-";
  document.getElementById("ws_status").textContent = "Loading...";
  infoBox.style.display = "block";

  getWirelessStatus()
    .then((status) => {
      if (!status) {
        document.getElementById("ws_status").textContent = "Not connected";
        document.getElementById("ws_status").className = "value";
        return;
      }

      console.log(status);
      document.getElementById("ws_status").textContent = status.status;

      if (status.status != "Not connected") {
        document.getElementById("ws_status").className = "value success";
        document.getElementById("ws_ssid").textContent = status.SSID;
        document.getElementById("ws_bssid").textContent = status.BSSID;
        document.getElementById("ws_signal").textContent = status.SIGNAL;
        document.getElementById("ws_freq").textContent =
          status.FREQ == undefined ? "" : `${status.FREQ} MHz`;
        document.getElementById("ip_add_status").textContent = status.IPA;
        document.getElementById("ip_gw_status").textContent = status.IPR;
      } else {
        document.getElementById("ws_status").className = "value failure";
      }
    })
    .catch((error) => {
      console.error("Erreur récupération statut:", error);
    });
}

function reset() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  const resetBtn = document.getElementById("reset-btn");
  resetBtn.disabled = true;

  document.getElementById("ws_status").textContent = "Resetting...";
  document.getElementById("ws_status").className = "value";
  document
    .querySelectorAll("span[id^='ws_']")
    .forEach((e) => (e.textContent = "-"));

  document
    .querySelectorAll("span[id^='ip_']")
    .forEach((e) => (e.textContent = "-"));

  fetch("/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: sonde, interface: interface }),
  })
    .then(() => {
      document.getElementById("asso-btn").disabled = false;
      document.getElementById("dhcp-btn").disabled = true;
      document.getElementById("wm-btn").disabled = true;

      document
        .querySelectorAll("span[id^='bssid_']")
        .forEach((e) => (e.textContent = "-"));

      const wm = document.getElementById("wifi-monitor");
      const bp = document.getElementById("bssid-panel");
      const bt = document.getElementById("ssid-table");

      if (wm) wm.style.display = "none";
      if (bp) bp.style.display = "none";
      if (bt) bt.style.display = "none";

      selectedBSSID = null;
      document.getElementById("selected-bssid").textContent = "--";

      if (wifiSSE) {
        wifiSSE.close();
        wifiSSE = null;
      }

      updateStatus();
    })
    .catch((err) => {
      console.error("Erreur lors du reset:", err);
      document.getElementById("ws_status").textContent = "Error";
      document.getElementById("ws_status").className = "value failure";
    })
    .finally(() => {
      resetBtn.disabled = false;
    });
}

async function getWirelessStatus() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface || !selectedBSSID) return;

  const response = await fetch(
    `/wifi/status?host=${sonde}&interface=${interface}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    },
  );

  const json = await response.json();
  const data = json.results;

  return data;
}

function WifiMonitoring() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  document.getElementById("wifi-monitor").style.display = "block";

  if (!rssiGraphique) initialisationGraphique();
  if (wifiSSE) wifiSSE.close();

  const intervalle = document.getElementById("wifi_monitoring_interval").value;

  console.log(intervalle);

  wifiSSE = new EventSource(
    `/wifi/monitor/start?interval=${intervalle}&host=${sonde}&interface=${interface}`,
  );

  wifiSSE.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.service !== "WirelessInfo") return;

    document.getElementById("rssiValeur").textContent = `${data.RSSI} dBm`;
    document.getElementById("rateValeur").textContent =
      `Rx :  ${data.DTMR} Mbps / Tx :  ${data.DTME} Mbps`;

    document.getElementById("latencyValeur").textContent = `${data.LAT} ms`;

    document.getElementById("BTValeur").textContent = `${data.BT}`;
    document.getElementById("Estimated_BW").textContent =
      `Rx :  ${data.EBD} Mbps / Tx :  ${data.EBU} Mbps`;

    majDonnees(rssiGraphique, data.RSSI);
    majDonnees(rateGraphique, data.DTMR, data.DTME);
    majDonnees(latencyGraphique, data.LAT);
    majDonnees(BTGraphique, data.BT);
    majDonnees(BWGraphique, data.EBU, data.EBD);
  };
}

function StopWifiMonitoring() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  fetch("/wifi/monitor/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: sonde }),
  }).then(() => {
    const wm = document.getElementById("wifi-monitor");

    if (wm) wm.style.display = "none";

    if (wifiSSE) wifiSSE.close();
  });
}

let scanResultats = [];
let triActuel = { col: "signal", ordre: "desc" };

function afficherTableauScan() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  scanResultats.forEach((r) => {
    const tr = document.createElement("tr");
    tr.classList.add("scan-row");

    const val = parseInt(r.signal);
    let colorClass = "bad";
    if (val >= -65) colorClass = "good";
    else if (val >= -75) colorClass = "medium";

    tr.innerHTML = `
      <td>${r.ssid || "-"}</td>
      <td class="bssid-cell">${r.bssid}</td>
      <td class="${colorClass}"><strong>${r.signal}</strong></td>
    `;

    tr.onclick = (e) => selectBSSID(r.ssid, r.bssid, e);
    tbody.appendChild(tr);
  });

  document.getElementById("ssid-table").style.display = "table";
}

function trierTableau(colonne) {
  if (triActuel.col === colonne) {
    triActuel.ordre = triActuel.ordre === "asc" ? "desc" : "asc";
  } else {
    triActuel.col = colonne;
    triActuel.ordre = "asc";
    if (colonne === "signal") triActuel.ordre = "desc";
  }

  scanResultats.sort((a, b) => {
    let valA = a[colonne];
    let valB = b[colonne];

    if (colonne === "signal") {
      valA = parseInt(valA);
      valB = parseInt(valB);
    } else {
      valA = (valA || "").toLowerCase();
      valB = (valB || "").toLowerCase();
    }

    if (valA < valB) return triActuel.ordre === "asc" ? -1 : 1;
    if (valA > valB) return triActuel.ordre === "asc" ? 1 : -1;
    return 0;
  });

  afficherTableauScan();
}

function scan() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  const scanZone = document.getElementById("scan_zone");
  const scanBtn = document.getElementById("scan-btn");

  scanZone.classList.add("loading");
  scanBtn.disabled = true;

  const signal = document.getElementById("signal").value;

  fetch("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signal: signal, host: sonde, interface: interface }),
  })
    .then((r) => r.json())
    .then((data) => {
      const tbody = document.getElementById("tbody");
      tbody.innerHTML = "";

      if (data.results) {
        scanResultats = data.results;
        trierTableau(triActuel.col);
      } else {
        scanResultats = [];
        afficherTableauScan();
      }
    })
    .catch((error) => {
      console.error("Erreur de scan:", error);
      alert("Erreur lors du scan.");
    })
    .finally(() => {
      scanZone.classList.remove("loading");
      scanBtn.disabled = false;
    });
}

function resetSpeedtest() {
  document
    .querySelectorAll("span[id^='speedtest_']")
    .forEach((e) => (e.textContent = "-"));
}

async function speedtest() {
  document.getElementById("speedtest_zone").classList.add("loading");
  document.getElementById("spdt-btn").disabled = true;

  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  const bw_type = document.getElementById("bw_type").value;

  if (bw_type == "iperf3") {
    const bwt_target = document.getElementById("bw_iperf_target").value;
    if (!bwt_target) {
      alert("Please, specify an IP address for the iperf3 server.");
      document.getElementById("speedtest_zone").classList.remove("loading");
      document.getElementById("spdt-btn").disabled = false;

      return;
    }
  }

  const bwt_param = getSelectedBWT();
  if (!bwt_param) return;

  const status = await getWirelessStatus();
  if (status.status == "Not connected") {
    alert(
      "Please, go the BSSID Scan panel to associate and authenticate and request an IP address before starting a throuput test",
    );

    document.getElementById("speedtest_zone").classList.remove("loading");
    document.getElementById("spdt-btn").disabled = false;

    return;
  }

  fetch("/speedtest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bwp: bwt_param, host: sonde, interface: interface }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
      const etat = document.getElementById("speedtest_state");

      if (data.results.status == 0) {
        res = data.results;
        if (res.service == "BW_IPERF") {
          etat.textContent = "OK";
          etat.className = "success";

          const ul = document.getElementById("speedtest_ul");

          document.getElementById("speedtest_dl").textContent = res.DL;
          ul.textContent = res.UL;

          const infos = `
          <p>Jitter : <span id="speedtest_jit">${res.JIT}</span> ms</p>
          <p>Packet Loss : <span id="speedtest_pl">${res.PL}</span> %</p>`;

          ul.parentElement.insertAdjacentHTML("afterend", infos);
        } else if (res.service == "BW_SPDT") {
          etat.textContent = "OK";
          etat.className = "success";

          const ul = document.getElementById("speedtest_ul");

          document.getElementById("speedtest_dl").textContent = res.DL;
          ul.textContent = res.UL;

          const infos = `
          <p>Average downstream latency : <span id="speedtest_dl_iqm">${res.DLMIQ}</span> ms</p>
          <p>Average upstream latency : <span id="speedtest_ul_iqm">${res.ULMIQ}</span> ms</p>`;

          ul.parentElement.insertAdjacentHTML("afterend", infos);
        }
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("speedtest_zone").classList.remove("loading");
      document.getElementById("spdt-btn").disabled = false;
    });
}

function selectBSSID(ssid, bssid, event) {
  selectedBSSID = bssid;
  selectedSSID = ssid;

  document.getElementById("selected-bssid").textContent = bssid;
  document.getElementById("bssid-panel").style.display = "block";

  document
    .querySelectorAll(".scan-row")
    .forEach((r) => r.classList.remove("active"));
  if (event && event.currentTarget) event.currentTarget.classList.add("active");
}

function assoAuth() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  if (!selectedBSSID || !selectedSSID) {
    console.log("ssid or bssid missing");
    return;
  }

  document.getElementById("bssid-status").classList.add("loading");
  document.getElementById("asso-btn").disabled = true;

  fetch("/bssid/configuration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ssid: selectedSSID,
      bssid: selectedBSSID,
      host: sonde,
      interface: interface,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      fetch(`/bssid/events?host=${sonde}&interface=${interface}`, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.results.service === "BSSID_ASAU")
            handleBSSIDAssAuth(data.results);
        });
    });
}

function configuration() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  document.getElementById("configuration_zone").classList.add("loading");

  const creds = document.getElementById("cred_files");

  if (creds.files.length === 0) {
    alert(
      "Please select a configuration file for the association and authentication.",
    );
    return;
  }

  const formData = new FormData();
  formData.append("creds", creds.files[0]);
  formData.append("host", sonde);

  fetch("/bssid/configuration/send", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((response) => {
      document.getElementById("configuration_zone").classList.remove("loading");

      if (response.code === 200) {
        document.getElementById("cred_files_response").className = "success";
        document.getElementById("cred_files_response").textContent =
          response.status;
      } else {
        document.getElementById("cred_files_response").className = "failure";
        document.getElementById("cred_files_response").textContent =
          response.error;
      }
    });
}

function requestIP() {
  const sonde = getSelectedHost();
  const interface = getSelectedInterface();

  if (!sonde || !interface) return;

  if (!selectedBSSID) return;

  document.getElementById("ip-status").classList.add("loading");
  document.getElementById("dhcp-btn").disabled = true;

  fetch(`/ip/events?host=${sonde}&interface=${interface}`, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((data) => {
      data.results.forEach((resultat) => {
        console.log(resultat);
        switch (resultat.service) {
          case "DHCP":
            handleBSSIDDHCP(resultat);
            break;
          case "IPConfig":
            handleBSSIDIP(resultat);
            break;
        }
      });
    });
}

function handleBSSIDAssAuth(data) {
  document.getElementById("bssid-status").classList.remove("loading");

  document.getElementById("bssid_asau_time").textContent = data.duration;
  const stateEl = document.getElementById("bssid_asau_state");

  if (
    data.status === 0 ||
    data.status === 1 ||
    data.status === 2 ||
    data.status === 3
  ) {
    stateEl.textContent = "OK";
    stateEl.className = "success";

    document.getElementById("dhcp-btn").disabled = false;
  } else {
    stateEl.textContent = "Failed";
    stateEl.className = "failure";

    document.getElementById("asso-btn").disabled = false;
  }
}

function handleBSSIDDHCP(data) {
  document.getElementById("ip-status").classList.remove("loading");

  document.getElementById("bssid_dhcp_time").textContent = data.duration;
  const stateEl = document.getElementById("bssid_ip_state");
  if (data.status == 0) {
    stateEl.textContent = "OK";
    stateEl.className = "success";
    document.getElementById("dhcp-btn").disabled = true;
  } else {
    stateEl.textContent = "Failed";
    stateEl.className = "failure";
    document.getElementById("dhcp-btn").disabled = false;
  }
}

function handleBSSIDIP(data) {
  if (data.status == 0) {
    document.getElementById("bssid_ip_adress").textContent = data.address;
    document.getElementById("bssid_ip_gw").textContent = data.gateway;

    const stateEl = document.getElementById("bssid_ip_state");
    stateEl.textContent = "OK";
    stateEl.className = "success";

    document.getElementById("wm-btn").disabled = false;
  }
}

function majDonnees(chart, v1, v2 = null, v3 = null) {
  chart.data.labels.push("");
  chart.data.datasets[0].data.push(v1);

  if (v2 !== null && chart.data.datasets[1]) {
    chart.data.datasets[1].data.push(v2);
  }

  if (v3 !== null && chart.data.datasets[2]) {
    chart.data.datasets[2].data.push(v3);
  }

  if (chart.data.labels.length > 150) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((d) => d.data.shift());
  }

  chart.update("none");
}

function autorunData() {
  return {
    updates: [],
    evtSource: null,

    init() {
      autorunComponent = this;
      this.toggleInput("DNS", "dns_target_text");
      this.toggleInput("HTTP", "http_target_text");
      this.toggleInput("PING", "ping_target_text");
      document.getElementById("nb_ping").disabled =
        !document.getElementById("PING").checked;
    },

    autorunReset() {
      const sonde = getSelectedHost();
      const interface = getSelectedInterface();

      if (!sonde || !interface) return;

      fetch("/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: sonde, interface: interface }),
      });

      document.querySelectorAll(".step").forEach((s) => {
        s.classList.remove("loading");
        s.querySelectorAll("span[id^='autorun_']").forEach(
          (e) => (e.textContent = "-"),
        );
      });
    },

    closeSSE() {
      if (this.evtSource) {
        this.evtSource.close();
        this.evtSource = null;
      }
    },

    toggleInput(checkboxId, targetId) {
      const checkbox = document.getElementById(checkboxId);
      const target = document.getElementById(targetId);
      if (checkbox && target) {
        target.style.display = checkbox.checked ? "block" : "none";
      }
    },

    getAutorunConfig() {
      const sonde = getSelectedHost();
      const interface = getSelectedInterface();

      if (!sonde || !interface) return null;

      return {
        interval: document.getElementById("interval").value,
        signal_min: document.getElementById("signal_min").value,
        tx_power: document.getElementById("tx_power").value,
        dns: document.getElementById("DNS").checked,
        dns_target: document.getElementById("dns_target_text").value,
        http: document.getElementById("HTTP").checked,
        http_target: document.getElementById("http_target_text").value,
        ping: document.getElementById("PING").checked,
        nb_ping: document.getElementById("nb_ping").value,
        ping_target: document.getElementById("ping_target_text").value,
        ssid_autorun: document.getElementById("ssid_autorun").value,
        host: sonde,
        interface: interface,
      };
    },

    saveConfig() {
      const data = this.getAutorunConfig();
      if (!data) return;

      const saveBtn = document.getElementById("save-config-btn");
      const originalText = "Save Config";
      
      saveBtn.innerHTML = "Saving...";
      saveBtn.disabled = true;

      fetch("/autorun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      .then((res) => res.json())
      .then((response) => {
        if (response.status === "success") {
          saveBtn.innerHTML = "Saved!";
        } else {
          saveBtn.innerHTML = "Error";
          alert("Error saving configuration: " + response.message);
        }
      })
      .catch((err) => {
        console.error("Error saving config:", err);
        saveBtn.innerHTML = "Error";
        alert("Error saving configuration.");
      })
      .finally(() => {
        setTimeout(() => {
          saveBtn.innerHTML = originalText;
          saveBtn.disabled = false;
        }, 2000);
      });
    },

    startAutorun() {
      const data = this.getAutorunConfig();
      if (!data) return;

      document.querySelectorAll(".step").forEach((s) => {
        s.classList.remove("loading");
        s.querySelectorAll("span[id$='_state']").forEach(
          (e) => (e.textContent = "-"),
        );
      });

      console.log("Lancement Autorun...");

      document.getElementById("asau_zone").classList.add("loading");
      document.getElementById("autorun_state").textContent = "Running ...";

      if (this.evtSource) {
        this.evtSource.close();
      }

      this.updates = [];

      this.autorunReset();

      fetch("/autorun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(() => {
        this.initSSE();
      });
    },

    initSSE() {
      const sonde = getSelectedHost();
      const interface = getSelectedInterface();

      if (!sonde || !interface) return;

      this.evtSource = new EventSource(
        `/events?host=${sonde}&interface=${interface}`,
      );

      this.evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        this.routeEvent(data);
      };

      this.evtSource.addEventListener("end", (e) => {
        console.log("Test terminé !");
        this.evtSource.close();
        this.evtSource = null;

        document.getElementById("autorun_state").textContent = "Terminated";
      });

      this.evtSource.onerror = (err) => {
        console.error("Erreur SSE", err);
        this.evtSource.close();
      };
    },

    routeEvent(data) {
      console.log(data);
      switch (data.service) {
        case "ASAU":
          this.handleASAU(data);
          break;
        case "DHCP":
          this.handleDHCP(data);
          break;
        case "IPConfig":
          this.handleIP(data);
          break;
        case "ICMP":
          this.handlePING(data);
          break;
        case "DNS":
          this.handleDNS(data);
          break;
        case "HTTP":
          this.handleHTTP(data);
          break;
      }
    },

    handleASAU(data) {
      document.getElementById("asau_zone").classList.add("loading");

      document.getElementById("autorun_asau_bssid").textContent = data.bssid;
      document.getElementById("autorun_asau_time").textContent = data.duration;
      const etat = document.getElementById("autorun_asau_state");

      if (
        data.status === 0 ||
        data.status === 1 ||
        data.status === 2 ||
        data.status === 3
      ) {
        etat.textContent = "OK";
        etat.className = "success";

        document.getElementById("dhcp_zone").classList.add("loading");
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("asau_zone").classList.remove("loading");
    },

    handleDHCP(data) {
      document.getElementById("autorun_dhcp_time").textContent = data.duration;
      const etat = document.getElementById("autorun_dhcp_state");

      if (data.status === 0) {
        etat.textContent = "OK";
        etat.className = "success";

        document.getElementById("ip_zone").classList.add("loading");
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("dhcp_zone").classList.remove("loading");
    },

    handleIP(data) {
      document.getElementById("ip_zone").classList.remove("loading");

      document.getElementById("autorun_ip_adress").textContent = data.address;
      document.getElementById("autorun_ip_gw").textContent = data.gateway;

      if (document.getElementById("DNS").checked) {
        document.getElementById("dns_zone").classList.add("loading");
      } else if (document.getElementById("PING").checked) {
        document.getElementById("icmp_zone").classList.add("loading");
      } else if (document.getElementById("HTTP").checked) {
        document.getElementById("http_zone").classList.add("loading");
      }
    },

    handleDNS(data) {
      document.getElementById("dns_zone").classList.remove("loading");

      document.getElementById("autorun_dns_time").textContent = data.duration;
      const etat = document.getElementById("autorun_dns_state");

      if (data.status === 0) {
        etat.textContent = "OK";
        etat.className = "success";
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("autorun_dns_target").textContent =
        document.getElementById("dns_target_text").value;

      if (document.getElementById("PING").checked) {
        document.getElementById("icmp_zone").classList.add("loading");
      } else if (document.getElementById("HTTP").checked) {
        document.getElementById("http_zone").classList.add("loading");
      }
    },

    handlePING(data) {
      document.getElementById("icmp_zone").classList.remove("loading");

      const etat = document.getElementById("autorun_icmp_state");

      if (data.status === 0) {
        etat.textContent = "OK";
        etat.className = "success";

        document.getElementById("autorun_icmp_avg_latency").textContent =
          data.AVGL;
        document.getElementById("autorun_icmp_min_latency").textContent =
          data.MINL;
        document.getElementById("autorun_icmp_max_latency").textContent =
          data.MAXL;
        document.getElementById("autorun_icmp_packet_loss").textContent =
          data.RECV;
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("autorun_icmp_target").textContent =
        document.getElementById("ping_target_text").value;

      if (document.getElementById("HTTP").checked) {
        document.getElementById("http_zone").classList.add("loading");
      }
    },

    handleHTTP(data) {
      document.getElementById("http_zone").classList.remove("loading");

      document.getElementById("autorun_http_time").textContent = data.duration;
      const etat = document.getElementById("autorun_http_state");

      if (data.status === 0) {
        etat.textContent = "OK";
        etat.className = "success";
      } else {
        etat.textContent = "Failed";
        etat.className = "failure";
      }

      document.getElementById("autorun_http_target").textContent =
        document.getElementById("http_target_text").value;
    },

    signalClass(value) {
      if (value >= -70) return "good";
      if (value >= -80) return "medium";
      return "bad";
    },
  };
}

function getSelectedHost() {
  const host = document.getElementById("probe_select").value;
  if (!host) {
    alert("Please, select a probe.");
    return null;
  }
  return host;
}

function getSelectedInterface() {
  const iface = document.getElementById("probe_interface").value;
  if (
    !iface ||
    iface === "No data available" ||
    iface.includes("Probe Offline")
  ) {
    return null;
  }
  return iface;
}

function updateInterfaceSelect() {
  const hostSelect = document.getElementById("probe_select");
  const ifaceSelect = document.getElementById("probe_interface");
  const selectedHost = hostSelect.value;

  ifaceSelect.innerHTML = "";

  if (!selectedHost || !interfacesCache[selectedHost]) {
    const option = document.createElement("option");
    option.text = "No data available";
    ifaceSelect.add(option);
    return;
  }

  const interfaces = interfacesCache[selectedHost];

  if (
    interfaces.length === 1 &&
    (interfaces[0] === "UNREACHABLE" || interfaces[0] === "FAILED")
  ) {
    const option = document.createElement("option");
    option.text =
      interfaces[0] === "UNREACHABLE"
        ? "Probe Offline (Unreachable)"
        : "Script Failed";
    option.disabled = true;
    option.selected = true;
    ifaceSelect.add(option);
    ifaceSelect.disabled = true;
    return;
  }

  if (interfaces.length === 0) {
    const option = document.createElement("option");
    option.text = "No Wireless Interface found";
    ifaceSelect.add(option);
    ifaceSelect.disabled = true;
    return;
  }

  ifaceSelect.disabled = false;
  interfaces.forEach((iface) => {
    const option = document.createElement("option");
    option.value = iface;
    option.text = iface;
    ifaceSelect.add(option);
  });
}

function getSelectedBWT() {
  const bwt = document.getElementById("bw_type").value;

  if (!bwt) {
    alert("Please, select a throughput test type.");
    return null;
  }

  const bwt_target = document.getElementById("bw_iperf_target").value;

  if (bwt == "iperf3") {
    return {
      type: "iperf3",
      target: bwt_target,
    };
  } else {
    return {
      type: "speedtest",
    };
  }
}

function toggleStatusPanel() {
  const panel = document.getElementById("statusPanel");
  panel.classList.toggle("collapsed");
}

document.addEventListener("DOMContentLoaded", () => {
  const hostSelect = document.getElementById("probe_select");
  const ifaceSelect = document.getElementById("probe_interface");

  fetch("/hosts")
    .then((r) => r.json())
    .then((hosts) => {
      hostSelect.innerHTML = "";

      hosts.forEach((host) => {
        const option = document.createElement("option");
        option.value = host;
        option.text = host;
        hostSelect.add(option);
      });

      ifaceSelect.innerHTML = "<option>Loading interfaces...</option>";

      return fetch("/hosts/interfaces");
    })
    .then((r) => r.json())
    .then((data) => {
      console.log("Interfaces loaded:", data);
      interfacesCache = data;
      updateInterfaceSelect();
    })
    .catch((err) => {
      console.error("Error loading data:", err);
      hostSelect.innerHTML = "<option>Error loading hosts</option>";
      ifaceSelect.innerHTML = "<option>Error</option>";
    });

  hostSelect.addEventListener("change", updateInterfaceSelect);

  ["DNS", "HTTP", "PING"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.dispatchEvent(new Event("change"));
  });

  const bwSelect = document.getElementById("bw_type");
  const bwLabel = document.getElementById("bw_server");
  const bwInput = document.getElementById("bw_iperf_target");

  if (bwSelect) {
    function toggleIperfInput() {
      if (bwSelect.value === "iperf3") {
        bwInput.style.display = "block";
        bwLabel.style.display = "block";
      } else {
        bwInput.style.display = "none";
        bwLabel.style.display = "none";
      }
    }

    bwSelect.addEventListener("change", toggleIperfInput);
  }
});

document.getElementById("PING").addEventListener("change", function () {
  document.getElementById("nb_ping").disabled = !this.checked;
  const pingt = document.getElementById("ping_target_text");
  const pingn = document.getElementById("nb_ping");
  pingt.style.display = this.checked ? "block" : "none";
  pingn.style.display = this.checked ? "block" : "none";
});

document.getElementById("DNS").addEventListener("change", function () {
  let dnst = document.getElementById("dns_target_text");
  dnst.style.display = this.checked ? "block" : "none";
});

document.getElementById("HTTP").addEventListener("change", function () {
  let httpt = document.getElementById("http_target_text");
  httpt.style.display = this.checked ? "block" : "none";
});

document.getElementById("reset-btn").addEventListener("click", function () {
  reset();
});

document.addEventListener("DOMContentLoaded", () => {
  ["DNS", "HTTP", "PING"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const event = new Event("change");
      el.dispatchEvent(event);
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const bwSelect = document.getElementById("bw_type");
  const bwLabel = document.getElementById("bw_server");
  const bwInput = document.getElementById("bw_iperf_target");

  function toggleIperfInput() {
    if (bwSelect.value === "iperf3") {
      bwInput.style.display = "block";
      bwLabel.style.display = "block";
    } else {
      bwInput.style.display = "none";
      bwLabel.style.display = "none";
    }
  }

  bwSelect.addEventListener("change", toggleIperfInput);

  toggleIperfInput();
});

/* --- LOGIQUE DES INFOBULLES AUTOMATIQUES --- */
document.addEventListener("DOMContentLoaded", () => {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip-auto";
  document.body.appendChild(tooltip);

  const padding = 10; // Espace en pixels

  function showTooltip(e) {
    const target = e.target.closest("[data-tooltip]");
    if (!target) return;

    const text = target.getAttribute("data-tooltip");
    if (!text) return;

    tooltip.textContent = text;
    tooltip.classList.add("visible");

    updateTooltipPosition(target);
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
  }

  function updateTooltipPosition(target) {
    const rect = target.getBoundingClientRect();
    const tRect = tooltip.getBoundingClientRect();

    let top = rect.top - tRect.height - padding;
    let left = rect.left + rect.width / 2 - tRect.width / 2;

    if (top < 0) {
      top = rect.bottom + padding;
    }

    if (left < padding) {
      left = padding;
    }

    if (left + tRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tRect.width - padding;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  document.addEventListener("mouseover", showTooltip);

  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-tooltip]")) {
      hideTooltip();
    }
  });

  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
});
