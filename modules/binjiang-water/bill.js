(() => {
  const [account, receiver, key] = ($argument || "").split("|");
  const store = "binjiang-water-panel:" + account;
  const configured = /^\d+$/.test(account) && /^https?:\/\/[^\s|/?#@]+\/?$/.test(receiver) && /^[a-f0-9]{64}$/i.test(key);
  let state = {};
  try { state = JSON.parse($persistentStore.read(store) || "{}"); } catch (_) {}
  if (typeof $response === "undefined") {
    const lines = state.bill ? [
      "账期  " + state.bill.month.slice(0, 4) + "-" + state.bill.month.slice(4),
      "用水量  " + state.bill.usage + " m³    总金额  ¥" + Number(state.bill.cost).toFixed(2)
    ] : [];
    lines.push("HA 同步  " + (configured ? state.status || "等待打开清单" : "请先配置模块"));
    return $done({title: "滨江水费", content: lines.join("\n"), icon: "drop.fill"});
  }
  if (!configured || $request.url.split("huhao=").pop() !== account) return $done({});
  function finish(status) {
    state.status = status;
    $persistentStore.write(JSON.stringify(state), store);
    $done({});
  }
  try {
    const match = /\bwaterfeeinfo\s*=\s*jQuery\.parseJSON\(\s*'((?:\\.|[^'\\])*)'/.exec($response.body);
    if (!match) return finish("失败 · 未读到账单");
    const {data} = JSON.parse(match[1].replace(/\\'/g, "'"));
    if (!Array.isArray(data) || !data.length || !data.every(row => String(row["户号"]) === account)) {
      return finish("失败 · 账单或户号不匹配");
    }
    const bills = data.map(row => ({month: String(row["月份"]), usage: row["水量"], cost: row["费用合计"]}));
    if (!bills.every(row => /^20\d\d(0[1-9]|1[012])$/.test(row.month) &&
        [row.usage, row.cost].every(value => /^\d+(\.\d{1,2})?$/.test(String(value))))) {
      return finish("失败 · 账单格式异常");
    }
    state.bill = bills.reduce((a, b) => a.month > b.month ? a : b);
    $httpClient.post({
      url: receiver.replace(/\/$/, "") + "/bills",
      headers: {"Content-Type": "application/json", Authorization: "Bearer " + key},
      body: JSON.stringify({bills}), timeout: 10
    }, (error, response, body) => {
      if (error || !response) return finish("失败 · 连接 NAS 失败");
      if (Number(response.status) !== 200) return finish("失败 · HTTP " + response.status);
      let ack;
      try { ack = JSON.parse(body); } catch (_) {}
      if (ack?.verified !== bills.length || !Number.isInteger(ack.changed) || ack.changed < 0 || ack.changed > bills.length) {
        return finish("失败 · 未收到 HA 核对结果");
      }
      finish(ack.changed ? "成功 · 已更新" : "成功 · 账单已一致");
    });
  } catch (_) {
    finish("失败 · 无法读取清单");
  }
})();
