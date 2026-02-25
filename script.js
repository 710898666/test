const diagramEl = document.querySelector("#diagram");
const busLayerEl = document.querySelector("#bus-layer");
const propertyContentEl = document.querySelector("#property-content");
const statusHintEl = document.querySelector("#status-hint");
const addBlockBtn = document.querySelector("#add-block-btn");
const addPortBtn = document.querySelector("#add-port-btn");
const toggleConnectBtn = document.querySelector("#toggle-connect-btn");

const colors = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"];

const state = {
  blocks: [],
  buses: [],
  selected: null,
  connectMode: false,
  connectSourcePortId: null,
};

let serial = 1;
const uid = (prefix) => `${prefix}-${serial++}`;

const findBlockById = (id) => state.blocks.find((block) => block.id === id);

const findPortById = (id) => {
  for (const block of state.blocks) {
    const port = block.ports.find((item) => item.id === id);
    if (port) {
      return { block, port };
    }
  }

  return null;
};

const findBusById = (id) => state.buses.find((bus) => bus.id === id);

const normalizePinConnections = (bus) => {
  const usedSourcePins = new Set();
  const usedTargetPins = new Set();

  for (const net of bus.nets) {
    if (net.fromPinId) {
      if (usedSourcePins.has(net.fromPinId)) {
        net.fromPinId = null;
      } else {
        usedSourcePins.add(net.fromPinId);
      }
    }

    if (net.toPinId) {
      if (usedTargetPins.has(net.toPinId)) {
        net.toPinId = null;
      } else {
        usedTargetPins.add(net.toPinId);
      }
    }
  }
};

const getPortPosition = (block, port) => {
  const y = block.y + port.offsetY;

  if (port.side === "left") {
    return { x: block.x, y };
  }

  return { x: block.x + block.width, y };
};

const createDefaultBlock = () => {
  const id = uid("block");
  const block = {
    id,
    name: `Block_${state.blocks.length + 1}`,
    x: 80 + state.blocks.length * 240,
    y: 120,
    width: 200,
    ports: [],
  };

  state.blocks.push(block);
  select({ type: "block", id: block.id });
  render();
};

const createPort = (blockId) => {
  const block = findBlockById(blockId);

  if (!block) {
    return;
  }

  const index = block.ports.length;
  const side = index % 2 === 0 ? "left" : "right";
  const port = {
    id: uid("port"),
    name: `${block.name}_P${index + 1}`,
    side,
    offsetY: 35 + index * 30,
    pins: [
      { id: uid("pin"), name: "pin0", direction: "in" },
      { id: uid("pin"), name: "pin1", direction: "out" },
    ],
  };

  block.ports.push(port);
  select({ type: "port", id: port.id });
  render();
};

const select = (selection) => {
  state.selected = selection;
};

const getPortConnections = (portId) => state.buses.filter((bus) => bus.sourcePortId === portId || bus.targetPortId === portId);

const enterConnectMode = () => {
  state.connectMode = !state.connectMode;
  state.connectSourcePortId = null;
  toggleConnectBtn.textContent = state.connectMode ? "退出连接模式" : "进入连接模式";
  statusHintEl.textContent = state.connectMode
    ? "连接模式：先点击源 Port，再点击目标 Port（支持一连多）。"
    : "提示：拖动 Block 调整布局，点击元素查看属性。";
  render();
};

const connectPorts = (sourcePortId, targetPortId) => {
  if (sourcePortId === targetPortId) {
    return;
  }

  const exists = state.buses.some(
    (bus) => bus.sourcePortId === sourcePortId && bus.targetPortId === targetPortId,
  );

  if (exists) {
    return;
  }

  const sourceRef = findPortById(sourcePortId);
  const targetRef = findPortById(targetPortId);

  if (!sourceRef || !targetRef) {
    return;
  }

  const bus = {
    id: uid("bus"),
    name: `${sourceRef.port.name}_to_${targetRef.port.name}`,
    sourcePortId,
    targetPortId,
    attrs: {
      protocol: "custom",
      bandwidth: "1Gbps",
      note: "",
      color: colors[state.buses.length % colors.length],
    },
    nets: [],
  };

  state.buses.push(bus);
  autoMapPins(bus.id);
  select({ type: "bus", id: bus.id });
};

const autoMapPins = (busId) => {
  const bus = findBusById(busId);

  if (!bus) {
    return;
  }

  const sourceRef = findPortById(bus.sourcePortId);
  const targetRef = findPortById(bus.targetPortId);

  if (!sourceRef || !targetRef) {
    return;
  }

  const targetByName = new Map(targetRef.port.pins.map((pin) => [pin.name.trim().toLowerCase(), pin]));

  bus.nets = sourceRef.port.pins.map((sourcePin, idx) => {
    const matched = targetByName.get(sourcePin.name.trim().toLowerCase()) || targetRef.port.pins[idx] || null;
    return {
      id: uid("net"),
      name: `net_${sourcePin.name}`,
      fromPinId: sourcePin.id,
      toPinId: matched ? matched.id : null,
      attrs: {
        width: "1",
        type: "data",
        note: "",
      },
    };
  });

  normalizePinConnections(bus);
};


const getConnectionStats = (bus) => {
  const sourceRef = findPortById(bus.sourcePortId);
  const targetRef = findPortById(bus.targetPortId);

  if (!sourceRef || !targetRef) {
    return { connected: 0, total: 0, unconnectedSource: [], unconnectedTarget: [] };
  }

  const connectedNets = bus.nets.filter((net) => net.toPinId);
  const connectedSource = new Set(connectedNets.map((net) => net.fromPinId));
  const connectedTarget = new Set(connectedNets.map((net) => net.toPinId));

  const unconnectedSource = sourceRef.port.pins.filter((pin) => !connectedSource.has(pin.id));
  const unconnectedTarget = targetRef.port.pins.filter((pin) => !connectedTarget.has(pin.id));

  return {
    connected: connectedNets.length,
    total: Math.max(sourceRef.port.pins.length, targetRef.port.pins.length),
    unconnectedSource,
    unconnectedTarget,
  };
};

const render = () => {
  renderDiagram();
  renderProperties();
};

const renderDiagram = () => {
  diagramEl.querySelectorAll(".block, .port-chip, .port-label").forEach((item) => item.remove());
  busLayerEl.innerHTML = "";

  for (const block of state.blocks) {
    const blockEl = document.createElement("article");
    blockEl.className = `block${state.selected?.type === "block" && state.selected?.id === block.id ? " selected" : ""}`;
    blockEl.style.left = `${block.x}px`;
    blockEl.style.top = `${block.y}px`;
    blockEl.dataset.id = block.id;

    const header = document.createElement("div");
    header.className = "block-header";
    header.textContent = block.name;
    blockEl.append(header);

    const body = document.createElement("div");
    body.className = "block-body small";
    body.textContent = `${block.ports.length} ports`;
    blockEl.append(body);

    blockEl.addEventListener("click", (event) => {
      event.stopPropagation();
      select({ type: "block", id: block.id });
      renderProperties();
      renderDiagram();
    });

    enableDrag(header, block.id);

    diagramEl.append(blockEl);

    for (const port of block.ports) {
      const { x, y } = getPortPosition(block, port);
      const portEl = document.createElement("button");
      const connected = getPortConnections(port.id).length > 0;

      portEl.className = `port-chip${connected ? " connected" : ""}`;
      if (state.connectMode && state.connectSourcePortId === port.id) {
        portEl.classList.add("select-source");
      }

      if (state.connectMode && state.connectSourcePortId && state.connectSourcePortId !== port.id) {
        portEl.classList.add("select-target");
      }

      portEl.style.left = `${x}px`;
      portEl.style.top = `${y}px`;
      portEl.title = `${port.name} (${port.pins.length} pins)`;

      portEl.addEventListener("click", (event) => {
        event.stopPropagation();

        if (state.connectMode) {
          if (!state.connectSourcePortId) {
            state.connectSourcePortId = port.id;
          } else {
            connectPorts(state.connectSourcePortId, port.id);
            state.connectSourcePortId = port.id;
          }

          render();
          return;
        }

        select({ type: "port", id: port.id });
        render();
      });

      diagramEl.append(portEl);

      const label = document.createElement("div");
      label.className = "port-label";
      label.textContent = port.name;
      label.style.left = port.side === "left" ? `${x + 12}px` : `${x - 10}px`;
      label.style.top = `${y}px`;
      label.style.textAlign = port.side === "left" ? "left" : "right";
      if (port.side === "right") {
        label.style.transform = "translate(-100%, -50%)";
      }
      diagramEl.append(label);
    }
  }

  for (const bus of state.buses) {
    const sourceRef = findPortById(bus.sourcePortId);
    const targetRef = findPortById(bus.targetPortId);

    if (!sourceRef || !targetRef) {
      continue;
    }

    const sourcePos = getPortPosition(sourceRef.block, sourceRef.port);
    const targetPos = getPortPosition(targetRef.block, targetRef.port);
    const cx = (sourcePos.x + targetPos.x) / 2;
    const path = `M ${sourcePos.x} ${sourcePos.y} C ${cx} ${sourcePos.y}, ${cx} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", path);
    line.setAttribute("class", "bus-line");
    line.setAttribute("stroke", bus.attrs.color);
    line.style.pointerEvents = "stroke";
    line.style.cursor = "pointer";

    line.addEventListener("click", (event) => {
      event.stopPropagation();
      select({ type: "bus", id: bus.id });
      renderProperties();
    });

    busLayerEl.append(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(cx));
    text.setAttribute("y", String((sourcePos.y + targetPos.y) / 2 - 6));
    text.setAttribute("class", "bus-label");
    text.textContent = `${bus.name} (${bus.nets.filter((net) => net.toPinId).length}/${bus.nets.length})`;
    busLayerEl.append(text);
  }
};

const renderProperties = () => {
  propertyContentEl.innerHTML = "";

  if (!state.selected) {
    propertyContentEl.textContent = "请选择一个 Block / Port / Bus。";
    return;
  }

  if (state.selected.type === "block") {
    const block = findBlockById(state.selected.id);

    if (!block) {
      return;
    }

    const box = document.createElement("div");
    box.className = "section";
    box.innerHTML = `
      <h3>Block 属性</h3>
      <div class="field"><label>名称</label><input id="block-name" value="${block.name}" /></div>
      <div class="small">位置: (${Math.round(block.x)}, ${Math.round(block.y)})</div>
      <div class="row" style="margin-top:8px;"><button id="block-add-port">新增 Port</button></div>
    `;
    propertyContentEl.append(box);

    box.querySelector("#block-name").addEventListener("input", (event) => {
      block.name = event.target.value || "Unnamed_Block";
      renderDiagram();
    });

    box.querySelector("#block-add-port").addEventListener("click", () => createPort(block.id));
    return;
  }

  if (state.selected.type === "port") {
    const ref = findPortById(state.selected.id);

    if (!ref) {
      return;
    }

    const connectedBuses = getPortConnections(ref.port.id);
    const portBox = document.createElement("div");
    portBox.className = "section";
    portBox.innerHTML = `
      <h3>Port 属性</h3>
      <div class="field"><label>名称</label><input id="port-name" value="${ref.port.name}" /></div>
      <div class="field"><label>侧边</label>
        <select id="port-side"><option value="left">left</option><option value="right">right</option></select>
      </div>
      <div class="field"><label>Y 偏移</label><input id="port-offset" type="number" value="${ref.port.offsetY}" /></div>
      <div class="small">已连接 Bus 数量：${connectedBuses.length}</div>
    `;

    propertyContentEl.append(portBox);

    portBox.querySelector("#port-side").value = ref.port.side;
    portBox.querySelector("#port-name").addEventListener("input", (event) => {
      ref.port.name = event.target.value || "Unnamed_Port";
      renderDiagram();
    });
    portBox.querySelector("#port-side").addEventListener("change", (event) => {
      ref.port.side = event.target.value;
      renderDiagram();
    });
    portBox.querySelector("#port-offset").addEventListener("change", (event) => {
      ref.port.offsetY = Number(event.target.value) || 20;
      renderDiagram();
    });

    const pinSection = document.createElement("div");
    pinSection.className = "section";
    pinSection.innerHTML = "<h3>Pin 定义</h3>";

    const pinList = document.createElement("div");
    pinSection.append(pinList);

    const rebuildPins = () => {
      pinList.innerHTML = "";
      ref.port.pins.forEach((pin, index) => {
        const row = document.createElement("div");
        row.className = "row";
        row.style.marginBottom = "6px";
        row.innerHTML = `
          <input value="${pin.name}" data-role="name" />
          <select data-role="direction"><option value="in">in</option><option value="out">out</option><option value="inout">inout</option></select>
          <button class="danger" data-role="remove">删</button>
        `;
        row.querySelector('[data-role="direction"]').value = pin.direction;
        row.querySelector('[data-role="name"]').addEventListener("input", (event) => {
          pin.name = event.target.value || `pin${index}`;
          renderDiagram();
        });
        row.querySelector('[data-role="direction"]').addEventListener("change", (event) => {
          pin.direction = event.target.value;
        });
        row.querySelector('[data-role="remove"]').addEventListener("click", () => {
          ref.port.pins.splice(index, 1);
          state.buses.forEach((bus) => {
            bus.nets = bus.nets.filter((net) => net.fromPinId !== pin.id && net.toPinId !== pin.id);
          });
          rebuildPins();
          render();
        });
        pinList.append(row);
      });
    };

    rebuildPins();

    const addPinBtn = document.createElement("button");
    addPinBtn.textContent = "新增 Pin";
    addPinBtn.addEventListener("click", () => {
      ref.port.pins.push({ id: uid("pin"), name: `pin${ref.port.pins.length}`, direction: "in" });
      rebuildPins();
      renderDiagram();
    });
    pinSection.append(addPinBtn);
    propertyContentEl.append(pinSection);

    if (connectedBuses.length) {
      const linked = document.createElement("div");
      linked.className = "section";
      linked.innerHTML = `<h3>关联 Bus</h3>${connectedBuses
        .map((bus) => `<button data-bus-id="${bus.id}" style="margin:3px;">${bus.name}</button>`)
        .join("")}`;
      linked.querySelectorAll("button[data-bus-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          select({ type: "bus", id: btn.dataset.busId });
          renderProperties();
        });
      });
      propertyContentEl.append(linked);
    }

    return;
  }

  if (state.selected.type === "bus") {
    const bus = findBusById(state.selected.id);

    if (!bus) {
      return;
    }

    const sourceRef = findPortById(bus.sourcePortId);
    const targetRef = findPortById(bus.targetPortId);

    if (!sourceRef || !targetRef) {
      return;
    }
    const sourceSelectOptions = ["<option value=''>--未连接--</option>"]
      .concat(sourceRef.port.pins.map((pin) => `<option value='${pin.id}'>${pin.name}</option>`))
      .join("");
    const targetSelectOptions = ["<option value=''>--未连接--</option>"]
      .concat(targetRef.port.pins.map((pin) => `<option value='${pin.id}'>${pin.name}</option>`))
      .join("");

    const basic = document.createElement("div");
    basic.className = "section";
    basic.innerHTML = `
      <h3>Bus 基础属性</h3>
      <div class="field"><label>名称</label><input id="bus-name" value="${bus.name}" /></div>
      <div class="field"><label>协议</label><input id="bus-protocol" value="${bus.attrs.protocol}" /></div>
      <div class="field"><label>带宽</label><input id="bus-bandwidth" value="${bus.attrs.bandwidth}" /></div>
      <div class="field"><label>颜色</label><input id="bus-color" value="${bus.attrs.color}" /></div>
      <div class="field"><label>备注</label><textarea id="bus-note">${bus.attrs.note}</textarea></div>
      <div class="small">${sourceRef.block.name}.${sourceRef.port.name} ➜ ${targetRef.block.name}.${targetRef.port.name}</div>
      <div class="row" style="margin-top:8px;"><button id="bus-auto-map">按 Pin 名自动匹配</button><button id="bus-delete" class="danger">删除 Bus</button></div>
    `;
    propertyContentEl.append(basic);

    basic.querySelector("#bus-name").addEventListener("input", (event) => {
      bus.name = event.target.value || "Unnamed_Bus";
      renderDiagram();
    });
    basic.querySelector("#bus-protocol").addEventListener("input", (event) => {
      bus.attrs.protocol = event.target.value;
    });
    basic.querySelector("#bus-bandwidth").addEventListener("input", (event) => {
      bus.attrs.bandwidth = event.target.value;
    });
    basic.querySelector("#bus-color").addEventListener("input", (event) => {
      bus.attrs.color = event.target.value || "#60a5fa";
      renderDiagram();
    });
    basic.querySelector("#bus-note").addEventListener("input", (event) => {
      bus.attrs.note = event.target.value;
    });
    basic.querySelector("#bus-auto-map").addEventListener("click", () => {
      autoMapPins(bus.id);
      render();
    });
    basic.querySelector("#bus-delete").addEventListener("click", () => {
      state.buses = state.buses.filter((item) => item.id !== bus.id);
      state.selected = null;
      render();
    });

    const stats = getConnectionStats(bus);
    const statSection = document.createElement("div");
    statSection.className = "section";
    statSection.innerHTML = `
      <h3>连接概览</h3>
      <div class="badges">
        <span class="badge ok">已连接: ${stats.connected}</span>
        <span class="badge warn">未连接源 Pin: ${stats.unconnectedSource.length}</span>
        <span class="badge warn">未连接目标 Pin: ${stats.unconnectedTarget.length}</span>
      </div>
      <div class="small">源未连: ${stats.unconnectedSource.map((pin) => pin.name).join(", ") || "无"}</div>
      <div class="small">目标未连: ${stats.unconnectedTarget.map((pin) => pin.name).join(", ") || "无"}</div>
    `;
    propertyContentEl.append(statSection);

    const netSection = document.createElement("div");
    netSection.className = "section";
    netSection.innerHTML = "<h3>Pin-to-Pin 连接管理</h3>";

    const table = document.createElement("table");
    table.className = "net-table";
    table.innerHTML = `
      <thead>
        <tr><th>Net 名称</th><th>源 Pin</th><th>目标 Pin</th><th>位宽</th><th>类型</th><th>备注</th><th>操作</th></tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    const renderNetRows = () => {
      tbody.innerHTML = "";

      for (const net of bus.nets) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td><input data-key="name" value="${net.name}" /></td>
          <td><select data-key="fromPinId">${sourceSelectOptions}</select></td>
          <td><select data-key="toPinId">${targetSelectOptions}</select></td>
          <td><input data-key="width" value="${net.attrs.width}" /></td>
          <td>
            <select data-key="type">
              <option value="data">data</option>
              <option value="ctrl">ctrl</option>
              <option value="clock">clock</option>
              <option value="power">power</option>
            </select>
          </td>
          <td><input data-key="note" value="${net.attrs.note}" /></td>
          <td><button class="danger" data-key="delete">删</button></td>
        `;

        const sourceSelect = tr.querySelector('select[data-key="fromPinId"]');
        const targetSelect = tr.querySelector('select[data-key="toPinId"]');
        sourceSelect.value = net.fromPinId || "";
        targetSelect.value = net.toPinId || "";
        tr.querySelector('select[data-key="type"]').value = net.attrs.type;

        tr.querySelector('input[data-key="name"]').addEventListener("input", (event) => {
          net.name = event.target.value;
          renderDiagram();
        });
        sourceSelect.addEventListener("change", (event) => {
          const nextPinId = event.target.value || null;
          const conflict = bus.nets.find((item) => item.id !== net.id && item.fromPinId === nextPinId);

          if (conflict && nextPinId) {
            conflict.fromPinId = null;
            statusHintEl.textContent = "已将该源 Pin 从其它 Net 挤出，并分配到当前 Net。";
          }

          net.fromPinId = nextPinId;
          normalizePinConnections(bus);
          render();
        });
        targetSelect.addEventListener("change", (event) => {
          const nextPinId = event.target.value || null;
          const conflict = bus.nets.find((item) => item.id !== net.id && item.toPinId === nextPinId);

          if (conflict && nextPinId) {
            conflict.toPinId = null;
            statusHintEl.textContent = "已将该目标 Pin 从其它 Net 挤出，并分配到当前 Net。";
          }

          net.toPinId = nextPinId;
          normalizePinConnections(bus);
          render();
        });
        tr.querySelector('input[data-key="width"]').addEventListener("input", (event) => {
          net.attrs.width = event.target.value;
        });
        tr.querySelector('select[data-key="type"]').addEventListener("change", (event) => {
          net.attrs.type = event.target.value;
        });
        tr.querySelector('input[data-key="note"]').addEventListener("input", (event) => {
          net.attrs.note = event.target.value;
        });
        tr.querySelector('button[data-key="delete"]').addEventListener("click", () => {
          bus.nets = bus.nets.filter((item) => item.id !== net.id);
          render();
        });

        tbody.append(tr);
      }
    };

    renderNetRows();

    const addNetBtn = document.createElement("button");
    addNetBtn.textContent = "新增 Net";
    addNetBtn.style.marginTop = "8px";
    addNetBtn.addEventListener("click", () => {
      const sourcePin = sourceRef.port.pins.find((pin) => !bus.nets.some((net) => net.fromPinId === pin.id));
      bus.nets.push({
        id: uid("net"),
        name: `net_${bus.nets.length}`,
        fromPinId: sourcePin ? sourcePin.id : sourceRef.port.pins[0]?.id ?? null,
        toPinId: null,
        attrs: { width: "1", type: "data", note: "" },
      });
      normalizePinConnections(bus);
      render();
    });

    netSection.append(table, addNetBtn);
    propertyContentEl.append(netSection);
  }
};

const enableDrag = (handleEl, blockId) => {
  handleEl.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    const block = findBlockById(blockId);

    if (!block) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = block.x;
    const originY = block.y;

    const onMove = (moveEvent) => {
      block.x = Math.max(10, originX + moveEvent.clientX - startX);
      block.y = Math.max(10, originY + moveEvent.clientY - startY);
      renderDiagram();
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
};

diagramEl.addEventListener("click", () => {
  state.selected = null;
  render();
});

addBlockBtn.addEventListener("click", createDefaultBlock);
addPortBtn.addEventListener("click", () => {
  if (state.selected?.type === "block") {
    createPort(state.selected.id);
    return;
  }

  statusHintEl.textContent = "请先选中一个 Block，再新增 Port。";
});
toggleConnectBtn.addEventListener("click", enterConnectMode);

createDefaultBlock();
createDefaultBlock();
createPort(state.blocks[0].id);
createPort(state.blocks[0].id);
createPort(state.blocks[1].id);
createPort(state.blocks[1].id);
render();
